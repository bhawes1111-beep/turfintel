// Phase 29 — Operational Command top-of-dashboard panel.
//
// Composes the already-built intelligence outputs (Phase 28A agronomic,
// 28B spray window, 28C irrigation) with calendar / sprays / equipment
// / crew / weather data into one prioritized command surface.
//
// Three sections:
//   1. Morning Readiness capsule — frost / cart / mowing / spray
//      viability / labor / planned-sprays count
//   2. Priorities list — severity-sorted, top-N items with `why` tooltip
//   3. Next 12 hours timeline — weather period + planned sprays +
//      rain-affected calendar events
//
// Decision-support only — no task creation, no scheduling.

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeather }            from '../../utils/weather/useWeather'
import { useSpraysData }         from '../../utils/sprays/spraysStore'
import { useInventoryData }      from '../../utils/inventory/inventoryStore'
import { useImportedLabels }     from '../../utils/inventory/labelImportStore'
import { useAssignmentsData }    from '../../utils/assignments/assignmentsStore'
import { useCalendarData }       from '../../utils/calendar/calendarStore'
import { useWeatherHistoryData } from '../../utils/weather/weatherHistoryStore'
import { useEquipmentData }      from '../../utils/equipment/equipmentStore'
import { computeAgronomicIntelligence } from '../../utils/agronomic/agronomicIntelligence'
import { computeSprayWindowIntel }      from '../../utils/sprayWindow/sprayWindowIntel'
import { computeIrrigationIntel }       from '../../utils/irrigation/irrigationIntel'
import { composeOperationalPriorities } from '../../utils/operationalCommand/operationalCommand'
import { SEVERITY_TOKENS } from '../../utils/intelligence/severity'
import styles from './OperationalCommand.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────

const MAX_PRIORITIES = 6   // compact panel — keep above-the-fold

function fmtClock(ms) {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

const READINESS_TONE = {
  // mowing
  normal:    styles.toneNeutral,
  delayed:   styles.toneCaution,
  // spray
  favorable: styles.toneGood,
  caution:   styles.toneCaution,
  poor:      styles.toneWarn,
  // irrigation
  elevated:  styles.toneWarn,
  // cart
  'path-only': styles.toneCaution,
  // labor
  light:     styles.toneGood,
  moderate:  styles.toneNeutral,
  heavy:     styles.toneCaution,
  // generic
  unknown:   styles.toneUnknown,
}

function ReadinessChip({ label, value }) {
  if (value == null) return null
  const cls = READINESS_TONE[value] ?? styles.toneNeutral
  return (
    <span className={`${styles.readinessChip} ${cls}`} title={`${label}: ${value}`}>
      <span className={styles.readinessLabel}>{label}</span>
      <span className={styles.readinessValue}>{value}</span>
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

export default function OperationalCommand() {
  const navigate = useNavigate()

  // Pull from every store the engine needs. Each store is already used
  // elsewhere on the dashboard — we're not adding new fetches.
  const { current, forecast, loading: weatherLoading } = useWeather()
  const { records: sprays = [] }            = useSpraysData()
  const { items:   inventory = [] }         = useInventoryData()
  const { labels = [] }                     = useImportedLabels()
  const { crewAssignments = [],
          equipmentReservations = [] }      = useAssignmentsData()
  const { events: calendarEvents = [] }     = useCalendarData()
  const { history }                         = useWeatherHistoryData()
  const { equipment = [],
          serviceLog = [] }                 = useEquipmentData()

  // Re-run the Phase 28 layers locally so we don't have to lift state.
  // All three are pure functions; cheap to recompute on render.
  const agronomic = useMemo(() => computeAgronomicIntelligence({
    sprays, labels, inventory, weather: { forecast },
  }), [sprays, labels, inventory, forecast])

  const sprayWindow = useMemo(() => computeSprayWindowIntel({
    current, forecast, sprays, labels,
  }), [current, forecast, sprays, labels])

  const irrigation = useMemo(() => computeIrrigationIntel({
    current, forecast, history,
  }), [current, forecast, history])

  // Top-level compose.
  const cmd = useMemo(() => composeOperationalPriorities({
    weather: { current, forecast },
    sprays, labels,
    agronomic, sprayWindow, irrigation,
    equipmentReservations,
    equipment,
    serviceLog,
    crewAssignments,
    calendarEvents,
  }), [
    current, forecast, sprays, labels, agronomic, sprayWindow, irrigation,
    equipmentReservations, equipment, serviceLog, crewAssignments, calendarEvents,
  ])

  if (weatherLoading) {
    return <p className={styles.empty}>Loading command center…</p>
  }

  const { priorities, readiness, timeline, sourceCoverage } = cmd
  const visible = priorities.slice(0, MAX_PRIORITIES)
  const extra   = priorities.length - visible.length

  function handleClick(p) {
    if (p?.route) navigate(p.route)
  }

  return (
    <div className={styles.wrap}>

      {/* ── Morning Readiness ──────────────────────────────────────────── */}
      <div className={styles.readinessStrip}>
        <span className={styles.readinessHead}>Morning Readiness</span>
        <ReadinessChip label="frost"      value={readiness.frostRisk ?? 'normal'} />
        <ReadinessChip label="mowing"     value={readiness.mowing} />
        <ReadinessChip label="spray"      value={readiness.spray} />
        <ReadinessChip label="irrigation" value={readiness.irrigationPressure} />
        <ReadinessChip label="cart"       value={readiness.cart} />
        <ReadinessChip label="labor"      value={readiness.labor} />
        {readiness.plannedSprays > 0 && (
          <span className={`${styles.readinessChip} ${styles.toneNeutral}`}>
            <span className={styles.readinessLabel}>sprays</span>
            <span className={styles.readinessValue}>{readiness.plannedSprays}</span>
          </span>
        )}
      </div>

      {/* ── Priorities ─────────────────────────────────────────────────── */}
      <div className={styles.prioritiesHead}>
        <span className={styles.prioritiesTitle}>Top Priorities</span>
        {priorities.length > 0 && (
          <span className={styles.prioritiesCount}>{priorities.length}</span>
        )}
      </div>

      {priorities.length === 0 ? (
        <p className={styles.empty}>
          No operational priorities — clear path for the morning
          {sourceCoverage && !sourceCoverage.crew && !sourceCoverage.calendar
            ? ' (some data sources offline)'
            : ''}.
        </p>
      ) : (
        <ul className={styles.priorityList}>
          {visible.map(p => {
            const meta = SEVERITY_TOKENS[p.severity] ?? SEVERITY_TOKENS.info
            const Tag  = p.route ? 'button' : 'div'
            return (
              <Tag
                key={p.id}
                type={p.route ? 'button' : undefined}
                className={`${styles.priorityItem} ${p.route ? styles.priorityItemClickable : ''}`}
                onClick={p.route ? () => handleClick(p) : undefined}
                title={`${p.why}${p.recommendedAction ? `\n\nRecommended: ${p.recommendedAction}` : ''}`}
              >
                <span
                  className={styles.severityPill}
                  style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
                >
                  {meta.label}
                </span>
                <span className={styles.priorityBody}>
                  <span className={styles.priorityTitle}>{p.title}</span>
                  <span className={styles.priorityWhy}>{p.why}</span>
                </span>
                <span className={styles.prioritySource}>{p.sourceSystem}</span>
              </Tag>
            )
          })}
          {extra > 0 && (
            <li className={styles.moreNote}>+ {extra} more priorities</li>
          )}
        </ul>
      )}

      {/* ── Next 12 hours timeline ─────────────────────────────────────── */}
      {timeline.length > 0 && (
        <>
          <div className={styles.timelineHead}>
            <span className={styles.prioritiesTitle}>Next 12 Hours</span>
          </div>
          <ul className={styles.timeline}>
            {timeline.slice(0, 6).map(t => (
              <li key={t.id} className={styles.timelineItem} data-kind={t.kind}>
                <span className={styles.timelineWhen}>{fmtClock(t.atMs)}</span>
                <span className={styles.timelineKindDot} data-kind={t.kind} aria-hidden="true" />
                <span className={styles.timelineLabel}>{t.label}</span>
                {t.sub && <span className={styles.timelineSub}>· {t.sub}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

    </div>
  )
}
