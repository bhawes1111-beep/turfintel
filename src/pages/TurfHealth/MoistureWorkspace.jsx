import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  importMoistureReadings,
  useMoistureData,
} from '../../utils/moisture/moistureStore'
import { localTimestamp, parseTdrCsv } from '../../utils/moisture/tdrCsv'
import MoistureOverview from './MoistureOverview'
import styles from './MoistureWorkspace.module.css'

const VIEW_OPTIONS = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'map', label: 'Watering Map' },
  { id: 'import', label: 'Import TDR CSV' },
]

function observationDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA')
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function colorForValue(value, dryBelow, wetAbove) {
  if (value < dryBelow) return '#ef8f3c'
  if (value > wetAbove) return '#4387cc'
  return '#5aa45f'
}

function buildProjection(ring) {
  if (!ring?.length) return null
  const centerLat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length
  const lonScale = Math.cos(centerLat * Math.PI / 180)
  const meters = ring.map(point => ({ x: point[0] * lonScale, y: point[1] }))
  const minX = Math.min(...meters.map(point => point.x))
  const maxX = Math.max(...meters.map(point => point.x))
  const minY = Math.min(...meters.map(point => point.y))
  const maxY = Math.max(...meters.map(point => point.y))
  const width = Math.max(maxX - minX, Number.EPSILON)
  const height = Math.max(maxY - minY, Number.EPSILON)
  const scale = Math.min(82 / width, 82 / height)
  const contentWidth = width * scale
  const contentHeight = height * scale
  const offsetX = (100 - contentWidth) / 2
  const offsetY = (100 - contentHeight) / 2
  return (lat, lng) => ({
    x: offsetX + (lng * lonScale - minX) * scale,
    y: offsetY + (maxY - lat) * scale,
  })
}

export default function MoistureWorkspace({ canEdit }) {
  const [view, setView] = useState('monitor')
  const [features, setFeatures] = useState([])
  const [boundaryError, setBoundaryError] = useState('')
  const moisture = useMoistureData()

  useEffect(() => {
    let cancelled = false
    fetch('/data/crosswinds-greens.geojson')
      .then(response => {
        if (!response.ok) throw new Error(`Green boundaries returned ${response.status}`)
        return response.json()
      })
      .then(data => {
        if (!cancelled) setFeatures(Array.isArray(data.features) ? data.features : [])
      })
      .catch(error => {
        if (!cancelled) setBoundaryError(error.message)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className={styles.workspace}>
      <div className={styles.viewTabs} role="tablist" aria-label="Moisture tools">
        {VIEW_OPTIONS.map(option => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={view === option.id}
            className={view === option.id ? styles.viewTabActive : styles.viewTab}
            onClick={() => setView(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {view === 'monitor' && <MoistureOverview />}
      {view === 'map' && (
        <WateringMap
          observations={moisture.observations}
          loading={moisture.loading}
          features={features}
          boundaryError={boundaryError}
        />
      )}
      {view === 'import' && (
        <TdrCsvImporter
          features={features}
          boundaryError={boundaryError}
          canEdit={canEdit}
          onOpenMap={() => setView('map')}
        />
      )}
    </div>
  )
}

function WateringMap({ observations, loading, features, boundaryError }) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedGreen, setSelectedGreen] = useState('')
  const [dryBelow, setDryBelow] = useState(22)
  const [wetAbove, setWetAbove] = useState(28)

  const validObservations = useMemo(
    () => observations.filter(item => !item._pending && item.moisturePct != null && item.location),
    [observations],
  )
  const dates = useMemo(
    () => [...new Set(validObservations.map(item => observationDate(item.observedAt)).filter(Boolean))].sort().reverse(),
    [validObservations],
  )
  const activeDate = dates.includes(selectedDate) ? selectedDate : (dates[0] || '')

  const dayReadings = useMemo(
    () => validObservations.filter(item => observationDate(item.observedAt) === activeDate),
    [activeDate, validObservations],
  )
  const summaries = useMemo(() => {
    const grouped = new Map()
    for (const reading of dayReadings) {
      const list = grouped.get(reading.location) ?? []
      list.push(reading)
      grouped.set(reading.location, list)
    }
    return [...grouped.entries()].map(([green, readings]) => ({
      green,
      readings,
      average: readings.reduce((sum, reading) => sum + Number(reading.moisturePct), 0) / readings.length,
      dry: readings.filter(reading => Number(reading.moisturePct) < dryBelow).length,
    })).sort((left, right) => left.average - right.average)
  }, [dayReadings, dryBelow])

  const summaryNames = summaries.map(summary => summary.green)
  const activeGreen = summaryNames.includes(selectedGreen) ? selectedGreen : (summaryNames[0] || '')
  const selectedSummary = summaries.find(summary => summary.green === activeGreen)
  const selectedFeature = features.find(feature => feature.properties?.name === activeGreen)
  const ring = selectedFeature?.geometry?.coordinates?.[0] ?? []
  const project = useMemo(() => buildProjection(ring), [ring])
  const outline = project
    ? ring.map(point => project(point[1], point[0])).map(point => `${point.x},${point.y}`).join(' ')
    : ''
  const mapped = (selectedSummary?.readings ?? []).filter(reading => (
    Number.isFinite(Number(reading.lat)) && Number.isFinite(Number(reading.lng)) && project
  )).map(reading => ({ ...reading, point: project(Number(reading.lat), Number(reading.lng)) }))
  const driest = [...(selectedSummary?.readings ?? [])]
    .sort((left, right) => Number(left.moisturePct) - Number(right.moisturePct))
    .slice(0, 8)

  if (loading && observations.length === 0) return <p className={styles.empty}>Loading moisture readings...</p>

  return (
    <section className={styles.mapWorkspace}>
      <div className={styles.mapControls}>
        <label>
          Reading date
          <select value={activeDate} onChange={event => setSelectedDate(event.target.value)}>
            {dates.length === 0 && <option value="">No reading dates</option>}
            {dates.map(date => <option key={date} value={date}>{formatDate(date)}</option>)}
          </select>
        </label>
        <label>
          Green
          <select value={activeGreen} onChange={event => setSelectedGreen(event.target.value)}>
            {summaries.length === 0 && <option value="">No mapped greens</option>}
            {summaries.map(summary => (
              <option key={summary.green} value={summary.green}>{summary.green}</option>
            ))}
          </select>
        </label>
        <label>
          Dry below
          <input type="number" inputMode="decimal" step="0.1" value={dryBelow} onChange={event => setDryBelow(Number(event.target.value) || 0)} />
        </label>
        <label>
          Wet above
          <input type="number" inputMode="decimal" step="0.1" value={wetAbove} onChange={event => setWetAbove(Number(event.target.value) || 0)} />
        </label>
      </div>

      {boundaryError && <p className={styles.error}>Green boundary error: {boundaryError}</p>}
      {dates.length === 0 ? (
        <div className={styles.empty}>No moisture readings are available yet. Import a TDR CSV or log readings manually.</div>
      ) : (
        <>
          <div className={styles.mapLayout}>
            <div className={styles.mapPanel}>
              <div className={styles.mapHeader}>
                <div>
                  <span className={styles.eyebrow}>{activeDate ? formatDate(activeDate) : ''}</span>
                  <h3>{activeGreen || 'Choose a green'}</h3>
                </div>
                <div className={styles.mapMetrics}>
                  <strong>{selectedSummary ? `${selectedSummary.average.toFixed(1)}%` : '—'}</strong>
                  <span>{selectedSummary?.readings.length ?? 0} readings</span>
                </div>
              </div>
              {outline ? (
                <svg className={styles.greenMap} viewBox="0 0 100 100" role="img" aria-label={`${activeGreen} moisture map`}>
                  <rect x="0" y="0" width="100" height="100" className={styles.mapBackground} />
                  <polygon points={outline} className={styles.greenShape} />
                  {mapped.map((reading, index) => (
                    <g key={reading.id || `${reading.observedAt}-${index}`}>
                      <circle
                        cx={reading.point.x}
                        cy={reading.point.y}
                        r="3.2"
                        fill={colorForValue(Number(reading.moisturePct), dryBelow, wetAbove)}
                        className={styles.mapPoint}
                      >
                        <title>{`${Number(reading.moisturePct).toFixed(1)}% VWC · ${new Date(reading.observedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</title>
                      </circle>
                    </g>
                  ))}
                </svg>
              ) : (
                <div className={styles.mapMissing}>No Crosswinds outline is available for this location.</div>
              )}
              <div className={styles.legend}>
                <span><i className={styles.dryDot} />Dry</span>
                <span><i className={styles.targetDot} />Target</span>
                <span><i className={styles.wetDot} />Wet</span>
                <span>{mapped.length} GPS-positioned</span>
              </div>
            </div>

            <div className={styles.priorityPanel}>
              <h3>Watering priorities</h3>
              <p>Lowest moisture readings for the selected green.</p>
              {driest.length === 0 ? <div className={styles.empty}>No readings for this green.</div> : (
                <ol className={styles.priorityList}>
                  {driest.map((reading, index) => (
                    <li key={reading.id || `${reading.observedAt}-${index}`}>
                      <span className={styles.priorityRank}>{index + 1}</span>
                      <div>
                        <strong>{Number(reading.moisturePct).toFixed(1)}% VWC</strong>
                        <small>{new Date(reading.observedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{reading.lat == null ? ' · no GPS pin' : ''}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className={styles.greenSummary}>
            {summaries.map(summary => (
              <button
                key={summary.green}
                type="button"
                className={summary.green === activeGreen ? styles.greenSummaryActive : styles.greenSummaryButton}
                onClick={() => setSelectedGreen(summary.green)}
              >
                <span>{summary.green}</span>
                <strong>{summary.average.toFixed(1)}%</strong>
                <small>{summary.readings.length} readings · {summary.dry} dry</small>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function TdrCsvImporter({ features, boundaryError, canEdit, onOpenMap }) {
  const fileInput = useRef(null)
  const { user } = useAuth()
  const [parsed, setParsed] = useState(null)
  const [fileName, setFileName] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [rowFilter, setRowFilter] = useState('all')
  const [message, setMessage] = useState('Choose a Spectrum TDR 350 CSV to begin.')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const greenNames = useMemo(
    () => features.map(feature => feature.properties?.name).filter(Boolean),
    [features],
  )
  const dates = useMemo(
    () => [...new Set((parsed?.rows ?? []).map(row => row.record?.date).filter(Boolean))].sort().reverse(),
    [parsed],
  )
  const indexedRows = useMemo(
    () => (parsed?.rows ?? []).map((row, index) => ({ ...row, index })),
    [parsed],
  )
  const scopedRows = useMemo(
    () => indexedRows.filter(row => (
      !dateFilter || row.record?.date === dateFilter
    )),
    [dateFilter, indexedRows],
  )
  const readyRows = useMemo(
    () => scopedRows.filter(row => row.record?.green && row.record?.vwc != null && localTimestamp(row.record.date, row.record.time)),
    [scopedRows],
  )
  const importableRows = useMemo(
    () => indexedRows.filter(row => row.record?.green && row.record?.vwc != null && localTimestamp(row.record.date, row.record.time)),
    [indexedRows],
  )
  const reviewCount = scopedRows.filter(row => row.record && !row.record.green).length
  const invalidCount = scopedRows.filter(row => !row.record).length
  const shownRows = scopedRows.filter(row => {
    if (rowFilter === 'ready') return !!row.record?.green
    if (rowFilter === 'review') return !!row.record && !row.record.green
    if (rowFilter === 'invalid') return !row.record
    return true
  }).slice(0, 120)

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setResult(null)
    setParsed(null)
    setFileName(file.name)
    setMessage(`Reading ${file.name}...`)
    try {
      if (!features.length) throw new Error('Crosswinds green boundaries are still loading. Try again in a moment.')
      if (file.size > 16_000_000) throw new Error('File exceeds the 16 MB import limit.')
      const next = parseTdrCsv(await file.text(), file.name, features)
      setParsed(next)
      const nextDates = [...new Set(next.rows.map(row => row.record?.date).filter(Boolean))].sort().reverse()
      setDateFilter(nextDates[0] || '')
      setRowFilter('all')
      setMessage(`${next.rows.length.toLocaleString()} meter readings across ${nextDates.length.toLocaleString()} date${nextDates.length === 1 ? '' : 's'} detected. Review green assignments before importing.`)
    } catch (error) {
      setMessage(`Import preview failed: ${error.message}`)
    } finally {
      event.target.value = ''
    }
  }

  function assignGreen(index, green) {
    setParsed(current => {
      if (!current) return current
      const rows = current.rows.map((row, rowIndex) => (
        rowIndex === index && row.record
          ? { ...row, record: { ...row.record, green } }
          : row
      ))
      return { ...current, rows }
    })
  }

  async function approveImport() {
    if (!importableRows.length || busy) return
    const importDateCount = new Set(importableRows.map(row => row.record.date)).size
    setBusy(true)
    setResult(null)
    setMessage(`Importing ${importableRows.length.toLocaleString()} reviewed readings across all dates...`)
    try {
      const readings = importableRows.map(({ record }) => ({
        clientId: `tdr-usb:${record.importKey}`,
        observedAt: localTimestamp(record.date, record.time),
        observedBy: user?.name || user?.displayName || user?.email || null,
        location: record.green,
        moisturePct: record.vwc,
        lat: record.lat,
        lng: record.lng,
        notes: record.notes,
      }))
      const summary = await importMoistureReadings(readings)
      setResult(summary)
      setMessage(`Imported ${summary.inserted.toLocaleString()} new readings across ${importDateCount.toLocaleString()} date${importDateCount === 1 ? '' : 's'}. ${summary.skipped.toLocaleString()} duplicates were safely skipped.`)
    } catch (error) {
      setMessage(`Import failed: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit) {
    return <div className={styles.empty}>You have read-only access to moisture records. A manager can import TDR files.</div>
  }

  return (
    <section className={styles.importWorkspace}>
      <div className={styles.importHeader}>
        <div>
          <span className={styles.eyebrow}>SPECTRUM TDR 350</span>
          <h3>Import USB readings</h3>
          <p>Upload, review green assignments, approve, then save to the shared TurfIntel moisture log.</p>
        </div>
        <button type="button" className={styles.uploadButton} onClick={() => fileInput.current?.click()} disabled={!features.length || busy}>
          Choose CSV
        </button>
        <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={handleFile} hidden />
      </div>

      {boundaryError && <p className={styles.error}>Green boundary error: {boundaryError}</p>}
      <p className={styles.importMessage} role="status">{message}</p>

      {parsed && (
        <>
          <div className={styles.importControls}>
            <label>
              Review date
              <select value={dateFilter} onChange={event => setDateFilter(event.target.value)}>
                <option value="">All dates ({dates.length})</option>
                {dates.map(date => <option key={date} value={date}>{formatDate(date)}</option>)}
              </select>
            </label>
            <label>
              Show rows
              <select value={rowFilter} onChange={event => setRowFilter(event.target.value)}>
                <option value="all">All rows</option>
                <option value="ready">Ready</option>
                <option value="review">Needs review</option>
                <option value="invalid">Invalid</option>
              </select>
            </label>
          </div>
          <p className={styles.dateScopeNote}>
            This date only filters the review list. Approve imports all {importableRows.length.toLocaleString()} ready readings across every date in the CSV.
          </p>

          <div className={styles.importStats}>
            <div><strong>{scopedRows.length.toLocaleString()}</strong><span>Rows shown</span></div>
            <div><strong>{readyRows.length.toLocaleString()}</strong><span>Ready shown</span></div>
            <div><strong>{reviewCount.toLocaleString()}</strong><span>Needs review</span></div>
            <div><strong>{invalidCount.toLocaleString()}</strong><span>Invalid</span></div>
          </div>

          <div className={styles.reviewList}>
            {shownRows.map(row => {
              const record = row.record
              const hint = row.issue
                || (row.status === 'nearby' ? `${row.suggestion} is ${Math.round(row.distanceM)} m away` : '')
                || (row.status === 'outside' ? `${Math.round(row.distanceM)} m from ${row.suggestion}` : 'GPS inside green')
              return (
                <article key={`${row.line}-${row.index}`} className={styles.reviewRow}>
                  <div className={styles.reviewReading}>
                    <strong>{record ? `${record.vwc.toFixed(1)}%` : 'Invalid'}</strong>
                    <span>{record ? `${record.date} ${record.time}` : `CSV line ${row.line}`}</span>
                    <small>{record?.lat != null ? `${record.lat.toFixed(6)}, ${record.lng.toFixed(6)}` : 'No GPS position'}</small>
                  </div>
                  <label>
                    Green assignment
                    <select
                      value={record?.green || ''}
                      onChange={event => assignGreen(row.index, event.target.value)}
                      disabled={!record}
                    >
                      <option value="">Skip / unassigned</option>
                      {greenNames.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                  <span className={record && !record.green ? styles.reviewWarning : styles.reviewHint}>{hint}</span>
                </article>
              )
            })}
          </div>
          {scopedRows.length > shownRows.length && (
            <p className={styles.previewLimit}>Showing the first 120 matching rows. Filters and approved import counts include the full date.</p>
          )}

          <div className={styles.importActions}>
            <button type="button" className={styles.approveButton} onClick={approveImport} disabled={busy || importableRows.length === 0 || !!result}>
              {busy ? 'Importing...' : `Approve & Import All ${importableRows.length.toLocaleString()}`}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => { setParsed(null); setResult(null); setMessage('Preview discarded. No readings were changed.') }} disabled={busy}>
              Discard preview
            </button>
            {result && <button type="button" className={styles.secondaryButton} onClick={onOpenMap}>Open Watering Map</button>}
          </div>
          <p className={styles.fileNote}>{fileName} · Re-importing the same readings is safe; duplicates are skipped.</p>
        </>
      )}
    </section>
  )
}
