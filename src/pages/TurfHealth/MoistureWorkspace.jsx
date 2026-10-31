import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  importMoistureReadings,
  useMoistureData,
} from '../../utils/moisture/moistureStore'
import { localTimestamp, parseTdrCsv } from '../../utils/moisture/tdrCsv'
import {
  colorForFivePointValue,
  MOISTURE_ZONE_LABELS,
  TDR_ZONE_LABELS,
} from '../../utils/moisture/moistureDisplayConfig'
import { useMoistureDisplaySettings } from '../../utils/moisture/moistureDisplaySettings'
import { TDR_METRICS } from '../../utils/moisture/tdrMetrics'
import {
  buildGreenProjection,
  compareGreenNames,
  GREEN_AERIAL_VERSION,
  greenAerialFilename,
  groupGreenNames,
} from '../../utils/moisture/greenMaps'
import MoistureOverview from './MoistureOverview'
import styles from './MoistureWorkspace.module.css'

const VIEW_OPTIONS = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'pinpoints', label: 'Pinpoint Map' },
  { id: 'surface', label: 'Moisture Surface' },
]

const TDR_VIEW_OPTIONS = [
  { id: 'pinpoints', label: 'Pinpoint Map' },
  { id: 'surface', label: 'TDR Surface' },
]

const EMPTY_READINGS = []
const SURFACE_RESOLUTION = 240

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

function summaryTileStyle(color) {
  return {
    '--summary-tone': color,
    '--summary-tint': `${color}38`,
  }
}

function readingKey(reading, index = 0) {
  return reading.id || reading.clientId || `${reading.observedAt}-${reading.lat}-${reading.lng}-${index}`
}

function smoothClosedPath(ring, project) {
  if (!project || ring.length < 3) return ''
  const first = ring[0]
  const last = ring.at(-1)
  const source = ring.length > 3 && first[0] === last[0] && first[1] === last[1]
    ? ring.slice(0, -1)
    : ring
  const points = source.map(point => project(point[1], point[0]))
  const midpoint = (left, right) => ({
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  })
  const start = midpoint(points.at(-1), points[0])
  let path = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const next = points[(index + 1) % points.length]
    const end = midpoint(point, next)
    path += ` Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
  }
  return `${path} Z`
}

function numericValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function metricDisplayValue(metric, value) {
  return metric?.summary ? metric.summary(value) : value
}

function hexChannels(color) {
  const hex = String(color || '').replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return [90, 164, 95]
  return [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16))
}

function interpolatedScaleColor(value, scale) {
  if (value <= scale.points[0]) return hexChannels(scale.colors[0])
  const lastIndex = scale.points.length - 1
  if (value >= scale.points[lastIndex]) return hexChannels(scale.colors[lastIndex])
  for (let index = 1; index < scale.points.length; index += 1) {
    if (value > scale.points[index]) continue
    const lowerValue = scale.points[index - 1]
    const upperValue = scale.points[index]
    const ratio = (value - lowerValue) / (upperValue - lowerValue)
    const lower = hexChannels(scale.colors[index - 1])
    const upper = hexChannels(scale.colors[index])
    return lower.map((channel, channelIndex) => Math.round(channel + (upper[channelIndex] - channel) * ratio))
  }
  return hexChannels(scale.colors[lastIndex])
}

function createInterpolatedSurface(sampleSignature, polygonSignature, scaleSignature) {
  if (typeof document === 'undefined' || !sampleSignature || !polygonSignature) return ''
  const readings = sampleSignature.split('|').map(sample => {
    const [x, y, value] = sample.split(',').map(Number)
    return { point: { x, y }, value }
  })
  const polygon = polygonSignature.split('|').map(sample => {
    const [x, y] = sample.split(',').map(Number)
    return { x, y }
  })
  const scale = JSON.parse(scaleSignature)
  const canvas = document.createElement('canvas')
  canvas.width = SURFACE_RESOLUTION
  canvas.height = SURFACE_RESOLUTION
  const context = canvas.getContext('2d')
  if (!context) return ''

  const image = context.createImageData(SURFACE_RESOLUTION, SURFACE_RESOLUTION)
  for (let pixelY = 0; pixelY < SURFACE_RESOLUTION; pixelY += 1) {
    const y = (pixelY + .5) * 100 / SURFACE_RESOLUTION
    for (let pixelX = 0; pixelX < SURFACE_RESOLUTION; pixelX += 1) {
      const x = (pixelX + .5) * 100 / SURFACE_RESOLUTION
      let weightedValue = 0
      let totalWeight = 0
      let exactValue = null
      for (const reading of readings) {
        const dx = x - reading.point.x
        const dy = y - reading.point.y
        const distanceSquared = dx * dx + dy * dy
        if (distanceSquared < .025) {
          exactValue = Number(reading.value)
          break
        }
        const weight = 1 / Math.max(distanceSquared, .025)
        weightedValue += Number(reading.value) * weight
        totalWeight += weight
      }
      const value = exactValue ?? weightedValue / totalWeight
      const [red, green, blue] = interpolatedScaleColor(value, scale)
      const offset = (pixelY * SURFACE_RESOLUTION + pixelX) * 4
      image.data[offset] = red
      image.data[offset + 1] = green
      image.data[offset + 2] = blue
      image.data[offset + 3] = 220
    }
  }
  context.putImageData(image, 0, 0)

  context.globalCompositeOperation = 'destination-in'
  context.beginPath()
  polygon.forEach((point, index) => {
    const x = point.x * SURFACE_RESOLUTION / 100
    const y = point.y * SURFACE_RESOLUTION / 100
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.closePath()
  context.fill()
  return canvas.toDataURL('image/png')
}

function useGreenBoundaries() {
  const [features, setFeatures] = useState([])
  const [boundaryError, setBoundaryError] = useState('')

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

  return { features, boundaryError }
}

function DetailValue({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function ReadingDetails({ reading, onClose }) {
  if (!reading) return null
  const soilTemp = numericValue(reading.soilTempC)
  const irTemp = numericValue(reading.irTempC)
  return (
    <div className={styles.readingDetail} aria-live="polite">
      <div className={styles.detailHeader}>
        <div>
          <span className={styles.eyebrow}>SELECTED SAMPLE</span>
          <strong>{new Date(reading.observedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close reading details">×</button>
      </div>
      <div className={styles.detailGrid}>
        <DetailValue label="VWC" value={numericValue(reading.moisturePct) === null ? null : `${Number(reading.moisturePct).toFixed(1)}%`} />
        <DetailValue label="Bulk EC" value={numericValue(reading.bulkEc) === null ? null : `${Number(reading.bulkEc).toFixed(2)} mS/cm`} />
        <DetailValue label="Soil temperature" value={soilTemp === null ? null : `${(soilTemp * 9 / 5 + 32).toFixed(1)}°F / ${soilTemp.toFixed(1)}°C`} />
        <DetailValue label="Surface IR" value={irTemp === null ? null : `${(irTemp * 9 / 5 + 32).toFixed(1)}°F / ${irTemp.toFixed(1)}°C`} />
        <DetailValue label="TDR period" value={numericValue(reading.periodUs) === null ? null : `${Number(reading.periodUs).toFixed(0)} µs`} />
        <DetailValue label="Satellites" value={numericValue(reading.satelliteTotal)?.toFixed(0)} />
        <DetailValue label="GPS HDOP" value={numericValue(reading.gpsHdop)?.toFixed(2)} />
        <DetailValue label="GPS fix" value={reading.gpsFix} />
        <DetailValue label="Rod length" value={reading.rodLength} />
        <DetailValue label="Soil type" value={reading.soilType} />
        <DetailValue label="Meter" value={reading.meterId} />
        <DetailValue label="Coordinates" value={reading.lat == null ? null : `${Number(reading.lat).toFixed(6)}, ${Number(reading.lng).toFixed(6)}`} />
      </div>
    </div>
  )
}

function metricSummary(metric, value) {
  if (!metric || value === null || value === undefined) return '—'
  const display = metric.summary ? metric.summary(value) : value
  return `${display.toFixed(metric.precision)} ${metric.unit}`
}

function useGreenAerialImage(greenName) {
  const filename = greenAerialFilename(greenName)
  const url = filename ? `/data/green-aerial/${filename}?v=${GREEN_AERIAL_VERSION}` : ''
  const [failedUrl, setFailedUrl] = useState('')
  const visibleUrl = url && failedUrl !== url ? url : ''
  return {
    url: visibleUrl,
    onError: () => setFailedUrl(url),
  }
}

function GreenOptions({ names }) {
  return groupGreenNames(names).map(group => (
    <optgroup key={group.id} label={group.label}>
      {group.options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </optgroup>
  ))
}

export default function MoistureWorkspace() {
  const [view, setView] = useState('monitor')
  const [surfaceOpen, setSurfaceOpen] = useState(false)
  const { features, boundaryError } = useGreenBoundaries()
  const moisture = useMoistureData()

  return (
    <div className={styles.workspace}>
      <div className={styles.viewTabs} role="tablist" aria-label="Moisture tools">
        {VIEW_OPTIONS.map(option => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={option.id === 'surface' ? surfaceOpen : !surfaceOpen && view === option.id}
            className={(option.id === 'surface' ? surfaceOpen : !surfaceOpen && view === option.id) ? styles.viewTabActive : styles.viewTab}
            onClick={() => {
              if (option.id === 'surface') setSurfaceOpen(true)
              else setView(option.id)
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {view === 'monitor' && <MoistureOverview />}
      {view === 'pinpoints' && (
        <WateringMap
          observations={moisture.observations}
          loading={moisture.loading}
          features={features}
          boundaryError={boundaryError}
          displayMode={view}
        />
      )}
      {surfaceOpen && (
        <MoistureSurfaceModal
          observations={moisture.observations}
          loading={moisture.loading}
          features={features}
          boundaryError={boundaryError}
          onClose={() => setSurfaceOpen(false)}
        />
      )}
    </div>
  )
}

function MoistureSurfaceModal({ observations, loading, features, boundaryError, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  return (
    <div className={styles.surfaceModalBackdrop} role="presentation">
      <section className={styles.surfaceModal} role="dialog" aria-modal="true" aria-labelledby="moisture-surface-title">
        <header className={styles.surfaceModalHeader}>
          <div>
            <span className={styles.eyebrow}>Watering map</span>
            <h2 id="moisture-surface-title">Moisture Surface</h2>
            <p>Swipe the map left or right to move between greens.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close moisture surface">Close</button>
        </header>
        <div className={styles.surfaceModalBody}>
          <WateringMap
            observations={observations}
            loading={loading}
            features={features}
            boundaryError={boundaryError}
            displayMode="surface"
          />
        </div>
      </section>
    </div>
  )
}

export function TdrCsvImportWorkspace({ canEdit, onOpenMoisture, onOpenTdr }) {
  const { features, boundaryError } = useGreenBoundaries()
  return (
    <div className={styles.workspace}>
      <TdrCsvImporter
        features={features}
        boundaryError={boundaryError}
        canEdit={canEdit}
        onOpenMoisture={onOpenMoisture}
        onOpenTdr={onOpenTdr}
      />
    </div>
  )
}

function FivePointScaleEditor({ title, unit, labels, scale, step, onChange, onReset }) {
  function updatePoint(index, value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return
    const previous = index === 0 ? -Infinity : scale.points[index - 1]
    const next = index === scale.points.length - 1 ? Infinity : scale.points[index + 1]
    if (numeric <= previous || numeric >= next) return
    const points = [...scale.points]
    points[index] = numeric
    onChange({ ...scale, points })
  }

  function updateColor(index, color) {
    const colors = [...scale.colors]
    colors[index] = color
    onChange({ ...scale, colors })
  }

  return (
    <section className={styles.scalePanel}>
      <div className={styles.scaleHeader}>
        <div>
          <span className={styles.eyebrow}>FIVE-POINT SCALE</span>
          <h3>{title}</h3>
        </div>
        <button type="button" className={styles.resetPaletteButton} onClick={onReset}>Reset scale</button>
      </div>
      <div className={styles.scaleRows}>
        {labels.map((label, index) => (
          <div className={styles.scaleRow} key={label} style={{ '--zone-color': scale.colors[index] }}>
            <label className={styles.zoneColorLabel}>
              <input
                type="color"
                value={scale.colors[index]}
                onChange={event => updateColor(index, event.target.value)}
                aria-label={`${label} color`}
              />
              <span>{label}</span>
            </label>
            <label className={styles.breakpointLabel}>
              Setpoint
              <input
                type="number"
                inputMode="decimal"
                step={step}
                value={scale.points[index]}
                min={index === 0 ? undefined : scale.points[index - 1] + step}
                max={index === 4 ? undefined : scale.points[index + 1] - step}
                onChange={event => updatePoint(index, event.target.value)}
              />
              <span>{unit}</span>
            </label>
          </div>
        ))}
      </div>
    </section>
  )
}

export function MoistureMapSettingsWorkspace() {
  const [selectedMetricId, setSelectedMetricId] = useState(TDR_METRICS[0].id)
  const { settings, updateScale, resetScale, resetSettings } = useMoistureDisplaySettings()
  const metric = TDR_METRICS.find(item => item.id === selectedMetricId) ?? TDR_METRICS[0]
  const tdrScale = settings.tdr[metric.id]
  const step = metric.precision === 0 ? 1 : metric.precision === 1 ? .1 : .01

  return (
    <div className={styles.settingsWorkspace}>
      <div className={styles.settingsHeading}>
        <div>
          <span className={styles.eyebrow}>MAP DISPLAY</span>
          <h3>Setpoints and colors</h3>
        </div>
        <button type="button" className={styles.resetPaletteButton} onClick={resetSettings}>Reset all</button>
      </div>

      <FivePointScaleEditor
        title="Moisture (VWC)"
        unit="%"
        labels={MOISTURE_ZONE_LABELS}
        scale={settings.moisture}
        step={.1}
        onChange={scale => updateScale('moisture', null, scale)}
        onReset={() => resetScale('moisture')}
      />

      <div className={styles.tdrScaleSection}>
        <label className={styles.metricPicker}>
          TDR reading type
          <select value={metric.id} onChange={event => setSelectedMetricId(event.target.value)}>
            {TDR_METRICS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <FivePointScaleEditor
          title={metric.label}
          unit={metric.unit}
          labels={TDR_ZONE_LABELS}
          scale={tdrScale}
          step={step}
          onChange={scale => updateScale('tdr', metric.id, scale)}
          onReset={() => resetScale('tdr', metric.id)}
        />
      </div>
    </div>
  )
}

export function TdrWorkspace() {
  const [view, setView] = useState('pinpoints')
  const { features, boundaryError } = useGreenBoundaries()
  const moisture = useMoistureData()
  const { settings } = useMoistureDisplaySettings()
  return (
    <div className={styles.workspace}>
      <div className={`${styles.viewTabs} ${styles.tdrViewTabs}`} role="tablist" aria-label="TDR map type">
        {TDR_VIEW_OPTIONS.map(option => (
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
      <div className={styles.tdrIntro}>
        <div>
          <span className={styles.eyebrow}>SPECTRUM TDR 350</span>
          <h3>Meter diagnostics</h3>
          <p>Compare conductivity, temperature, meter period, and GPS quality across each green.</p>
        </div>
        <span>Tap any sample dot for its complete reading.</span>
      </div>
      <TdrMap
        observations={moisture.observations}
        loading={moisture.loading}
        features={features}
        boundaryError={boundaryError}
        displaySettings={settings}
        displayMode={view}
      />
    </div>
  )
}

function TdrMap({ observations, loading, features, boundaryError, displaySettings, displayMode = 'pinpoints' }) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedGreen, setSelectedGreen] = useState('')
  const [selectedMetricId, setSelectedMetricId] = useState('bulkEc')
  const [selectedReadingKey, setSelectedReadingKey] = useState('')

  const validObservations = useMemo(
    () => observations.filter(item => (
      !item._pending
      && item.location
      && TDR_METRICS.some(metric => numericValue(item[metric.id]) !== null)
    )),
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
  const availableMetrics = TDR_METRICS.filter(metric => (
    dayReadings.some(reading => numericValue(reading[metric.id]) !== null)
  ))
  const activeMetric = availableMetrics.find(metric => metric.id === selectedMetricId) ?? availableMetrics[0] ?? null
  const activeScale = activeMetric ? displaySettings.tdr[activeMetric.id] : null
  const summaries = (() => {
    if (!activeMetric) return []
    const grouped = new Map()
    for (const reading of dayReadings) {
      const value = numericValue(reading[activeMetric.id])
      if (value === null) continue
      const list = grouped.get(reading.location) ?? []
      list.push({ reading, value })
      grouped.set(reading.location, list)
    }
    return [...grouped.entries()].map(([green, samples]) => {
      const values = samples.map(sample => sample.value)
      return {
        green,
        readings: samples.map(sample => sample.reading),
        average: values.reduce((sum, value) => sum + value, 0) / values.length,
        minimum: Math.min(...values),
        maximum: Math.max(...values),
      }
    }).sort((left, right) => compareGreenNames(left.green, right.green))
  })()

  const summaryNames = summaries.map(summary => summary.green)
  const activeGreen = summaryNames.includes(selectedGreen) ? selectedGreen : (summaryNames[0] || '')
  const selectedSummary = summaries.find(summary => summary.green === activeGreen) ?? null
  const selectedFeature = features.find(feature => feature.properties?.name === activeGreen)
  const ring = useMemo(() => selectedFeature?.geometry?.coordinates?.[0] ?? [], [selectedFeature])
  const project = useMemo(() => buildGreenProjection(ring), [ring])
  const outline = smoothClosedPath(ring, project)
  const satellite = useGreenAerialImage(activeGreen)
  const mapped = (selectedSummary?.readings ?? []).filter(reading => (
    activeMetric
    && numericValue(reading[activeMetric.id]) !== null
    && Number.isFinite(Number(reading.lat))
    && Number.isFinite(Number(reading.lng))
    && project
  )).map((reading, index) => ({
    ...reading,
    metricValue: numericValue(reading[activeMetric.id]),
    mapKey: readingKey(reading, index),
    point: project(Number(reading.lat), Number(reading.lng)),
  }))
  const sampleSignature = mapped
    .map(reading => `${reading.point.x.toFixed(4)},${reading.point.y.toFixed(4)},${Number(metricDisplayValue(activeMetric, reading.metricValue)).toFixed(3)}`)
    .join('|')
  const firstRingPoint = ring[0]
  const lastRingPoint = ring.at(-1)
  const surfaceRing = ring.length > 3
    && firstRingPoint?.[0] === lastRingPoint?.[0]
    && firstRingPoint?.[1] === lastRingPoint?.[1]
    ? ring.slice(0, -1)
    : ring
  const polygonSignature = project
    ? surfaceRing.map(point => {
      const projected = project(point[1], point[0])
      return `${projected.x.toFixed(4)},${projected.y.toFixed(4)}`
    }).join('|')
    : ''
  const scaleSignature = JSON.stringify(activeScale)
  const surfaceUrl = useMemo(
    () => displayMode === 'surface' ? createInterpolatedSurface(sampleSignature, polygonSignature, scaleSignature) : '',
    // Canvas generation is expensive; these strings are immutable snapshots of every input.
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    [displayMode, polygonSignature, sampleSignature, scaleSignature],
  )
  const selectedReading = mapped.find(reading => reading.mapKey === selectedReadingKey) ?? null

  if (loading && observations.length === 0) return <p className={styles.empty}>Loading TDR readings...</p>
  if (validObservations.length === 0) {
    return (
      <div className={styles.empty}>
        No structured TDR diagnostics are stored yet. Re-import the original TDR CSV to backfill EC, temperature, and GPS-quality values without duplicating moisture samples.
      </div>
    )
  }

  return (
    <section className={styles.mapWorkspace}>
      <div className={`${styles.mapControls} ${styles.tdrControls}`}>
        <label>
          Reading date
          <select value={activeDate} onChange={event => setSelectedDate(event.target.value)}>
            {dates.map(date => <option key={date} value={date}>{formatDate(date)}</option>)}
          </select>
        </label>
        <label>
          Green
          <select value={activeGreen} onChange={event => setSelectedGreen(event.target.value)}>
            <GreenOptions names={summaryNames} />
          </select>
        </label>
        <label>
          Reading type
          <select value={activeMetric?.id || ''} onChange={event => setSelectedMetricId(event.target.value)}>
            {availableMetrics.map(metric => <option key={metric.id} value={metric.id}>{metric.label}</option>)}
          </select>
        </label>
      </div>

      {boundaryError && <p className={styles.error}>Green boundary error: {boundaryError}</p>}
      {activeMetric && <p className={styles.metricNote}>{activeMetric.note}</p>}

      <div className={styles.mapLayout}>
        <div className={styles.mapPanel}>
          <div className={styles.mapHeader}>
            <div>
              <span className={styles.eyebrow}>{activeDate ? formatDate(activeDate) : ''} · {activeMetric?.label}</span>
              <h3>{activeGreen || 'Choose a green'}</h3>
            </div>
            <div className={styles.mapMetrics}>
              <strong>{metricSummary(activeMetric, selectedSummary?.average)}</strong>
              <span>{selectedSummary?.readings.length ?? 0} readings</span>
            </div>
          </div>
          {outline ? (
            <svg className={styles.greenMap} viewBox="0 0 100 100" role="img" aria-label={`${activeGreen} ${activeMetric?.label} ${displayMode === 'surface' ? 'surface' : 'pinpoint'} map`}>
              <rect x="0" y="0" width="100" height="100" className={styles.mapBackground} />
              {satellite.url && <image href={satellite.url} x="0" y="0" width="100" height="100" preserveAspectRatio="none" className={styles.satelliteImage} onError={satellite.onError} />}
              {surfaceUrl && <image href={surfaceUrl} x="0" y="0" width="100" height="100" preserveAspectRatio="none" className={styles.moistureSurfaceImage} />}
              <path d={outline} className={satellite.url ? styles.greenShapeSatellite : styles.greenShape} />
              {mapped.map(reading => (
                <g
                  key={reading.mapKey}
                  className={styles.mapPointGroup}
                  role="button"
                  tabIndex="0"
                  aria-label={`Open ${activeMetric.format(reading.metricValue)} sample`}
                  onClick={() => setSelectedReadingKey(reading.mapKey)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedReadingKey(reading.mapKey)
                  }}
                >
                  <circle cx={reading.point.x} cy={reading.point.y} r="3.4" className={styles.mapHitArea} />
                  {selectedReading?.mapKey === reading.mapKey && (
                    <circle cx={reading.point.x} cy={reading.point.y} r="2" className={styles.selectedRing} />
                  )}
                  {displayMode === 'pinpoints' ? (
                    <circle
                      cx={reading.point.x}
                      cy={reading.point.y}
                      r="1"
                      fill={colorForFivePointValue(metricDisplayValue(activeMetric, reading.metricValue), activeScale)}
                      className={styles.mapPoint}
                    >
                      <title>{activeMetric.format(reading.metricValue)}</title>
                    </circle>
                  ) : (
                    <circle cx={reading.point.x} cy={reading.point.y} r=".42" className={styles.surfaceSamplePoint}>
                      <title>{`${activeMetric.format(reading.metricValue)} sample`}</title>
                    </circle>
                  )}
                </g>
              ))}
            </svg>
          ) : (
            <div className={styles.mapMissing}>No Crosswinds outline is available for this location.</div>
          )}
          <ReadingDetails reading={selectedReading} onClose={() => setSelectedReadingKey('')} />
          <div className={styles.legend}>
            {TDR_ZONE_LABELS.map((label, index) => (
              <span key={label}><i className={styles.legendDot} style={{ background: activeScale.colors[index] }} />{label}</span>
            ))}
            <span>{mapped.length} GPS-positioned</span>
            {displayMode === 'surface' && <span className={styles.interpolationNote}>Shaded areas are interpolated estimates</span>}
          </div>
        </div>

        <div className={styles.priorityPanel}>
          <h3>{activeMetric?.label} summary</h3>
          <p>{activeGreen} · {activeDate ? formatDate(activeDate) : ''}</p>
          <div className={styles.tdrStats}>
            <div><span>Average</span><strong>{metricSummary(activeMetric, selectedSummary?.average)}</strong></div>
            <div><span>Minimum</span><strong>{metricSummary(activeMetric, selectedSummary?.minimum)}</strong></div>
            <div><span>Maximum</span><strong>{metricSummary(activeMetric, selectedSummary?.maximum)}</strong></div>
          </div>
          <p className={styles.tdrHelp}>Select a point on the map to see every value stored with that sample.</p>
        </div>
      </div>

      <div className={styles.greenSummary}>
        {summaries.map(summary => (
          <button
            key={summary.green}
            type="button"
            className={summary.green === activeGreen ? styles.greenSummaryActive : styles.greenSummaryButton}
            style={summaryTileStyle(colorForFivePointValue(metricDisplayValue(activeMetric, summary.average), activeScale))}
            onClick={() => setSelectedGreen(summary.green)}
          >
            <span>{summary.green}</span>
            <strong>{metricSummary(activeMetric, summary.average)}</strong>
            <small>{summary.readings.length} readings</small>
          </button>
        ))}
      </div>
    </section>
  )
}

function WateringMap({ observations, loading, features, boundaryError, displayMode = 'pinpoints' }) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedGreen, setSelectedGreen] = useState('')
  const [selectedReadingKey, setSelectedReadingKey] = useState('')
  const surfaceSwipeStartX = useRef(null)
  const { settings } = useMoistureDisplaySettings()
  const scale = settings.moisture

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
      dry: readings.filter(reading => Number(reading.moisturePct) <= scale.points[1]).length,
    })).sort((left, right) => compareGreenNames(left.green, right.green))
  }, [dayReadings, scale.points])

  const summaryNames = summaries.map(summary => summary.green)
  const activeGreen = summaryNames.includes(selectedGreen) ? selectedGreen : (summaryNames[0] || '')
  const activeGreenIndex = summaryNames.indexOf(activeGreen)
  const selectedSummary = summaries.find(summary => summary.green === activeGreen)
  const selectedFeature = features.find(feature => feature.properties?.name === activeGreen)
  const ring = useMemo(() => selectedFeature?.geometry?.coordinates?.[0] ?? [], [selectedFeature])
  const project = useMemo(() => buildGreenProjection(ring), [ring])
  const outline = smoothClosedPath(ring, project)
  const satellite = useGreenAerialImage(activeGreen)
  const selectedReadings = selectedSummary?.readings ?? EMPTY_READINGS
  const mapped = selectedReadings.filter(reading => (
    Number.isFinite(Number(reading.lat)) && Number.isFinite(Number(reading.lng)) && project
  )).map((reading, index) => ({
    ...reading,
    mapKey: readingKey(reading, index),
    point: project(Number(reading.lat), Number(reading.lng)),
  }))
  const sampleSignature = mapped
    .map(reading => `${reading.point.x.toFixed(4)},${reading.point.y.toFixed(4)},${Number(reading.moisturePct).toFixed(3)}`)
    .join('|')
  const firstRingPoint = ring[0]
  const lastRingPoint = ring.at(-1)
  const surfaceRing = ring.length > 3
    && firstRingPoint?.[0] === lastRingPoint?.[0]
    && firstRingPoint?.[1] === lastRingPoint?.[1]
    ? ring.slice(0, -1)
    : ring
  const polygonSignature = project
    ? surfaceRing.map(point => {
      const projected = project(point[1], point[0])
      return `${projected.x.toFixed(4)},${projected.y.toFixed(4)}`
    }).join('|')
    : ''
  const scaleSignature = JSON.stringify(scale)
  const surfaceUrl = useMemo(
    () => displayMode === 'surface' ? createInterpolatedSurface(sampleSignature, polygonSignature, scaleSignature) : '',
    // Canvas generation is expensive; these strings are immutable snapshots of every input.
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    [displayMode, polygonSignature, sampleSignature, scaleSignature],
  )
  const selectedReading = mapped.find(reading => reading.mapKey === selectedReadingKey) ?? null
  const driest = [...(selectedSummary?.readings ?? [])]
    .sort((left, right) => Number(left.moisturePct) - Number(right.moisturePct))
    .slice(0, 8)

  const selectGreen = green => {
    setSelectedGreen(green)
    setSelectedReadingKey('')
  }
  const showAdjacentGreen = direction => {
    if (summaryNames.length < 2) return
    const currentIndex = Math.max(activeGreenIndex, 0)
    const nextIndex = (currentIndex + direction + summaryNames.length) % summaryNames.length
    selectGreen(summaryNames[nextIndex])
  }
  const handleSurfaceTouchStart = event => {
    if (displayMode !== 'surface') return
    surfaceSwipeStartX.current = event.touches[0]?.clientX ?? null
  }
  const handleSurfaceTouchEnd = event => {
    if (displayMode !== 'surface' || surfaceSwipeStartX.current == null) return
    const endX = event.changedTouches[0]?.clientX
    const distance = Number.isFinite(endX) ? endX - surfaceSwipeStartX.current : 0
    surfaceSwipeStartX.current = null
    if (Math.abs(distance) < 45) return
    showAdjacentGreen(distance < 0 ? 1 : -1)
  }

  if (loading && observations.length === 0) return <p className={styles.empty}>Loading moisture readings...</p>

  return (
    <section className={styles.mapWorkspace}>
      <div className={`${styles.mapControls} ${styles.moistureMapControls}`}>
        <label>
          Reading date
          <select value={activeDate} onChange={event => setSelectedDate(event.target.value)}>
            {dates.length === 0 && <option value="">No reading dates</option>}
            {dates.map(date => <option key={date} value={date}>{formatDate(date)}</option>)}
          </select>
        </label>
        <label>
          Green
          <select value={activeGreen} onChange={event => selectGreen(event.target.value)}>
            {summaries.length === 0 && <option value="">No mapped greens</option>}
            <GreenOptions names={summaryNames} />
          </select>
        </label>
      </div>

      {boundaryError && <p className={styles.error}>Green boundary error: {boundaryError}</p>}
      {dates.length === 0 ? (
        <div className={styles.empty}>No moisture readings are available yet. Import a TDR CSV or log readings manually.</div>
      ) : (
        <>
          <div className={styles.mapLayout}>
            <div
              className={`${styles.mapPanel} ${displayMode === 'surface' ? styles.surfaceSwipeFrame : ''}`}
              role={displayMode === 'surface' ? 'group' : undefined}
              aria-roledescription={displayMode === 'surface' ? 'carousel' : undefined}
              aria-label={displayMode === 'surface' ? `${activeGreen} moisture surface` : undefined}
              tabIndex={displayMode === 'surface' ? 0 : undefined}
              onTouchStart={handleSurfaceTouchStart}
              onTouchEnd={handleSurfaceTouchEnd}
              onTouchCancel={() => { surfaceSwipeStartX.current = null }}
              onKeyDown={event => {
                if (displayMode !== 'surface' || event.target !== event.currentTarget) return
                if (event.key === 'ArrowLeft') showAdjacentGreen(-1)
                if (event.key === 'ArrowRight') showAdjacentGreen(1)
              }}
            >
              <div className={styles.mapHeader}>
                <div>
                  <span className={styles.eyebrow}>{activeDate ? formatDate(activeDate) : ''}</span>
                  <h3>{activeGreen || 'Choose a green'}</h3>
                  {displayMode === 'surface' && (
                    <small className={styles.surfacePosition} aria-live="polite">
                      {activeGreenIndex + 1} of {summaryNames.length} · Swipe left or right
                    </small>
                  )}
                </div>
                <div className={styles.mapMetrics}>
                  <strong>{selectedSummary ? `${selectedSummary.average.toFixed(1)}%` : '—'}</strong>
                  <span>{selectedSummary?.readings.length ?? 0} readings</span>
                </div>
              </div>
              {outline ? (
                <svg className={styles.greenMap} viewBox="0 0 100 100" role="img" aria-label={`${activeGreen} moisture map`}>
                  <rect x="0" y="0" width="100" height="100" className={styles.mapBackground} />
                  {satellite.url && <image href={satellite.url} x="0" y="0" width="100" height="100" preserveAspectRatio="none" className={styles.satelliteImage} onError={satellite.onError} />}
                  {surfaceUrl && <image href={surfaceUrl} x="0" y="0" width="100" height="100" preserveAspectRatio="none" className={styles.moistureSurfaceImage} />}
                  <path d={outline} className={satellite.url ? styles.greenShapeSatellite : styles.greenShape} />
                  {mapped.map(reading => (
                    <g
                      key={reading.mapKey}
                      className={styles.mapPointGroup}
                      role="button"
                      tabIndex="0"
                      aria-label={`Open ${Number(reading.moisturePct).toFixed(1)} percent moisture sample`}
                      onClick={() => setSelectedReadingKey(reading.mapKey)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') setSelectedReadingKey(reading.mapKey)
                      }}
                    >
                      <circle cx={reading.point.x} cy={reading.point.y} r="3.4" className={styles.mapHitArea} />
                      {selectedReading?.mapKey === reading.mapKey && (
                        <circle cx={reading.point.x} cy={reading.point.y} r="2" className={styles.selectedRing} />
                      )}
                      {displayMode === 'pinpoints' ? (
                        <circle
                          cx={reading.point.x}
                          cy={reading.point.y}
                          r="1"
                          fill={colorForFivePointValue(Number(reading.moisturePct), scale)}
                          className={styles.mapPoint}
                        >
                          <title>{`${Number(reading.moisturePct).toFixed(1)}% VWC · ${new Date(reading.observedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</title>
                        </circle>
                      ) : (
                        <circle cx={reading.point.x} cy={reading.point.y} r=".42" className={styles.surfaceSamplePoint}>
                          <title>{`${Number(reading.moisturePct).toFixed(1)}% VWC sample`}</title>
                        </circle>
                      )}
                    </g>
                  ))}
                </svg>
              ) : (
                <div className={styles.mapMissing}>No Crosswinds outline is available for this location.</div>
              )}
              <ReadingDetails reading={selectedReading} onClose={() => setSelectedReadingKey('')} />
              <div className={styles.legend}>
                {MOISTURE_ZONE_LABELS.map((label, index) => (
                  <span key={label}><i className={styles.legendDot} style={{ background: scale.colors[index] }} />{label}</span>
                ))}
                <span>{mapped.length} GPS-positioned</span>
                {displayMode === 'surface' && <span className={styles.interpolationNote}>Shaded areas are interpolated estimates</span>}
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
                style={summaryTileStyle(colorForFivePointValue(summary.average, scale))}
                onClick={() => selectGreen(summary.green)}
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

function TdrCsvImporter({ features, boundaryError, canEdit, onOpenMoisture, onOpenTdr }) {
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
    () => features.map(feature => feature.properties?.name).filter(Boolean).sort(compareGreenNames),
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
        bulkEc: record.ec,
        soilTempC: record.soilTempC,
        irTempC: record.irTempC,
        periodUs: record.periodUs,
        satelliteTotal: record.satellites,
        gpsHdop: record.hdop,
        gpsFix: record.fix || null,
        rodLength: record.rodLength,
        soilType: record.soilType || null,
        meterId: record.meterId,
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
          <h3>Import moisture and TDR readings</h3>
          <p>Upload once, review green assignments, then approve the shared samples for both Moisture and TDR.</p>
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
                      <GreenOptions names={greenNames} />
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
            {result && <button type="button" className={styles.secondaryButton} onClick={onOpenMoisture}>Open Moisture</button>}
            {result && <button type="button" className={styles.secondaryButton} onClick={onOpenTdr}>Open TDR</button>}
          </div>
          <p className={styles.fileNote}>{fileName} · Approved rows populate both tabs. Re-importing the same readings is safe; duplicates are skipped.</p>
        </>
      )}
    </section>
  )
}
