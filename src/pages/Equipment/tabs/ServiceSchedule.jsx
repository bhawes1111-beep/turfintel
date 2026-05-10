import { useMemo } from 'react'
import { useEquipmentData } from '../../../utils/equipment/equipmentStore'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import StatusBoard from '../../../components/primitives/StatusBoard'
import Timeline from '../../../components/primitives/Timeline'
import styles from '../Equipment.module.css'

// ── Tunables ──────────────────────────────────────────────────────────────
// Rough hours-per-day usage by category. This is a visibility tool, not a
// scheduling system — exact projection isn't the point; operational
// awareness is. Defaults are conservative.
const HOURS_PER_DAY_BY_CATEGORY = {
  'Greens Mower':  6,
  'Fairway Mower': 5,
  'Rough Mower':   4,
  'Spray':         3,
  'Utility':       4,
  'Specialty':     2,
}

const SERVICE_TYPE_BY_CATEGORY = {
  'Greens Mower':  'Reel Service',
  'Fairway Mower': 'Reel Service',
  'Rough Mower':   'Reel Service',
  'Spray':         'Tank Calibration',
  'Utility':       'Oil Change',
  'Specialty':     'PM',
}

const RANGE_START_DAYS = -14
const RANGE_END_DAYS   =  60
const DUE_SOON_HOURS   =  25  // matches EquipmentList's serviceWarning threshold

const STATUS_SORT = { overdue: 0, 'due-soon': 1, upcoming: 2 }

// ── Helpers ───────────────────────────────────────────────────────────────

function todayMidnight() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function parseISODate(s) {
  if (!s) return null
  return new Date(s + 'T00:00:00')
}

function dayOffsetFromToday(date) {
  if (!date) return null
  const today = todayMidnight()
  const ms = date.getTime() - today.getTime()
  return Math.round(ms / 86400000)
}

function hoursPerDay(category) {
  return HOURS_PER_DAY_BY_CATEGORY[category] ?? 4
}

function projectedDays(unit) {
  return (unit.nextServiceHours - unit.hours) / hoursPerDay(unit.category)
}

function serviceStatus(unit) {
  const remaining = unit.nextServiceHours - unit.hours
  if (remaining <= 0)             return 'overdue'
  if (remaining <= DUE_SOON_HOURS) return 'due-soon'
  return 'upcoming'
}

function formatTickDate(offset) {
  if (offset === 0) return 'Today'
  const d = todayMidnight()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Component ─────────────────────────────────────────────────────────────

/**
 * Service Schedule tab — Phase 4.0.
 *
 * Surfaces preventive-maintenance visibility across the fleet using the
 * Timeline primitive (second consumer, organic adoption). Each equipment
 * unit becomes a Timeline row. Each row carries:
 *   - one projected upcoming-service Item, positioned by hours-to-next ÷
 *     category usage rate
 *   - optionally one recent-service Item (latest completed log entry
 *     within the past 14 days)
 *
 * The tab owns: PM logic, interval math, status classification, service-
 * type labelling. Timeline owns: positioning, time rail, row layout,
 * now-line, gridlines.
 */
export default function ServiceSchedule({ onJumpToUnit, onJumpToMaintenance } = {}) {
  const { equipment, serviceLog } = useEquipmentData()

  const rows = useMemo(() => {
    return equipment
      .map(unit => {
        const status      = serviceStatus(unit)
        const projDays    = projectedDays(unit)
        const serviceType = SERVICE_TYPE_BY_CATEGORY[unit.category] ?? 'PM'

        // Latest completed log entry within range, if any
        const recentLog = serviceLog
          .filter(l =>
            l.equipmentId === unit.id &&
            l.status === 'completed' &&
            l.completedDate
          )
          .map(l => ({ ...l, offset: dayOffsetFromToday(parseISODate(l.completedDate)) }))
          .filter(l => l.offset != null && l.offset >= RANGE_START_DAYS && l.offset < 0)
          .sort((a, b) => b.offset - a.offset)[0] ?? null

        return { unit, status, projDays, serviceType, recentLog }
      })
      // Skip out-of-service units that have no projection (they aren't
      // accumulating hours; the schedule is meaningless).
      .filter(r => r.unit.status !== 'out-of-service' || r.status === 'overdue')
      .sort((a, b) =>
        STATUS_SORT[a.status] - STATUS_SORT[b.status] ||
        a.projDays - b.projDays
      )
  }, [equipment, serviceLog])

  const counts = useMemo(() => {
    let overdue = 0, dueSoon = 0, upcoming30 = 0, recentlyServiced = 0
    rows.forEach(r => {
      if (r.status === 'overdue')      overdue++
      else if (r.status === 'due-soon') dueSoon++
      else if (r.projDays <= 30)        upcoming30++
      if (r.recentLog)                  recentlyServiced++
    })
    return { overdue, dueSoon, upcoming30, recentlyServiced }
  }, [rows])

  const hasUnits = equipment.length > 0

  return (
    <div className={styles.eqRoot}>
      <WorkspaceSection
        title="Service Schedule"
        subtitle="Upcoming preventive maintenance and recent service activity across the fleet."
      >

        <StatusBoard columns={4}>
          <StatusBoard.Tile value={counts.overdue}          label="Overdue PMs"       tone="critical" />
          <StatusBoard.Tile value={counts.dueSoon}          label="Due Soon"          tone="warn" />
          <StatusBoard.Tile value={counts.upcoming30}       label="Upcoming · 30d"    tone="ok" />
          <StatusBoard.Tile value={counts.recentlyServiced} label="Recently Serviced" tone="info" />
        </StatusBoard>

        {!hasUnits ? (
          <EmptyState
            title="No equipment tracked yet."
            description="Service Schedule will populate as units, hour readings, and service intervals are recorded."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            title="No active service projections."
            description="All units are either out of service or have no upcoming maintenance within the visible window."
          />
        ) : (
          <Timeline
            start={RANGE_START_DAYS}
            end={RANGE_END_DAYS}
            now={0}
            labelWidth={140}
            minWidth={760}
            gridlines={(RANGE_END_DAYS - RANGE_START_DAYS) / 7}
            ariaLabel="Equipment service schedule"
          >
            <Timeline.Scale
              ticks={[-14, -7, 0, 7, 14, 21, 28, 35, 42, 49, 56]}
              format={formatTickDate}
            />
            {rows.map(r => {
              // Clamp the projection visually so far-future or far-past
              // events stay on the rail. Position math itself is honest —
              // clamping is only for visibility.
              const clamped = Math.max(
                RANGE_START_DAYS,
                Math.min(RANGE_END_DAYS - 2, r.projDays),
              )
              const nextTitle = `${r.serviceType} — ${r.unit.name} · ${r.unit.hours.toLocaleString()} / ${r.unit.nextServiceHours.toLocaleString()} hrs`
              return (
                <Timeline.Row key={r.unit.id} label={r.unit.name} ariaLabel={`${r.unit.name} schedule`}>
                  {r.recentLog && (
                    <Timeline.Item
                      key={`recent-${r.recentLog.id}`}
                      start={r.recentLog.offset}
                      span={1}
                      status="recent"
                      title={`${r.recentLog.serviceType} — completed ${r.recentLog.completedDate}`}
                      className={styles.eqServiceTimelineBlock}
                      onClick={onJumpToMaintenance ? () => onJumpToMaintenance(r.unit.name) : undefined}
                    />
                  )}
                  <Timeline.Item
                    key={`next-${r.unit.id}`}
                    start={clamped}
                    span={2}
                    status={r.status}
                    title={nextTitle}
                    className={styles.eqServiceTimelineBlock}
                    onClick={onJumpToUnit ? () => onJumpToUnit(r.unit.id) : undefined}
                  />
                </Timeline.Row>
              )
            })}
          </Timeline>
        )}

      </WorkspaceSection>
    </div>
  )
}
