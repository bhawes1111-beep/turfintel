import { useState, useMemo, useEffect } from 'react'
import styles from '../Disease.module.css'
import { ACTIVE_ISSUES } from '../../../data/disease'

const SEV_ORDER    = { high: 0, medium: 1, low: 2 }
const STATUS_ORDER = { active: 0, monitoring: 1, resolved: 2 }

const SEV_COLORS = {
  high:   { accent: '#e05050', cls: styles.severityHigh   },
  medium: { accent: '#d4883a', cls: styles.severityMedium },
  low:    { accent: '#c8b830', cls: styles.severityLow    },
}

const STATUS_META = {
  active:     { label: 'Active',     cls: styles.statusActive     },
  monitoring: { label: 'Monitoring', cls: styles.statusMonitoring },
  resolved:   { label: 'Resolved',   cls: styles.statusResolved   },
}

function holesLabel(holes) {
  if (!holes || holes.length === 0) return null
  if (holes.length === 18) return 'All 18 holes'
  if (holes.length === 1)  return `Hole ${holes[0]}`
  return `Holes ${holes.join(', ')}`
}

export default function ActiveIssues() {
  const [search, setSearch]       = useState('')
  const [sevFilter, setSevFilter] = useState('All')
  const [staFilter, setStaFilter] = useState('All')
  const [selected, setSelected]   = useState(null)

  useEffect(() => {
    if (!selected) return
    const onKey = e => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const counts = useMemo(() => ({
    active:     ACTIVE_ISSUES.filter(i => i.status === 'active').length,
    monitoring: ACTIVE_ISSUES.filter(i => i.status === 'monitoring').length,
    resolved:   ACTIVE_ISSUES.filter(i => i.status === 'resolved').length,
    high:       ACTIVE_ISSUES.filter(i => i.severity === 'high').length,
  }), [])

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    return ACTIVE_ISSUES
      .filter(i => {
        const matchSev = sevFilter === 'All' || i.severity === sevFilter.toLowerCase()
        const matchSta = staFilter === 'All' || i.status  === staFilter.toLowerCase()
        const matchSearch = !q ||
          i.name.toLowerCase().includes(q) ||
          i.area.toLowerCase().includes(q) ||
          i.turf.toLowerCase().includes(q) ||
          (i.notes && i.notes.toLowerCase().includes(q)) ||
          (i.products && i.products.some(p => p.toLowerCase().includes(q)))
        return matchSev && matchSta && matchSearch
      })
      .sort((a, b) =>
        SEV_ORDER[a.severity] - SEV_ORDER[b.severity] ||
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      )
  }, [search, sevFilter, staFilter])

  return (
    <div className={styles.aiRoot}>

      {/* ── Stat row ── */}
      <div className={styles.aiStats}>
        <div className={`${styles.aiStat} ${styles.aiStatRed}`}>
          <span className={styles.aiStatValue}>{counts.active}</span>
          <span className={styles.aiStatLabel}>Active</span>
        </div>
        <div className={`${styles.aiStat} ${styles.aiStatOrange}`}>
          <span className={styles.aiStatValue}>{counts.monitoring}</span>
          <span className={styles.aiStatLabel}>Monitoring</span>
        </div>
        <div className={`${styles.aiStat} ${styles.aiStatGreen}`}>
          <span className={styles.aiStatValue}>{counts.resolved}</span>
          <span className={styles.aiStatLabel}>Resolved</span>
        </div>
        <div className={`${styles.aiStat} ${styles.aiStatCritical}`}>
          <span className={styles.aiStatValue}>{counts.high}</span>
          <span className={styles.aiStatLabel}>High Severity</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.aiToolbar}>
        <input
          type="search"
          className={styles.aiSearch}
          placeholder="Search disease, area, turf type, product…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search active issues"
        />
        <div className={styles.aiFilters}>
          <span className={styles.aiFilterLabel}>Severity:</span>
          {['All', 'High', 'Medium', 'Low'].map(s => (
            <button
              key={s}
              className={`${styles.aiFilterBtn} ${sevFilter === s ? styles.aiFilterBtnActive : ''}`}
              onClick={() => setSevFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className={styles.aiFilters}>
          <span className={styles.aiFilterLabel}>Status:</span>
          {['All', 'Active', 'Monitoring', 'Resolved'].map(s => (
            <button
              key={s}
              className={`${styles.aiFilterBtn} ${staFilter === s ? styles.aiFilterBtnActive : ''}`}
              onClick={() => setStaFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.aiCount}>
        {visible.length} issue{visible.length !== 1 ? 's' : ''}
        {(sevFilter !== 'All' || staFilter !== 'All' || search) ? ' (filtered)' : ''}
      </p>

      {/* ── Issue list ── */}
      {visible.length === 0 ? (
        <p className={styles.aiEmpty}>No issues match your filters.</p>
      ) : (
        <div className={styles.aiList}>
          {visible.map(issue => {
            const sev    = SEV_COLORS[issue.severity] || SEV_COLORS.low
            const status = STATUS_META[issue.status]  || {}
            return (
              <button
                key={issue.id}
                className={`${styles.aiCard} ${sev.cls}`}
                onClick={() => setSelected(issue)}
                aria-label={`View details for ${issue.name}`}
              >
                <div className={styles.aiCardHeader}>
                  <div className={styles.aiCardTitle}>
                    <span className={styles.aiIssueName}>{issue.name}</span>
                    <span className={styles.aiPathogen}>{issue.pathogen}</span>
                  </div>
                  <div className={styles.aiCardBadges}>
                    <span className={`${styles.severityBadge} ${sev.cls}`}>
                      {issue.severity}
                    </span>
                    <span className={`${styles.statusBadge} ${status.cls || ''}`}>
                      {status.label || issue.status}
                    </span>
                  </div>
                </div>

                <div className={styles.aiCardMeta}>
                  <div className={styles.aiMetaItem}>
                    <span className={styles.aiMetaLabel}>Area</span>
                    <span className={styles.aiMetaValue}>{issue.area}</span>
                  </div>
                  <div className={styles.aiMetaItem}>
                    <span className={styles.aiMetaLabel}>Turf Type</span>
                    <span className={styles.aiMetaValue}>{issue.turf}</span>
                  </div>
                  <div className={styles.aiMetaItem}>
                    <span className={styles.aiMetaLabel}>Discovered</span>
                    <span className={styles.aiMetaValue}>{issue.firstSeen}</span>
                  </div>
                  <div className={styles.aiMetaItem}>
                    <span className={styles.aiMetaLabel}>Follow-Up</span>
                    <span className={styles.aiMetaValue}>{issue.followUpDate || '—'}</span>
                  </div>
                </div>

                {issue.products && issue.products.length > 0 && (
                  <div className={styles.aiProductTags}>
                    {issue.products.map((p, i) => (
                      <span key={i} className={styles.aiProductTag}>{p}</span>
                    ))}
                  </div>
                )}

                <div className={styles.aiCardFooter}>
                  {issue.photos > 0 && (
                    <span className={styles.aiPhotoCount}>
                      {issue.photos} photo{issue.photos > 1 ? 's' : ''}
                    </span>
                  )}
                  {issue.notes && (
                    <span className={styles.aiHasNotes}>Note</span>
                  )}
                  <span className={styles.aiViewDetail}>View Details →</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Detail Modal ── */}
      {selected && (
        <div
          className={styles.aiModalOverlay}
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Issue details"
        >
          <div
            className={styles.aiModalPanel}
            onClick={e => e.stopPropagation()}
          >
            <div
              className={styles.aiModalAccent}
              style={{ background: SEV_COLORS[selected.severity]?.accent || '#4a9e4a' }}
            />

            <div className={styles.aiModalHeader}>
              <div>
                <h2 className={styles.aiModalTitle}>{selected.name}</h2>
                <p className={styles.aiModalSubtitle}>{selected.pathogen}</p>
              </div>
              <div className={styles.aiModalHeaderRight}>
                <span className={`${styles.severityBadge} ${SEV_COLORS[selected.severity]?.cls}`}>
                  {selected.severity}
                </span>
                <span className={`${styles.statusBadge} ${STATUS_META[selected.status]?.cls || ''}`}>
                  {STATUS_META[selected.status]?.label || selected.status}
                </span>
                <button
                  className={styles.aiModalClose}
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={styles.aiModalBody}>

              {/* Location */}
              <section className={styles.aiModalSection}>
                <h3 className={styles.aiModalSectionTitle}>Location</h3>
                <div className={styles.aiModalGrid}>
                  <div className={styles.aiModalField}>
                    <span className={styles.aiModalFieldLabel}>Area</span>
                    <span className={styles.aiModalFieldValue}>{selected.area}</span>
                  </div>
                  {selected.holes && selected.holes.length > 0 && (
                    <div className={styles.aiModalField}>
                      <span className={styles.aiModalFieldLabel}>Holes</span>
                      <span className={styles.aiModalFieldValue}>{holesLabel(selected.holes)}</span>
                    </div>
                  )}
                  <div className={styles.aiModalField}>
                    <span className={styles.aiModalFieldLabel}>Turf Type</span>
                    <span className={styles.aiModalFieldValue}>{selected.turf}</span>
                  </div>
                  <div className={styles.aiModalField}>
                    <span className={styles.aiModalFieldLabel}>Date Discovered</span>
                    <span className={styles.aiModalFieldValue}>{selected.firstSeen}</span>
                  </div>
                  <div className={styles.aiModalField}>
                    <span className={styles.aiModalFieldLabel}>Last Updated</span>
                    <span className={styles.aiModalFieldValue}>{selected.lastUpdated}</span>
                  </div>
                  <div className={styles.aiModalField}>
                    <span className={styles.aiModalFieldLabel}>Follow-Up Date</span>
                    <span className={styles.aiModalFieldValue}>{selected.followUpDate || '—'}</span>
                  </div>
                </div>
              </section>

              {/* Weather Trigger */}
              <section className={styles.aiModalSection}>
                <h3 className={styles.aiModalSectionTitle}>Weather Trigger / Conditions</h3>
                <p className={styles.aiModalParagraph}>{selected.conditions}</p>
              </section>

              {/* Treatment */}
              <section className={styles.aiModalSection}>
                <h3 className={styles.aiModalSectionTitle}>Treatment Recommendation</h3>
                <p className={styles.aiModalParagraph}>{selected.action}</p>
              </section>

              {/* Products */}
              {selected.products && selected.products.length > 0 && (
                <section className={styles.aiModalSection}>
                  <h3 className={styles.aiModalSectionTitle}>Suggested Products</h3>
                  <div className={styles.aiModalProductList}>
                    {selected.products.map((p, i) => (
                      <span key={i} className={styles.aiModalProductTag}>{p}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* Photos placeholder */}
              <section className={styles.aiModalSection}>
                <h3 className={styles.aiModalSectionTitle}>Photos</h3>
                {selected.photos > 0 ? (
                  <div className={styles.aiPhotoPlaceholder}>
                    <span className={styles.aiPhotoPlaceholderIcon}>📷</span>
                    <span>{selected.photos} photo{selected.photos > 1 ? 's' : ''} attached</span>
                    <span className={styles.aiPhotoPlaceholderSub}>Photo viewer coming soon</span>
                  </div>
                ) : (
                  <div className={styles.aiPhotoPlaceholder}>
                    <span className={styles.aiPhotoPlaceholderIcon}>📷</span>
                    <span>No photos attached</span>
                    <span className={styles.aiPhotoPlaceholderSub}>Photo upload coming soon</span>
                  </div>
                )}
              </section>

              {/* Notes */}
              {selected.notes && (
                <section className={styles.aiModalSection}>
                  <h3 className={styles.aiModalSectionTitle}>Notes</h3>
                  <p className={styles.aiModalNotes}>{selected.notes}</p>
                </section>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  )
}
