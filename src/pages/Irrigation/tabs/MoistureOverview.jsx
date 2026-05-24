// Moisture + Handwatering Intelligence — Overview (3/3).
//
// Answers "what areas need attention today?" from REAL field observations
// + the weather/water-balance context. Operational decision support, not
// analytics — honest empty/partial states, no invented precision.

import { useMemo, useState } from 'react'
import {
  useMoistureData,
  useMoistureAttachments,
  deleteMoistureObservation,
  retryPendingObservation,
  retryPendingPhoto,
  dismissPendingObservation,
} from '../../../utils/moisture/moistureStore'
import { useWaterBalance } from '../../../utils/irrigation/waterBalanceStore'
import { useWeather } from '../../../utils/weather/useWeather'
import { computeWaterBalance } from '../../../utils/irrigation/waterBalance'
import { computeMoistureIntel, syringeAwareness } from '../../../utils/moisture/moistureIntel'
import LogMoistureButton from '../../../components/moisture/LogMoistureButton'
import MoisturePhotoViewer from '../../../components/moisture/MoisturePhotoViewer'
import styles from './MoistureOverview.module.css'

const PRIORITY_COLOR = {
  'High Priority': '#ef4444',
  Monitor:         '#fbbf24',
  Recovering:      '#38bdf8',
  Stable:          '#4ade80',
}

function fmtAgo(iso) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const h = (Date.now() - ms) / 3_600_000
  if (h < 1)  return `${Math.round(h * 60)}m ago`
  if (h < 24) return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}

const FLAG_BADGES = [
  ['wiltStress',   'Wilt'],
  ['drySpot',      'Dry spot'],
  ['handwaterRec', 'Handwater'],
  ['syringeRec',   'Syringe'],
]

export default function MoistureOverview() {
  const { observations, loading, error } = useMoistureData()
  // Phase 7A.5 — single batched lookup for every moisture-observation
  // photo attached for the selected course. O(1) per-row chip rendering.
  const { byParent: attachmentsByParent } = useMoistureAttachments()
  const { balance } = useWaterBalance()
  const { current } = useWeather()

  const wb    = useMemo(() => computeWaterBalance(balance), [balance])
  const intel = useMemo(() => computeMoistureIntel(observations, wb), [observations, wb])
  const syringe = useMemo(() => syringeAwareness(current, wb), [current, wb])

  // Phase 7A.5 — viewer is opened by tapping a chip; carries the observation
  // whose photos to render. The viewer reads attachments from the same
  // byParent map (kept fresh by useMoistureAttachments), so a delete updates
  // both the chip and the viewer immediately.
  const [viewerObs, setViewerObs] = useState(null)
  const viewerAttachments = viewerObs
    ? (attachmentsByParent.get(viewerObs.id) ?? [])
    : []

  function handleDelete(id) { deleteMoistureObservation(id).catch(() => {}) }

  // Phase 7A.2 — pending-row helpers. A row created via the FAB capture path
  // sits in the store with `_pending: true` until the network call resolves.
  // On failure the row keeps `_pending: true` and gains `_error` so the user
  // can retry. Pending rows have a synthetic id (`pending-<clientId>`) — the
  // legacy DELETE endpoint would 404, so dismiss them via the store helper.
  function handleRowDelete(o) {
    if (o._pending) dismissPendingObservation(o.clientId)
    else            handleDelete(o.id)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <span className={styles.headTitle}>Moisture &amp; Handwatering</span>
        <LogMoistureButton compact />
      </div>

      {error && <p className={styles.error}>Moisture load error: {error}</p>}

      {/* Trend + syringe awareness (weather-derived context, honest "potential") */}
      <div className={styles.contextBar}>
        <span className={styles.trendChip} data-trend={intel.trend}>
          {intel.hasData ? intel.trend : 'no observations yet'}
        </span>
        {syringe.map(n => (
          <span key={n.key} className={styles.syringeChip} title={n.detail ?? ''}>
            {n.text}{n.detail ? ` · ${n.detail}` : ''}
          </span>
        ))}
      </div>

      {loading && observations.length === 0 ? (
        <p className={styles.empty}>Loading moisture observations…</p>
      ) : !intel.hasData ? (
        <p className={styles.empty}>
          No moisture observations yet. Tap <strong>Log Moisture</strong> while
          walking greens — handwater priorities, driest areas, and drying
          trends will appear here as observations build up. The syringe context
          above is weather-derived and shown even before any observation.
        </p>
      ) : (
        <>
          {/* Handwater priorities */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Handwater Priorities</p>
            <ul className={styles.list}>
              {intel.byLocation.map(loc => {
                // Phase 7A.5 — chip ties this priority row to the latest
                // observation's photos (intel groups by location; loc.latest
                // is the newest matching observation row).
                const photoCount = (attachmentsByParent.get(loc.latest?.id)?.length ?? 0)
                return (
                  <li key={loc.location} className={styles.priorityItem} data-priority={loc.priority}>
                    <span className={styles.priorityDot} style={{ background: PRIORITY_COLOR[loc.priority] }} />
                    <div className={styles.priorityBody}>
                      <div className={styles.priorityTop}>
                        <span className={styles.locName}>{loc.location}</span>
                        <span className={styles.priorityTagGroup}>
                          {photoCount > 0 && (
                            <button
                              type="button"
                              className={styles.photoChip}
                              onClick={() => setViewerObs(loc.latest)}
                              title="View photos"
                            >
                              📷 {photoCount}
                            </button>
                          )}
                          <span className={styles.priorityTag} style={{ color: PRIORITY_COLOR[loc.priority] }}>
                            {loc.priority}
                          </span>
                        </span>
                      </div>
                      <div className={styles.priorityWhy}>
                        {loc.why}
                        {loc.moisturePct != null && ` · ${loc.moisturePct}% VWC`}
                        {` · ${fmtAgo(loc.observedAt)}`}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Driest areas (only when moisture % was measured) */}
          {intel.driest.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Driest Areas (measured)</p>
              <div className={styles.driestRow}>
                {intel.driest.map(d => {
                  // Phase 7A.5 — driest entries are projections of
                  // byLocation, so d.latest carries the newest observation
                  // row id (same lookup as Priorities).
                  const photoCount = (attachmentsByParent.get(d.latest?.id)?.length ?? 0)
                  return (
                    <div key={d.location} className={styles.driestCard}>
                      <span className={styles.driestVal}>{d.moisturePct}%</span>
                      <span className={styles.driestLoc}>{d.location}</span>
                      {photoCount > 0 && (
                        <button
                          type="button"
                          className={styles.photoChipSmall}
                          onClick={() => setViewerObs(d.latest)}
                          title="View photos"
                        >
                          📷 {photoCount}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent observations (the historical record) */}
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Recent Observations</p>
            <ul className={styles.obsList}>
              {observations.slice(0, 8).map(o => (
                <li key={o.id} className={styles.obsItem} data-pending={o._pending ? 'true' : 'false'}>
                  <div className={styles.obsMain}>
                    <span className={styles.obsLoc}>{o.location}</span>
                    <span className={styles.obsMeta}>
                      {o.moisturePct != null ? `${o.moisturePct}% · ` : ''}{fmtAgo(o.observedAt)}
                      {o.observedBy ? ` · ${o.observedBy}` : ''}
                    </span>
                    {(o.surfaceNote || o.notes) && (
                      <span className={styles.obsNote}>{o.surfaceNote || o.notes}</span>
                    )}
                    <span className={styles.obsBadges}>
                      {FLAG_BADGES.filter(([k]) => o[k]).map(([k, label]) => (
                        <span key={k} className={styles.obsBadge}>{label}</span>
                      ))}
                      {/* Phase 7A.5 — tap to open the photo viewer. Chip
                          only renders if this row has ≥1 attachment in the
                          cached byParent map (pending rows have a synthetic
                          id and never match). */}
                      {!o._pending && (attachmentsByParent.get(o.id)?.length ?? 0) > 0 && (
                        <button
                          type="button"
                          className={styles.photoChip}
                          onClick={() => setViewerObs(o)}
                          title="View photos"
                        >
                          📷 {attachmentsByParent.get(o.id).length}
                        </button>
                      )}
                      {/* Observation-level retry (7A.2): row hasn't been
                          successfully saved yet. */}
                      {o._pending && o._error && (
                        <button
                          type="button"
                          className={styles.retryBadge}
                          onClick={() => retryPendingObservation(o.clientId)}
                          title={`Retry — last attempt failed: ${o._error}`}
                        >
                          ↻ Retry
                        </button>
                      )}
                      {o._pending && !o._error && (
                        <span className={styles.savingBadge}>Saving…</span>
                      )}
                      {/* Phase 7A.4 — photo-level retry. Observation is
                          saved; only the attached image failed. Distinct
                          handler so we don't re-POST the observation. */}
                      {!o._pending && o._photoError && (
                        <button
                          type="button"
                          className={styles.retryBadge}
                          onClick={() => retryPendingPhoto(o.clientId)}
                          title={`Retry photo — last upload failed: ${o._photoError}`}
                        >
                          ↻ Retry photo
                        </button>
                      )}
                      {!o._pending && o._photoPending && (
                        <span className={styles.savingBadge}>Uploading photo…</span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.obsDel}
                    onClick={() => handleRowDelete(o)}
                    aria-label={o._pending ? 'Discard pending observation' : 'Delete observation'}
                    title={o._pending ? 'Discard pending observation' : 'Delete observation'}
                  >✕</button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <MoisturePhotoViewer
        observation={viewerObs}
        attachments={viewerAttachments}
        onClose={() => setViewerObs(null)}
      />
    </div>
  )
}
