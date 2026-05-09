import { useState, useMemo, useEffect } from 'react'
import { SPRAY_RECORDS, TYPE_COLORS } from '../../../data/spray'
import { buildSpraySummaryReport } from '../../../utils/reports/reportBuilder'
import { createAttachmentRef } from '../../../utils/reports/reportSchemas'
import { getMediaByModule, getThumbnailBlob } from '../../../utils/media/mediaStore'
import UploadCenter from '../../../components/uploads/UploadCenter'
import ReportPreviewModal from '../../../components/reports/ReportPreviewModal'
import styles from '../Spray.module.css'

const TYPE_FILTERS = ['All', 'Fungicide', 'Herbicide', 'Insecticide', 'PGR', 'Fertilizer']

const STATUS_META = {
  completed:      { label: 'Completed',     cls: styles.statusCompleted },
  planned:        { label: 'Planned',        cls: styles.statusPlanned   },
  'in-progress':  { label: 'In Progress',   cls: styles.statusInProgress },
  'pending-review': { label: 'Pending Review', cls: styles.statusPending },
}

function holesLabel(holes) {
  if (!holes || holes.length === 0) return '—'
  if (holes.length === 18) return 'All 18'
  if (holes.length === 9 && holes[0] === 1) return 'Front 9'
  if (holes.length === 9 && holes[0] === 10) return 'Back 9'
  return `Holes ${holes[0]}–${holes[holes.length - 1]}`
}

function conditionsSummary(c) {
  if (!c || (!c.temp && !c.wind)) return '—'
  const parts = []
  if (c.temp)     parts.push(`${c.temp}°F`)
  if (c.wind)     parts.push(c.wind)
  if (c.humidity) parts.push(`${c.humidity}% RH`)
  return parts.join(' · ')
}

export default function SprayRecords() {
  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selected, setSelected]         = useState(null)
  const [activeReport,  setActiveReport]  = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportThumbs,  setReportThumbs]  = useState([])

  useEffect(() => {
    if (!selected) return
    const onKey = e => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  function handleCloseReport() {
    reportThumbs.forEach(url => URL.revokeObjectURL(url))
    setReportThumbs([])
    setActiveReport(null)
  }

  async function generateApplicationReport(record) {
    setReportLoading(true)
    try {
      const [photos, docs] = await Promise.all([
        getMediaByModule(record.id).catch(() => []),
        getMediaByModule(`${record.id}-docs`).catch(() => []),
      ])
      const allMedia  = [...photos, ...docs]
      const thumbUrls = []

      const attachmentRefs = await Promise.all(allMedia.map(async rec => {
        let thumbnailUrl = null
        if (rec.type === 'image') {
          try {
            const blob = await getThumbnailBlob(rec.id)
            if (blob) {
              thumbnailUrl = URL.createObjectURL(blob)
              thumbUrls.push(thumbnailUrl)
            }
          } catch {}
        }
        return createAttachmentRef({
          id:           rec.id,
          filename:     rec.filename,
          type:         rec.type,
          thumbnailUrl,
          size:         rec.size,
        })
      }))

      setReportThumbs(thumbUrls)
      setActiveReport(buildSpraySummaryReport(
        [{
          ...record,
          product: record.products.map(p => p.name).join(' + '),
          rate:    record.products.map(p => p.rate).join(' / '),
        }],
        {
          title:     `Application Report — ${record.products.map(p => p.name).join(' + ')}`,
          dateRange: record.date,
          zone:      record.area,
        },
      ))
    } finally {
      setReportLoading(false)
    }
  }

  const visible = useMemo(() => {
    return SPRAY_RECORDS.filter(r => {
      const matchType = typeFilter === 'All' ||
        r.products.some(p => p.type === typeFilter)
      const matchStatus = statusFilter === 'All' || r.status === statusFilter
      const q = search.toLowerCase()
      const matchSearch = !q ||
        r.area.toLowerCase().includes(q) ||
        r.applicator.toLowerCase().includes(q) ||
        (r.targetPest && r.targetPest.toLowerCase().includes(q)) ||
        r.products.some(p => p.name.toLowerCase().includes(q))
      return matchType && matchStatus && matchSearch
    })
  }, [search, typeFilter, statusFilter])

  return (
    <div className={styles.tabContent}>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search product, area, applicator, pest…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search spray records"
        />

        <div className={styles.filterRow}>
          {TYPE_FILTERS.map(t => (
            <button
              key={t}
              className={`${styles.filterBtn} ${typeFilter === t ? styles.filterBtnActive : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={styles.filterRow}>
          {['All', 'completed', 'in-progress', 'planned', 'pending-review'].map(s => {
            const meta = STATUS_META[s]
            return (
              <button
                key={s}
                className={`${styles.filterBtn} ${statusFilter === s ? styles.filterBtnActive : ''} ${s !== 'All' ? styles[`statusFilter_${s.replace('-', '_')}`] : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {meta ? meta.label : 'All'}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Record count ── */}
      <p className={styles.recordCount}>
        {visible.length} record{visible.length !== 1 ? 's' : ''}
        {(typeFilter !== 'All' || statusFilter !== 'All' || search) ? ' (filtered)' : ''}
      </p>

      {/* ── List ── */}
      {visible.length === 0 ? (
        <p className={styles.emptyState}>No records match your search.</p>
      ) : (
        <div className={styles.recordList}>
          {visible.map(r => {
            const primaryType = r.products[0]?.type
            const colors = TYPE_COLORS[primaryType] || {}
            const statusMeta = STATUS_META[r.status] || {}
            return (
              <button
                key={r.id}
                className={styles.recordCard}
                onClick={() => setSelected(r)}
                aria-label={`View details for ${r.products.map(p => p.name).join(', ')} on ${r.date}`}
              >
                <div className={styles.recordHeader}>
                  <div className={styles.recordTitleRow}>
                    <span className={styles.recordProduct}>
                      {r.products.map(p => p.name).join(' + ')}
                    </span>
                    {r.products.length > 1 && (
                      <span className={styles.mixBadge}>Tank Mix</span>
                    )}
                    <span
                      className={styles.recordTypePill}
                      style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
                    >
                      {primaryType}
                      {r.products.length > 1 ? ' +' : ''}
                    </span>
                  </div>
                  <span className={styles.recordDate}>{r.date}</span>
                </div>

                <div className={styles.recordMeta}>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Area</span>
                    <span className={styles.recordMetaValue}>{r.area}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Holes</span>
                    <span className={styles.recordMetaValue}>{holesLabel(r.holes)}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Target</span>
                    <span className={styles.recordMetaValue}>{r.targetPest || '—'}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Applicator</span>
                    <span className={styles.recordMetaValue}>{r.applicator || '—'}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Conditions</span>
                    <span className={styles.recordMetaValue}>{conditionsSummary(r.conditions)}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Total Volume</span>
                    <span className={styles.recordMetaValue}>{r.totalVolume ? `${r.totalVolume} gal` : '—'}</span>
                  </div>
                </div>

                <div className={styles.recordFooter}>
                  <span className={`${styles.statusBadge} ${statusMeta.cls || ''}`}>
                    {statusMeta.label || r.status}
                  </span>
                  {r.rei > 0 && (
                    <span className={styles.reiBadge}>REI {r.rei}h</span>
                  )}
                  {r.notes && (
                    <span className={styles.hasNotes}>Note</span>
                  )}
                  <span className={styles.viewDetail}>View Details →</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Detail Modal ── */}
      {selected && (
        <div
          className={styles.modalOverlay}
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Spray record details"
        >
          <div
            className={styles.modalPanel}
            onClick={e => e.stopPropagation()}
          >
            {/* Accent bar — color of primary product type */}
            <div
              className={styles.modalAccent}
              style={{ background: TYPE_COLORS[selected.products[0]?.type]?.text || '#4a9e4a' }}
            />

            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>
                  {selected.products.map(p => p.name).join(' + ')}
                </h2>
                <p className={styles.modalSubtitle}>{selected.date} · {selected.course}</p>
              </div>
              <button
                className={styles.modalClose}
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>

              {/* Application info */}
              <section className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Application</h3>
                <div className={styles.modalGrid}>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Area</span>
                    <span className={styles.modalFieldValue}>{selected.area}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Holes</span>
                    <span className={styles.modalFieldValue}>{holesLabel(selected.holes)}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Target Pest / Use</span>
                    <span className={styles.modalFieldValue}>{selected.targetPest || '—'}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Applicator</span>
                    <span className={styles.modalFieldValue}>{selected.applicator || '—'}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Carrier Volume</span>
                    <span className={styles.modalFieldValue}>{selected.carrierVolume}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Total Tank Volume</span>
                    <span className={styles.modalFieldValue}>{selected.totalVolume ? `${selected.totalVolume} gal` : '—'}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>REI</span>
                    <span className={styles.modalFieldValue}>{selected.rei > 0 ? `${selected.rei} hrs` : 'None'}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>PHI</span>
                    <span className={styles.modalFieldValue}>{selected.phi > 0 ? `${selected.phi} days` : 'None'}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Status</span>
                    <span className={`${styles.statusBadge} ${STATUS_META[selected.status]?.cls || ''}`}>
                      {STATUS_META[selected.status]?.label || selected.status}
                    </span>
                  </div>
                </div>
              </section>

              {/* Products */}
              <section className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Product{selected.products.length > 1 ? 's' : ''}</h3>
                <div className={styles.modalProductList}>
                  {selected.products.map((p, i) => {
                    const c = TYPE_COLORS[p.type] || {}
                    return (
                      <div key={i} className={styles.modalProductRow}>
                        <span
                          className={styles.modalProductType}
                          style={{ background: c.bg, color: c.text, borderColor: c.border }}
                        >
                          {p.type}
                        </span>
                        <span className={styles.modalProductName}>{p.name}</span>
                        <span className={styles.modalProductRate}>{p.rate}</span>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Conditions */}
              {selected.conditions?.temp && (
                <section className={styles.modalSection}>
                  <h3 className={styles.modalSectionTitle}>Conditions at Application</h3>
                  <div className={styles.modalGrid}>
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Temperature</span>
                      <span className={styles.modalFieldValue}>{selected.conditions.temp}°F</span>
                    </div>
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Wind</span>
                      <span className={styles.modalFieldValue}>{selected.conditions.wind || '—'}</span>
                    </div>
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Humidity</span>
                      <span className={styles.modalFieldValue}>{selected.conditions.humidity ? `${selected.conditions.humidity}%` : '—'}</span>
                    </div>
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Soil Temp</span>
                      <span className={styles.modalFieldValue}>{selected.conditions.soilTemp ? `${selected.conditions.soilTemp}°F` : '—'}</span>
                    </div>
                  </div>
                </section>
              )}

              {/* Notes */}
              {selected.notes && (
                <section className={styles.modalSection}>
                  <h3 className={styles.modalSectionTitle}>Notes</h3>
                  <p className={styles.modalNotes}>{selected.notes}</p>
                </section>
              )}

              {/* Attachments */}
              <section className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Attachments</h3>
                <UploadCenter
                  module={selected.id}
                  type="image"
                  tags={[selected.area, selected.targetPest, selected.products[0]?.type].filter(Boolean)}
                  title="Photos"
                />
                <UploadCenter
                  module={`${selected.id}-docs`}
                  type="document"
                  tags={[selected.area, selected.targetPest, selected.products[0]?.type].filter(Boolean)}
                  title="Documents"
                />
              </section>

            </div>

            <div className="opActionRow">
              <button
                className="opActionBtn"
                onClick={() => generateApplicationReport(selected)}
                disabled={reportLoading}
              >
                {reportLoading ? 'Loading…' : 'Generate Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportPreviewModal
        report={activeReport}
        onClose={handleCloseReport}
      />

    </div>
  )
}
