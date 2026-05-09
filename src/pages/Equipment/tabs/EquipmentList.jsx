import { useState, useMemo, useEffect } from 'react'
import { EQUIPMENT_LIST, SERVICE_LOG } from '../../../data/equipment'
import { buildMaintenanceLogReport } from '../../../utils/reports/reportBuilder'
import { createAttachmentRef } from '../../../utils/reports/reportSchemas'
import { getMediaByModule, getThumbnailBlob } from '../../../utils/media/mediaStore'
import UploadCenter from '../../../components/uploads/UploadCenter'
import ReportPreviewModal from '../../../components/reports/ReportPreviewModal'
import styles from '../Equipment.module.css'

const CATEGORIES   = ['All', 'Greens Mower', 'Fairway Mower', 'Rough Mower', 'Spray', 'Utility', 'Specialty']
const STATUS_FILTERS = ['All', 'Operational', 'In Service', 'Needs Maintenance', 'Out of Service']

const STATUS_META = {
  'operational':       { label: 'Operational',      cls: styles.eqStatusOperational },
  'in-service':        { label: 'In Service',        cls: styles.eqStatusInService   },
  'needs-maintenance': { label: 'Needs Maintenance', cls: styles.eqStatusMaint       },
  'out-of-service':    { label: 'Out of Service',    cls: styles.eqStatusOut         },
}

const FILTER_KEY = {
  'Operational':       'operational',
  'In Service':        'in-service',
  'Needs Maintenance': 'needs-maintenance',
  'Out of Service':    'out-of-service',
}

const SORT_STATUS = {
  'out-of-service':    0,
  'needs-maintenance': 1,
  'in-service':        2,
  'operational':       3,
}

const FUEL_COLORS = {
  Diesel:   { bg: 'rgba(80,140,220,0.12)', color: '#6aabee', border: 'rgba(80,140,220,0.28)' },
  Gas:      { bg: 'rgba(210,160,50,0.12)', color: '#d4a43a', border: 'rgba(210,160,50,0.28)' },
  Electric: { bg: 'rgba(74,200,140,0.12)', color: '#4ec88c', border: 'rgba(74,200,140,0.28)' },
  'Pre-Mix':{ bg: 'rgba(180,100,40,0.12)', color: '#c47828', border: 'rgba(180,100,40,0.28)' },
}

function serviceWarning(hours, nextServiceHours) {
  if (hours >= nextServiceHours)       return { label: 'Due Now',  cls: styles.eqServiceDue   }
  if (hours >= nextServiceHours - 25)  return { label: 'Due Soon', cls: styles.eqServiceSoon  }
  return null
}

function hoursUntilService(hours, nextServiceHours) {
  const remaining = nextServiceHours - hours
  if (remaining <= 0) return `${Math.abs(remaining)} hrs overdue`
  return `${remaining} hrs remaining`
}

export default function EquipmentList() {
  const [search,     setSearch]    = useState('')
  const [catFilter,  setCatFilter] = useState('All')
  const [staFilter,  setStaFilter] = useState('All')
  const [selected,      setSelected]     = useState(null)
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

  async function generateEquipmentHistory(equipment) {
    setReportLoading(true)
    try {
      const [photos, docs] = await Promise.all([
        getMediaByModule(equipment.id).catch(() => []),
        getMediaByModule(`${equipment.id}-docs`).catch(() => []),
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

      const logs = SERVICE_LOG
        .filter(l => l.equipmentId === equipment.id)
        .map(l => ({
          date:        l.completedDate ?? l.date,
          type:        l.serviceType,
          description: l.notes || `${l.serviceType} — ${l.equipmentName}`,
          technician:  l.technician || 'Unassigned',
          cost:        l.cost,
        }))

      setReportThumbs(thumbUrls)
      setActiveReport(buildMaintenanceLogReport(
        { ...equipment, type: equipment.category },
        logs,
        { dateRange: 'All Time' },
      ))
    } finally {
      setReportLoading(false)
    }
  }

  const counts = useMemo(() => {
    const c = { operational: 0, 'in-service': 0, 'needs-maintenance': 0, 'out-of-service': 0 }
    EQUIPMENT_LIST.forEach(eq => { if (c[eq.status] !== undefined) c[eq.status]++ })
    return c
  }, [])

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    return EQUIPMENT_LIST
      .filter(eq => {
        const matchCat = catFilter === 'All' || eq.category === catFilter
        const matchSta = staFilter === 'All' || eq.status === FILTER_KEY[staFilter]
        const matchSearch = !q ||
          eq.name.toLowerCase().includes(q) ||
          eq.category.toLowerCase().includes(q) ||
          eq.manufacturer.toLowerCase().includes(q) ||
          eq.model.toLowerCase().includes(q) ||
          (eq.assignedOperator && eq.assignedOperator.toLowerCase().includes(q)) ||
          (eq.notes && eq.notes.toLowerCase().includes(q))
        return matchCat && matchSta && matchSearch
      })
      .sort((a, b) =>
        SORT_STATUS[a.status] - SORT_STATUS[b.status]
      )
  }, [search, catFilter, staFilter])

  return (
    <div className={styles.eqRoot}>

      {/* ── Stat row ── */}
      <div className={styles.eqStats}>
        <div className={`${styles.eqStat} ${styles.eqStatOperational}`}>
          <span className={styles.eqStatValue}>{counts['operational']}</span>
          <span className={styles.eqStatLabel}>Active</span>
        </div>
        <div className={`${styles.eqStat} ${styles.eqStatInService}`}>
          <span className={styles.eqStatValue}>{counts['in-service']}</span>
          <span className={styles.eqStatLabel}>In Service</span>
        </div>
        <div className={`${styles.eqStat} ${styles.eqStatMaint}`}>
          <span className={styles.eqStatValue}>{counts['needs-maintenance']}</span>
          <span className={styles.eqStatLabel}>Needs Maintenance</span>
        </div>
        <div className={`${styles.eqStat} ${styles.eqStatOut}`}>
          <span className={styles.eqStatValue}>{counts['out-of-service']}</span>
          <span className={styles.eqStatLabel}>Out of Service</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.eqToolbar}>
        <input
          type="search"
          className={styles.eqSearch}
          placeholder="Search name, category, make, model, operator…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search equipment"
        />
        <div className={styles.eqFilterRow}>
          {CATEGORIES.map(c => (
            <button
              key={c}
              className={`${styles.eqFilterBtn} ${catFilter === c ? styles.eqFilterBtnActive : ''}`}
              onClick={() => setCatFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className={styles.eqFilterRow}>
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              className={`${styles.eqFilterBtn} ${staFilter === s ? styles.eqFilterBtnActive : ''}`}
              onClick={() => setStaFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.eqCount}>
        {visible.length} unit{visible.length !== 1 ? 's' : ''}
        {(catFilter !== 'All' || staFilter !== 'All' || search) ? ' (filtered)' : ''}
      </p>

      {/* ── Equipment list ── */}
      {visible.length === 0 ? (
        <p className={styles.eqEmpty}>No equipment matches your search.</p>
      ) : (
        <div className={styles.eqList}>
          {visible.map(eq => {
            const statusMeta = STATUS_META[eq.status] || {}
            const svcWarn    = serviceWarning(eq.hours, eq.nextServiceHours)
            const fuelStyle  = FUEL_COLORS[eq.fuelType] || FUEL_COLORS.Gas
            return (
              <button
                key={eq.id}
                className={`${styles.eqCard} ${styles[`eqCard_${eq.status.replace('-', '_')}`]}`}
                onClick={() => setSelected(eq)}
                aria-label={`View details for ${eq.name}`}
              >
                {/* Left: name + make/model + operator + badges */}
                <div className={styles.eqCardMain}>
                  <div className={styles.eqCardTitleRow}>
                    <span className={styles.eqCardName}>{eq.name}</span>
                    <span className={styles.eqCategoryPill}>{eq.category}</span>
                  </div>
                  <div className={styles.eqCardMakeModel}>
                    {eq.manufacturer} {eq.model}
                    {eq.year && <span className={styles.eqCardYear}> · {eq.year}</span>}
                  </div>
                  <div className={styles.eqCardBadgeRow}>
                    <span className={`${styles.eqStatusBadge} ${statusMeta.cls || ''}`}>
                      {statusMeta.label}
                    </span>
                    <span
                      className={styles.eqFuelBadge}
                      style={{ background: fuelStyle.bg, color: fuelStyle.color, borderColor: fuelStyle.border }}
                    >
                      {eq.fuelType}
                    </span>
                    {svcWarn && (
                      <span className={`${styles.eqServiceBadge} ${svcWarn.cls}`}>
                        {svcWarn.label}
                      </span>
                    )}
                    {eq.assignedOperator && (
                      <span className={styles.eqOperatorBadge}>{eq.assignedOperator}</span>
                    )}
                  </div>
                </div>

                {/* Right: hours */}
                <div className={styles.eqCardRight}>
                  <span className={styles.eqBigHours}>{eq.hours.toLocaleString()}</span>
                  <span className={styles.eqHoursLabel}>hrs</span>
                  <span className={styles.eqNextService}>
                    {hoursUntilService(eq.hours, eq.nextServiceHours)}
                  </span>
                  <span className={styles.eqViewDetail}>Details →</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Detail Modal ── */}
      {selected && (() => {
        const statusMeta = STATUS_META[selected.status] || {}
        const svcWarn    = serviceWarning(selected.hours, selected.nextServiceHours)
        const fuelStyle  = FUEL_COLORS[selected.fuelType] || FUEL_COLORS.Gas
        const accentColors = {
          'operational':       '#4ecb4e',
          'in-service':        '#5ba8a0',
          'needs-maintenance': '#d4883a',
          'out-of-service':    '#e05050',
        }
        return (
          <div
            className={styles.eqModalOverlay}
            onClick={() => setSelected(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Equipment details"
          >
            <div
              className={styles.eqModalPanel}
              onClick={e => e.stopPropagation()}
            >
              <div
                className={styles.eqModalAccent}
                style={{ background: accentColors[selected.status] || '#4a9e4a' }}
              />

              <div className={styles.eqModalHeader}>
                <div>
                  <h2 className={styles.eqModalTitle}>{selected.name}</h2>
                  <p className={styles.eqModalSubtitle}>
                    {selected.manufacturer} {selected.model}
                    {selected.year ? ` · ${selected.year}` : ''}
                    {selected.serialNumber ? ` · S/N: ${selected.serialNumber}` : ''}
                  </p>
                </div>
                <div className={styles.eqModalHeaderRight}>
                  <span className={`${styles.eqStatusBadge} ${statusMeta.cls || ''}`}>
                    {statusMeta.label}
                  </span>
                  <button
                    className={styles.eqModalClose}
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className={styles.eqModalBody}>

                {/* Equipment Overview */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Equipment Overview</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Category</span>
                      <span className={styles.eqModalFieldValue}>{selected.category}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Manufacturer</span>
                      <span className={styles.eqModalFieldValue}>{selected.manufacturer}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Model</span>
                      <span className={styles.eqModalFieldValue}>{selected.model}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Year</span>
                      <span className={styles.eqModalFieldValue}>{selected.year || '—'}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Serial Number</span>
                      <span className={styles.eqModalFieldValue}>{selected.serialNumber || '—'}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Status</span>
                      <span className={`${styles.eqStatusBadge} ${statusMeta.cls || ''}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Hours Tracking */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Hours Tracking</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Current Hours</span>
                      <span className={`${styles.eqModalFieldValue} ${styles.eqModalHoursBig}`}>
                        {selected.hours.toLocaleString()} hrs
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Next Service At</span>
                      <span className={styles.eqModalFieldValue}>{selected.nextServiceHours.toLocaleString()} hrs</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Service Status</span>
                      {svcWarn
                        ? <span className={`${styles.eqServiceBadge} ${svcWarn.cls}`}>{svcWarn.label}</span>
                        : <span className={styles.eqServiceCurrent}>Current</span>
                      }
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Service Interval</span>
                      <span className={styles.eqModalFieldValue}>{selected.serviceInterval} hrs</span>
                    </div>
                  </div>

                  {/* Hours bar */}
                  <div className={styles.eqHoursBarWrap}>
                    <div
                      className={`${styles.eqHoursBar} ${
                        selected.hours >= selected.nextServiceHours
                          ? styles.eqHoursBarDue
                          : selected.hours >= selected.nextServiceHours - 25
                          ? styles.eqHoursBarSoon
                          : styles.eqHoursBarOk
                      }`}
                      style={{
                        width: `${Math.min(100, Math.round(
                          ((selected.hours - selected.lastServiceHours) /
                          (selected.nextServiceHours - selected.lastServiceHours)) * 100
                        ))}%`,
                      }}
                    />
                    <div className={styles.eqHoursBarLabels}>
                      <span>Last: {selected.lastServiceHours} hrs</span>
                      <span>Next: {selected.nextServiceHours} hrs</span>
                    </div>
                  </div>
                </section>

                {/* Service Information */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Service Information</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Last Service Date</span>
                      <span className={styles.eqModalFieldValue}>{selected.lastService || '—'}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Hours at Last Service</span>
                      <span className={styles.eqModalFieldValue}>{selected.lastServiceHours.toLocaleString()} hrs</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Hours Since Service</span>
                      <span className={styles.eqModalFieldValue}>
                        {selected.hours - selected.lastServiceHours} hrs
                      </span>
                    </div>
                  </div>
                  <p className={styles.eqModalServiceNote}>
                    Full service history available in Maintenance Logs tab.
                  </p>
                </section>

                {/* Fuel Information */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Fuel Information</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Fuel Type</span>
                      <span
                        className={styles.eqFuelBadge}
                        style={{
                          background:   fuelStyle.bg,
                          color:        fuelStyle.color,
                          borderColor:  fuelStyle.border,
                          fontSize:     '0.82rem',
                          padding:      '4px 10px',
                        }}
                      >
                        {selected.fuelType}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Assigned Operator */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Assigned Operator</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Operator</span>
                      <span className={styles.eqModalFieldValue}>
                        {selected.assignedOperator || 'Unassigned'}
                      </span>
                    </div>
                  </div>
                  <p className={styles.eqModalServiceNote}>
                    Operator assignment and usage tracking coming soon.
                  </p>
                </section>

                {/* Notes */}
                {selected.notes && (
                  <section className={styles.eqModalSection}>
                    <h3 className={styles.eqModalSectionTitle}>Notes</h3>
                    <p className={styles.eqModalNotes}>{selected.notes}</p>
                  </section>
                )}

                {/* Attachments */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Attachments</h3>
                  <UploadCenter
                    module={selected.id}
                    type="image"
                    tags={[selected.category, selected.status].filter(Boolean)}
                    title="Photos"
                  />
                  <UploadCenter
                    module={`${selected.id}-docs`}
                    type="document"
                    tags={[selected.category, selected.status].filter(Boolean)}
                    title="Documents"
                  />
                </section>

              </div>

              <div className="opActionRow">
                <button
                  className="opActionBtn"
                  onClick={() => generateEquipmentHistory(selected)}
                  disabled={reportLoading}
                >
                  {reportLoading ? 'Loading…' : 'Equipment History Report'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <ReportPreviewModal
        report={activeReport}
        onClose={handleCloseReport}
      />

    </div>
  )
}
