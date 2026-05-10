import { useMemo, useState } from 'react'
import { useWeather } from '../../../utils/weather/useWeather'
import { CYCLES } from '../../../data/irrigation'
import ETCard from '../../../components/shared/weather/ETCard'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import StatusBoard from '../../../components/primitives/StatusBoard'
import Timeline from '../../../components/primitives/Timeline'
import SideDrawer from '../../../components/primitives/SideDrawer'
import styles from '../Irrigation.module.css'

// ── Night-window domain ───────────────────────────────────────────────────
// Range 18.0 → 30.0 = 6:00 PM tonight to 6:00 AM tomorrow. Hours past 24
// are treated as "next-day" hours of the same logical night window.
const NIGHT_START = 18
const NIGHT_END   = 30
const MORNING_OVERLAP_THRESHOLD = 27 // 03:00 AM — cycles ending after this
                                     // overlap with early morning routing

const AREAS = ['Greens', 'Tees', 'Fairways', 'Approaches', 'Roughs']

const STATUS_TONE = {
  running:   'ok',
  scheduled: 'info',
  completed: 'neutral',
  delayed:   'warn',
  fault:     'critical',
  skipped:   'neutral',
}

const STATUS_LABEL = {
  running:   'Running',
  scheduled: 'Scheduled',
  completed: 'Completed',
  delayed:   'Delayed',
  fault:     'Fault',
  skipped:   'Skipped',
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtHour(h) {
  const hh = ((h % 24) + 24) % 24
  if (hh === 0)  return '12A'
  if (hh < 12)   return `${hh}A`
  if (hh === 12) return 'N'
  return `${hh - 12}P`
}

function fmtClock(h) {
  // Format like "9:30 PM" / "12:45 AM" — for tooltips and detail copy.
  const hh = Math.floor(((h % 24) + 24) % 24)
  const mm = Math.round((h - Math.floor(h)) * 60)
  const meridiem = hh < 12 ? 'AM' : 'PM'
  const display  = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return `${display}:${String(mm).padStart(2, '0')} ${meridiem}`
}

function nowInNightWindow() {
  // Map "now" to the night-window domain. Returns null when current time
  // is between 6:00 AM and 6:00 PM (i.e., outside the night window).
  const d = new Date()
  const h = d.getHours() + d.getMinutes() / 60
  if (h >= NIGHT_START)         return h          // evening: 18-23.99
  if (h < (NIGHT_END - 24))     return h + 24     // early-morning: 0-5.99 → 24-29.99
  return null                                     // daytime: no overlap with night window
}

// ── Component ─────────────────────────────────────────────────────────────

/**
 * Irrigation Dashboard — Phase 4.1.
 *
 * Visibility surface for tonight's irrigation activity. Built around the
 * Timeline primitive (third consumer, organic adoption). Provides:
 *   - StatusBoard summary of cycle counts
 *   - Timeline of cycles across the 12-hour night window
 *   - SideDrawer with cycle detail on click
 *   - Morning-overlap subsection for cycles that bleed into routing hours
 *
 * Owns: cycle semantics, status classification, area grouping, time-domain
 * mapping, morning-overlap detection, click handlers.
 *
 * Timeline owns: position math, range/scale, rows, now-line, gridlines.
 */
export default function IrrigationDashboard() {
  const { current, etTrend } = useWeather()
  const [selectedCycleId, setSelectedCycleId] = useState(null)

  // Group cycles into rows by area (one row per area).
  const rowsByArea = useMemo(() => {
    const map = {}
    AREAS.forEach(a => { map[a] = [] })
    CYCLES.forEach(c => {
      if (!map[c.area]) return
      map[c.area].push(c)
    })
    return AREAS.map(a => ({ area: a, cycles: map[a] }))
                .filter(r => r.cycles.length > 0)
  }, [])

  // Counts for the StatusBoard.
  const counts = useMemo(() => {
    let running = 0, scheduled = 0, completed = 0, issues = 0
    CYCLES.forEach(c => {
      if (c.status === 'running')   running++
      if (c.status === 'scheduled') scheduled++
      if (c.status === 'completed') completed++
      if (c.status === 'delayed' || c.status === 'fault' || c.status === 'skipped') issues++
    })
    return { running, scheduled, completed, issues }
  }, [])

  // Morning-overlap detection — cycles that end after the routing
  // threshold and have not yet completed.
  const overlaps = useMemo(() => {
    return CYCLES
      .filter(c => {
        if (c.status === 'completed' || c.status === 'skipped') return false
        const end = c.startHour + (c.durationMin / 60)
        return end >= MORNING_OVERLAP_THRESHOLD
      })
      .sort((a, b) => (a.startHour + a.durationMin / 60) - (b.startHour + b.durationMin / 60))
  }, [])

  const selectedCycle = useMemo(
    () => CYCLES.find(c => c.id === selectedCycleId) ?? null,
    [selectedCycleId],
  )

  const hasCycles = CYCLES.length > 0
  const now = nowInNightWindow()

  return (
    <div className={styles.irDashWrap}>

      {/* ── Tonight's Watering (Phase 4.1) ───────────────────────────────── */}
      <WorkspaceSection
        title="Tonight's Watering"
        subtitle="Active and scheduled irrigation cycles across the night window. Updated as runs complete."
      >

        <StatusBoard columns={4}>
          <StatusBoard.Tile value={counts.running}   label="Running Now"        tone="ok" />
          <StatusBoard.Tile value={counts.scheduled} label="Scheduled"          tone="info" />
          <StatusBoard.Tile value={counts.completed} label="Completed Tonight"  tone="neutral" />
          <StatusBoard.Tile value={counts.issues}    label="Delayed / Issues"   tone="critical" />
        </StatusBoard>

        {!hasCycles ? (
          <EmptyState
            title="No irrigation cycles recorded yet."
            description="Tonight's cycles, runtimes, and zone-level status will appear here once a cycle is logged or imported from the controller."
          />
        ) : rowsByArea.length === 0 ? (
          <EmptyState
            compact
            title="No cycles in the visible window."
            description="No cycles fall within tonight's 6 PM — 6 AM window."
          />
        ) : (
          <Timeline
            start={NIGHT_START}
            end={NIGHT_END}
            now={now ?? undefined}
            labelWidth={108}
            minWidth={760}
            gridlines={NIGHT_END - NIGHT_START}
            ariaLabel="Tonight's irrigation cycles"
          >
            <Timeline.Scale
              ticks={[18, 20, 22, 24, 26, 28, 30]}
              format={fmtHour}
            />
            {rowsByArea.map(row => (
              <Timeline.Row key={row.area} label={row.area} ariaLabel={`${row.area} cycles`}>
                {row.cycles.map(c => {
                  const span = c.durationMin / 60
                  const endHour = c.startHour + span
                  const title = `${c.zone} · ${fmtClock(c.startHour)}–${fmtClock(endHour)} · ${STATUS_LABEL[c.status] ?? c.status}`
                  return (
                    <Timeline.Item
                      key={c.id}
                      start={c.startHour}
                      span={span}
                      status={c.status}
                      title={title}
                      className={styles.irCycleBlock}
                      onClick={() => setSelectedCycleId(c.id)}
                    />
                  )
                })}
              </Timeline.Row>
            ))}
          </Timeline>
        )}

        {/* Morning overlap — only render when actual overlaps exist */}
        {overlaps.length > 0 && (
          <div className={styles.irOverlapSection}>
            <p className={styles.irOverlapTitle}>Morning Overlap</p>
            <p className={styles.irOverlapHint}>
              These cycles run past {fmtClock(MORNING_OVERLAP_THRESHOLD)} and may delay morning routing.
            </p>
            <div className={styles.irOverlapList}>
              {overlaps.map(c => {
                const endHour = c.startHour + c.durationMin / 60
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.irOverlapChip}
                    data-status={c.status}
                    onClick={() => setSelectedCycleId(c.id)}
                    title={`${c.zone} — ends ${fmtClock(endHour)}`}
                  >
                    <span className={styles.irOverlapZone}>{c.zone}</span>
                    <span className={styles.irOverlapWhen}>ends {fmtClock(endHour)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

      </WorkspaceSection>

      {/* ── ET / weather context (existing) ─────────────────────────────── */}
      <ETCard current={current} trend={etTrend} />

      {/* ── Existing placeholder grid (unchanged) ───────────────────────── */}
      <div className={styles.irDashGrid}>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>System Status</p>
          <p className={styles.irDashCardSub}>Zone mapping, active/inactive zones, and pressure readings</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>Last Irrigation Cycle</p>
          <p className={styles.irDashCardSub}>Cycle summary, runtime by zone, total volume applied</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>Pump Station</p>
          <p className={styles.irDashCardSub}>Flow rate, pressure readings, VFD status, and alarms</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>Wet / Dry Map</p>
          <p className={styles.irDashCardSub}>Course moisture scouting overlay — hand-watering priorities</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>Toro Lynx Integration</p>
          <p className={styles.irDashCardSub}>Live sync with Lynx central controller for scheduling and alarms</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

        <div className={styles.irDashCard}>
          <p className={styles.irDashCardTitle}>ET &amp; Weather Adjust</p>
          <p className={styles.irDashCardSub}>ET-based runtime adjustments tied to weather station data</p>
          <span className={styles.irDashComingSoon}>Coming Soon</span>
        </div>

      </div>

      {/* ── Cycle detail drawer ─────────────────────────────────────────── */}
      {selectedCycle && (() => {
        const span     = selectedCycle.durationMin / 60
        const endHour  = selectedCycle.startHour + span
        const tone     = STATUS_TONE[selectedCycle.status] ?? 'neutral'
        const accent   =
          tone === 'critical' ? '#e05050' :
          tone === 'warn'     ? '#d4883a' :
          tone === 'ok'       ? '#4ecb4e' :
          tone === 'info'     ? '#5ba8a0' : '#4a9e4a'
        return (
          <SideDrawer
            open={!!selectedCycle}
            onClose={() => setSelectedCycleId(null)}
            accentColor={accent}
            ariaLabel="Irrigation cycle details"
          >
            <SideDrawer.Header
              title={selectedCycle.zone}
              subtitle={`${selectedCycle.area} · ${fmtClock(selectedCycle.startHour)}–${fmtClock(endHour)}`}
              status={
                <span className={styles.irCycleStatusBadge} data-status={selectedCycle.status}>
                  {STATUS_LABEL[selectedCycle.status] ?? selectedCycle.status}
                </span>
              }
              onClose={() => setSelectedCycleId(null)}
            />
            <SideDrawer.Body>
              <section className={styles.irModalSection}>
                <h3 className={styles.irModalSectionTitle}>Cycle Window</h3>
                <div className={styles.irModalGrid}>
                  <div className={styles.irModalField}>
                    <span className={styles.irModalFieldLabel}>Start</span>
                    <span className={styles.irModalFieldValue}>{fmtClock(selectedCycle.startHour)}</span>
                  </div>
                  <div className={styles.irModalField}>
                    <span className={styles.irModalFieldLabel}>End</span>
                    <span className={styles.irModalFieldValue}>{fmtClock(endHour)}</span>
                  </div>
                  <div className={styles.irModalField}>
                    <span className={styles.irModalFieldLabel}>Duration</span>
                    <span className={styles.irModalFieldValue}>{selectedCycle.durationMin} min</span>
                  </div>
                  <div className={styles.irModalField}>
                    <span className={styles.irModalFieldLabel}>Holes</span>
                    <span className={styles.irModalFieldValue}>
                      {selectedCycle.holes && selectedCycle.holes.length > 0
                        ? selectedCycle.holes.join(', ')
                        : '—'}
                    </span>
                  </div>
                </div>
              </section>

              {(selectedCycle.gallons != null || selectedCycle.pressure != null) && (
                <section className={styles.irModalSection}>
                  <h3 className={styles.irModalSectionTitle}>Volume & Pressure</h3>
                  <div className={styles.irModalGrid}>
                    {selectedCycle.gallons != null && (
                      <div className={styles.irModalField}>
                        <span className={styles.irModalFieldLabel}>Volume</span>
                        <span className={styles.irModalFieldValue}>
                          {selectedCycle.gallons.toLocaleString()} gal
                        </span>
                      </div>
                    )}
                    {selectedCycle.pressure != null && (
                      <div className={styles.irModalField}>
                        <span className={styles.irModalFieldLabel}>Pressure</span>
                        <span className={styles.irModalFieldValue}>{selectedCycle.pressure} PSI</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {endHour >= MORNING_OVERLAP_THRESHOLD && selectedCycle.status !== 'completed' && (
                <section className={styles.irModalSection}>
                  <h3 className={styles.irModalSectionTitle}>Morning Overlap</h3>
                  <p className={styles.irModalNote}>
                    This cycle runs past {fmtClock(MORNING_OVERLAP_THRESHOLD)}. Morning routing on
                    {selectedCycle.holes?.length ? ` holes ${selectedCycle.holes.join(', ')}` : ' affected areas'}
                    {' '}may need to be delayed or rerouted.
                  </p>
                </section>
              )}

              {selectedCycle.notes && (
                <section className={styles.irModalSection}>
                  <h3 className={styles.irModalSectionTitle}>Notes</h3>
                  <p className={styles.irModalNote}>{selectedCycle.notes}</p>
                </section>
              )}
            </SideDrawer.Body>
          </SideDrawer>
        )
      })()}

    </div>
  )
}
