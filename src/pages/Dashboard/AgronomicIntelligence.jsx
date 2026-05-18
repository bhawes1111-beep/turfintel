// Phase 28A — Agronomic Intelligence dashboard card.
//
// Pulls data from existing stores (sprays, inventory items, inventory
// labels, weather) and feeds them to the pure-function intelligence
// layer in src/utils/agronomic/agronomicIntelligence.js. No fetching
// happens here.
//
// Five always-expanded sections, each renders an empty/explanatory
// state when its inputs aren't sufficient. Compact rows; superintendent-
// readable at a glance. Every warning carries a "why" tooltip.

import { useMemo } from 'react'
import { useSpraysData }      from '../../utils/sprays/spraysStore'
import { useInventoryData }   from '../../utils/inventory/inventoryStore'
import { useImportedLabels }  from '../../utils/inventory/labelImportStore'
import { useWeather }         from '../../utils/weather/useWeather'
import { computeAgronomicIntelligence } from '../../utils/agronomic/agronomicIntelligence'
import styles from './AgronomicIntelligence.module.css'

// ── Small helpers ─────────────────────────────────────────────────────────

function fmtHoursShort(h) {
  if (!Number.isFinite(h)) return '—'
  if (h < 1)  return `${Math.round(h * 60)}m`
  if (h < 24) return `${h.toFixed(1)}h`.replace(/\.0h$/, 'h')
  return `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`
}

function fmtDateShort(ms) {
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmtTimeShort(ms) {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// ── Section wrappers ──────────────────────────────────────────────────────

function Section({ title, count, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>{title}</span>
        {count != null && (
          <span className={styles.sectionCount}>{count}</span>
        )}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  )
}

function EmptyHint({ children }) {
  return <p className={styles.emptyHint}>{children}</p>
}

const MAX_ROWS = 3   // collapse the rest under "+ N more"

function TruncatedList({ items, render }) {
  if (items.length === 0) return null
  const shown = items.slice(0, MAX_ROWS)
  const extra = items.length - shown.length
  return (
    <>
      {shown.map(render)}
      {extra > 0 && (
        <p className={styles.moreNote}>+ {extra} more</p>
      )}
    </>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────

export default function AgronomicIntelligence() {
  const { records: sprays = [] } = useSpraysData()
  const { items:   inventory = [] } = useInventoryData()
  const { labels = [] }      = useImportedLabels()
  const { forecast }         = useWeather()

  const intel = useMemo(() => computeAgronomicIntelligence({
    sprays,
    labels,
    inventory,
    weather: { forecast },
  }), [sprays, labels, inventory, forecast])

  const {
    activeREI,
    reapplicationWindows,
    rainfastWarnings,
    groupRotation,
    nutrientTotals,
  } = intel

  // ── Quick state checks ──────────────────────────────────────────────────
  const hasAnySpray  = sprays.length > 0
  const hasAnyLabel  = labels.length > 0

  return (
    <div className={styles.wrap}>

      {/* ── 1. Active REI ───────────────────────────────────────────────── */}
      <Section
        title="Active REI"
        count={activeREI.length > 0 ? activeREI.length : null}
      >
        {activeREI.length === 0 ? (
          <EmptyHint>
            {hasAnySpray
              ? 'No REI windows currently active.'
              : 'No sprays recorded yet.'}
          </EmptyHint>
        ) : (
          <TruncatedList
            items={activeREI}
            render={r => (
              <div key={r.sprayId} className={styles.row} title={r.why}>
                <span className={styles.rowPrimary}>{r.applicationName}</span>
                {r.area && <span className={styles.rowMeta}>· {r.area}</span>}
                <span className={`${styles.rowBadge} ${styles.badgeRei}`}>
                  REI {fmtHoursShort(r.hoursRemaining)} left
                </span>
                <span className={styles.rowSub}>until {fmtTimeShort(r.endsAt)}</span>
              </div>
            )}
          />
        )}
      </Section>

      {/* ── 2. Reapplication windows ────────────────────────────────────── */}
      <Section
        title="Reapplication"
        count={reapplicationWindows.length > 0 ? reapplicationWindows.length : null}
      >
        {reapplicationWindows.length === 0 ? (
          <EmptyHint>
            {hasAnySpray
              ? 'No recent applications in the last 60 days.'
              : 'No sprays recorded yet.'}
          </EmptyHint>
        ) : (
          <TruncatedList
            items={reapplicationWindows}
            render={r => {
              const key = `${r.productName}|${r.area ?? ''}|${r.appliedAt}`
              if (r.kind === 'unknown') {
                return (
                  <div key={key} className={styles.row} title={r.reason}>
                    <span className={styles.rowPrimary}>{r.productName}</span>
                    {r.area && <span className={styles.rowMeta}>· {r.area}</span>}
                    <span className={styles.rowBadgeMuted}>interval unknown</span>
                    <span className={styles.rowSub}>
                      last {fmtDateShort(r.appliedAt)}
                    </span>
                  </div>
                )
              }
              const badge = r.state === 'overdue'      ? styles.badgeOverdue
                          : r.state === 'window-open'  ? styles.badgeOpen
                          : r.state === 'approaching'  ? styles.badgeApproaching
                                                       : styles.badgeScheduled
              const label = r.state === 'overdue'      ? `${Math.abs(Math.round(r.daysUntil))}d overdue`
                          : r.state === 'window-open'  ? 'window open'
                          : r.state === 'approaching'  ? `${Math.ceil(r.daysUntil)}d`
                                                       : `in ${Math.ceil(r.daysUntil)}d`
              return (
                <div key={key} className={styles.row} title={r.why}>
                  <span className={styles.rowPrimary}>{r.productName}</span>
                  {r.area && <span className={styles.rowMeta}>· {r.area}</span>}
                  <span className={`${styles.rowBadge} ${badge}`}>{label}</span>
                  <span className={styles.rowSub}>
                    last {fmtDateShort(r.appliedAt)}
                  </span>
                </div>
              )
            }}
          />
        )}
      </Section>

      {/* ── 3. Weather / label conflicts (rainfast) ─────────────────────── */}
      <Section
        title="Weather conflicts"
        count={rainfastWarnings.length > 0 ? rainfastWarnings.length : null}
      >
        {rainfastWarnings.length === 0 ? (
          <EmptyHint>
            {hasAnySpray && hasAnyLabel
              ? 'No rainfast/forecast conflicts detected.'
              : 'Add saved labels with rainfast text to enable.'}
          </EmptyHint>
        ) : (
          <TruncatedList
            items={rainfastWarnings}
            render={r => (
              <div key={`${r.sprayId}|${r.productName}`} className={styles.row} title={r.why}>
                <span className={styles.rowPrimary}>{r.productName}</span>
                <span className={`${styles.rowBadge} ${styles.badgeRain}`}>
                  rain before {r.rainfastHours}h rainfast
                </span>
              </div>
            )}
          />
        )}
      </Section>

      {/* ── 4. Group rotation (FRAC/HRAC/IRAC) ──────────────────────────── */}
      <Section
        title="Group rotation"
        count={groupRotation.length > 0 ? groupRotation.length : null}
      >
        {groupRotation.length === 0 ? (
          <EmptyHint>
            {hasAnyLabel
              ? 'No group-repeat issues detected in the last 60 days.'
              : 'Saved labels with FRAC/HRAC/IRAC needed to enable.'}
          </EmptyHint>
        ) : (
          <TruncatedList
            items={groupRotation}
            render={r => (
              <div
                key={`${r.area ?? ''}|${r.type}|${r.code}`}
                className={styles.row}
                title={r.why}
              >
                <span className={styles.rowPrimary}>
                  {r.type} {r.code}
                </span>
                {r.area && <span className={styles.rowMeta}>· {r.area}</span>}
                <span
                  className={`${styles.rowBadge} ${
                    r.severity === 'high' ? styles.badgeHigh : styles.badgeWarn
                  }`}
                >
                  {r.applications}× repeat
                </span>
                {r.groupName && (
                  <span className={styles.rowSub} title={r.groupName}>
                    {r.groupName.length > 32 ? r.groupName.slice(0, 30) + '…' : r.groupName}
                  </span>
                )}
              </div>
            )}
          />
        )}
      </Section>

      {/* ── 5. Nutrient totals this week ─────────────────────────────────── */}
      <Section
        title="Nutrient totals (week)"
        count={nutrientTotals.contributingApplications || null}
      >
        {nutrientTotals.contributingApplications === 0 ? (
          <EmptyHint>
            {hasAnySpray
              ? 'No fertilizer applications this week with full data.'
              : 'No sprays recorded yet.'}
          </EmptyHint>
        ) : (
          <div className={styles.npkRow}>
            <span className={styles.npkCell}>
              <span className={styles.npkLabel}>N</span>
              <span className={styles.npkValue}>{nutrientTotals.totals.n} lb</span>
            </span>
            <span className={styles.npkCell}>
              <span className={styles.npkLabel}>P</span>
              <span className={styles.npkValue}>{nutrientTotals.totals.p} lb</span>
            </span>
            <span className={styles.npkCell}>
              <span className={styles.npkLabel}>K</span>
              <span className={styles.npkValue}>{nutrientTotals.totals.k} lb</span>
            </span>
            <span className={styles.npkMeta}>
              from {nutrientTotals.contributingApplications}{' '}
              app{nutrientTotals.contributingApplications === 1 ? '' : 's'}
            </span>
          </div>
        )}
        {/* Unknown lines (missing analysis / area / unit) — collapsed */}
        {nutrientTotals.lines.some(l => l.kind === 'unknown') && (
          <div className={styles.npkUnknownNote}>
            {nutrientTotals.lines.filter(l => l.kind === 'unknown').length}{' '}
            app{nutrientTotals.lines.filter(l => l.kind === 'unknown').length === 1 ? '' : 's'}{' '}
            missing data
          </div>
        )}
      </Section>
    </div>
  )
}
