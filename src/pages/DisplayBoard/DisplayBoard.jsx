// Phase 9 — Display Board redesign.
//
// Crew-facing operations board styled like a real superintendent's
// 5:30 AM briefing wall. Three columns + bottom date strip:
//
//   ┌─SIDEBAR──┬─TASK CARDS GRID──────┬─NOTES COLUMN─┐
//   │ brand    │ Cards wrap into      │ Daily        │
//   │ course   │ 2–3 columns; each    │ briefings    │
//   │ date     │ card shows title,    │ + photos     │
//   │ clock    │ equipment chips,     │ + sprays     │
//   │ weather  │ assigned crew rows.  │              │
//   │ equip    │                      │              │
//   └──────────┴──────────────────────┴──────────────┘
//   │ Sun  Mon  Tue  Wed  Thu  Fri  Sat              │
//   └────────────────────────────────────────────────┘
//
// Read-only. Sourced from existing persistent verticals:
//   calendar_events, crew_assignments, equipment_reservations,
//   spray_records, operations_daily_notes, operational_attachments,
//   crew_employees (name only — no payRate / private fields).

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCalendarData,    refreshCalendarData }    from '../../utils/calendar/calendarStore'
import { useSpraysData,      refreshSpraysData }      from '../../utils/sprays/spraysStore'
import { useAssignmentsData, refreshAssignmentsData, patchCrewAssignment } from '../../utils/assignments/assignmentsStore'
import { useAlertsData,      refreshAlertsData }      from '../../utils/alerts/alertsStore'
import { useCrewData,        refreshCrewData }        from '../../utils/crew/crewStore'
import { useWeather }         from '../../utils/weather/useWeather'
import { useSelectedCourse }  from '../../utils/courses/courseStore'
import { useOperationsNotesData, refreshOperationsNotesData } from '../../utils/operations/notesStore'
import { useAttachmentsForParent } from '../../utils/attachments/attachmentsStore'
import { useToast } from '../../utils/feedback/toastContext'
import { routingChipsFromTags } from '../../utils/routing/routingTags'
import { weatherImpacts } from '../../utils/weather/weatherImpacts'
// Moisture observations are crew-relevant FIELD FACTS (location + wilt/dry-spot/
// handwater flags) — no private fields. The course condition log (which holds
// private superintendent notes) is intentionally NOT imported here.
import { useMoistureData, refreshMoisture } from '../../utils/moisture/moistureStore'
import OperationalIntelligencePanel from '../../components/shared/OperationalIntelligencePanel'
import styles from './DisplayBoard.module.css'

// Phase 33 — crew progress vocabulary. Schema-free: rides the existing
// crew_assignments.status column (default 'assigned'). 'cancelled' is
// reserved for the clear/unassign flow and isn't a progress state here.
const PROGRESS_STATUSES = [
  { key: 'assigned',  label: 'Assigned',  short: '○' },
  { key: 'completed', label: 'Complete',  short: '✓' },
  { key: 'delayed',   label: 'Delayed',   short: '◷' },
  { key: 'blocked',   label: 'Blocked',   short: '⚠' },
]
const PROGRESS_SHORT = Object.fromEntries(PROGRESS_STATUSES.map(s => [s.key, s.short]))
const PROGRESS_LABEL = Object.fromEntries(PROGRESS_STATUSES.map(s => [s.key, s.label]))

// The board is meant to live on a TV all morning — re-pull the
// operational verticals every few minutes so a task added at 6 AM
// shows up without anyone touching the screen.
const BOARD_REFRESH_MS = 3 * 60 * 1000

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PRIORITY_ORDER = { high: 0, medium: 1, routine: 2, low: 3 }
const NOTE_PRIORITY_ORDER = {
  urgent: 0, safety: 1, weather: 2, important: 3, routine: 4,
}

const EVENT_TYPE_LABEL = {
  spray:       'Spray',
  crew:        'Crew',
  maintenance: 'Maintenance',
  agronomy:    'Agronomy',
  irrigation:  'Irrigation',
}

const PRIORITY_LABEL = {
  high: 'HIGH', medium: 'MED', routine: 'ROUTINE', low: 'LOW',
}

function isoToday() { return new Date().toISOString().slice(0, 10) }

function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function prettyDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  const am   = hour < 12
  const h12  = ((hour + 11) % 12) + 1
  return `${h12}:${m} ${am ? 'AM' : 'PM'}`
}

function weekOf(iso) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() - d.getDay())   // back to Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d)
    day.setDate(d.getDate() + i)
    return day.toISOString().slice(0, 10)
  })
}

function noticeTone(priority) {
  switch (priority) {
    case 'urgent':
    case 'safety':    return 'alert'
    case 'weather':   return 'weather'
    case 'important': return 'important'
    default:          return undefined
  }
}

function titleFromBody(body) {
  if (!body) return 'Briefing'
  const first = body.split('\n')[0]
  return first.length > 60 ? first.slice(0, 57) + '…' : first
}

// ── Main component ───────────────────────────────────────────────────────

export default function DisplayBoard({ boardMode = false }) {
  const navigate                                    = useNavigate()
  const { events, loading: eventsLoading }          = useCalendarData()
  const { records: sprays }                         = useSpraysData()
  const { crewAssignments, equipmentReservations }  = useAssignmentsData()
  const { alerts }                                  = useAlertsData()
  const { employees }                               = useCrewData()
  const { current, forecast, sourceLabel: weatherSource } = useWeather()
  const selectedCourse                              = useSelectedCourse()
  const { notes: dailyNotes }                       = useOperationsNotesData()
  const { observations: moistureObs }               = useMoistureData()

  // Display date — defaults to today, can shift via the date selector.
  const [selectedDate, setSelectedDate] = useState(isoToday)

  // Live clock — tick every second.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Auto-refresh the operational verticals so a board left on a TV
  // stays live without a manual reload. Weather already self-refreshes
  // inside useWeather.
  const [lastSync, setLastSync] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => {
      Promise.allSettled([
        refreshCalendarData(),
        refreshSpraysData(),
        refreshAssignmentsData(),
        refreshAlertsData(),
        refreshCrewData(),
        refreshOperationsNotesData(),
        refreshMoisture(),
      ]).then(() => setLastSync(new Date()))
    }, BOARD_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  // First-paint guard — before the calendar store resolves, every
  // section would otherwise render its empty state ("No tasks…"),
  // making a freshly-opened board look broken.
  const isFirstLoad = eventsLoading && events.length === 0

  // ── Crew name lookup (ID → name; never reads payRate) ─────────────────
  const employeeNameLookup = useMemo(() => {
    const m = new Map()
    for (const e of employees) m.set(e.id, e.name ?? e.fullName ?? '—')
    return m
  }, [employees])

  // ── Date-scoped derivations ───────────────────────────────────────────
  const dayEvents = useMemo(() => {
    return events
      .filter(e => e.startDate === selectedDate)
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 9
        const pb = PRIORITY_ORDER[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        return (a.startTime ?? '').localeCompare(b.startTime ?? '')
      })
  }, [events, selectedDate])

  const dayEventIds = useMemo(
    () => new Set(dayEvents.map(e => e.id)),
    [dayEvents],
  )

  const daySprays = useMemo(() => {
    return sprays
      .filter(s => s.date === selectedDate && s.status !== 'deleted')
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  }, [sprays, selectedDate])

  const dayEquipment = useMemo(() => {
    return equipmentReservations
      .filter(r => r.calendarEventId && dayEventIds.has(r.calendarEventId))
      .filter(r => r.status !== 'cancelled' && r.status !== 'released')
  }, [equipmentReservations, dayEventIds])

  const dayCrew = useMemo(() => {
    return crewAssignments
      .filter(a => a.calendarEventId && dayEventIds.has(a.calendarEventId))
      .filter(a => a.status !== 'cancelled')
  }, [crewAssignments, dayEventIds])

  const liveAlerts = useMemo(() => {
    return (alerts ?? [])
      .filter(a => a.status !== 'dismissed' && a.status !== 'acknowledged')
      .slice(0, 6)
  }, [alerts])

  const dayNotes = useMemo(() => {
    return (dailyNotes ?? [])
      .filter(n => n.status === 'active')
      .filter(n => n.noteDate === selectedDate)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        const pa = NOTE_PRIORITY_ORDER[a.priority] ?? 9
        const pb = NOTE_PRIORITY_ORDER[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      })
  }, [dailyNotes, selectedDate])

  // Per-event lookup for equipment + crew (so the card render is O(N) total).
  const equipByEvent = useMemo(() => {
    const m = new Map()
    for (const r of dayEquipment) {
      if (!m.has(r.calendarEventId)) m.set(r.calendarEventId, [])
      m.get(r.calendarEventId).push(r)
    }
    return m
  }, [dayEquipment])

  const crewByEvent = useMemo(() => {
    const m = new Map()
    for (const a of dayCrew) {
      if (!m.has(a.calendarEventId)) m.set(a.calendarEventId, [])
      m.get(a.calendarEventId).push(a)
    }
    return m
  }, [dayCrew])

  // ── Crew-facing weather impacts (rule-based, from existing weather) ─────
  const impacts = useMemo(
    () => weatherImpacts(current ?? {}, forecast ?? []),
    [current, forecast],
  )

  // ── Course watch areas (crew-relevant moisture flags) ──────────────────
  // Only field facts: location + which flag. No moisture %, no deficit, no
  // private condition-log data. Newest observation per location wins; only
  // recent (≤36h) flagged observations surface so stale reads don't linger.
  const watchAreas = useMemo(() => {
    const nowMs = now.getTime()   // from the live clock state → pure per render
    const seen = new Set()
    const out = []
    for (const o of moistureObs ?? []) {        // store is newest-first
      if (!o?.location || seen.has(o.location)) continue
      seen.add(o.location)
      const ageH = (nowMs - Date.parse(o.observedAt)) / 3_600_000
      if (!Number.isFinite(ageH) || ageH > 36) continue
      const flags = []
      if (o.handwaterRec) flags.push('Handwater')
      if (o.wiltStress)   flags.push('Wilt')
      if (o.drySpot)      flags.push('Dry spot')
      if (flags.length > 0) out.push({ id: o.id, location: o.location, flags })
    }
    return out.slice(0, 8)
  }, [moistureObs, now])

  // ── Render ────────────────────────────────────────────────────────────
  const rootCls = boardMode ? `${styles.root} ${styles.rootBoard}` : styles.root
  const weekIsos = weekOf(selectedDate)
  const todayIso = isoToday()

  return (
    <div className={rootCls}>

      <div className={styles.printHeader} aria-hidden="true">
        {selectedCourse?.shortName ?? selectedCourse?.name ?? 'TurfIntel'}
        {' · '}{prettyDate(selectedDate)}
      </div>

      <aside className={styles.sidebar}>
        <BrandHeader course={selectedCourse} />

        <DateClockPanel
          selectedDate={selectedDate}
          onChange={setSelectedDate}
          now={now}
          todayIso={todayIso}
        />

        <ConditionsPanel current={current} forecast={forecast} sourceLabel={weatherSource} />

        <WeatherImpactsPanel impacts={impacts} />

        <EquipmentStatusPanel
          reservations={dayEquipment}
          eventTitleLookup={Object.fromEntries(dayEvents.map(e => [e.id, e.title]))}
        />

        <div className={styles.syncLine}>
          Synced {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {' · '}auto-refresh 3 min
        </div>

        <ModeToggle boardMode={boardMode} navigate={navigate} />
      </aside>

      <main className={styles.taskBoard}>
        <header className={styles.taskBoardHeader}>
          <h1 className={styles.taskBoardTitle}>Daily Operations Board</h1>
          <span className={styles.taskBoardSubtitle}>
            {prettyDate(selectedDate)}
            {dayEvents.length > 0 && ` · ${dayEvents.length} task${dayEvents.length !== 1 ? 's' : ''}`}
          </span>
        </header>

        {dayEvents.length === 0 ? (
          <div className={styles.emptyBoard}>
            {isFirstLoad ? (
              <p>Loading operations board…</p>
            ) : (
              <>
                <p>No tasks scheduled for {prettyDate(selectedDate)}.</p>
                <p className={styles.emptyHint}>
                  Tasks added in Operations &gt; Operations Board appear here automatically.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className={styles.tasksGrid}>
            {dayEvents.map(ev => (
              <TaskCard
                key={ev.id}
                event={ev}
                equipment={equipByEvent.get(ev.id) ?? []}
                crew={crewByEvent.get(ev.id) ?? []}
                resolveName={empId => employeeNameLookup.get(empId)}
              />
            ))}
          </div>
        )}
      </main>

      <aside className={styles.notesColumn}>
        <OperationalIntelligencePanel />
        <NotesPanel notes={dayNotes} alerts={liveAlerts} events={dayEvents} />
        {watchAreas.length > 0 && <CourseWatchAreasPanel areas={watchAreas} />}
        {daySprays.length > 0 && (
          <SprayPanel sprays={daySprays} />
        )}
        {liveAlerts.length > 0 && dayNotes.length > 0 && (
          <AlertsPanel alerts={liveAlerts} />
        )}
      </aside>

      <footer className={styles.dateStrip}>
        {weekIsos.map((iso, i) => {
          const dnum = Number(iso.slice(8, 10))
          const isSelected = iso === selectedDate
          const isToday    = iso === todayIso
          return (
            <button
              key={iso}
              type="button"
              className={
                `${styles.dateCell}`
                + (isSelected ? ` ${styles.dateCellActive}` : '')
                + (isToday    ? ` ${styles.dateCellToday}`  : '')
              }
              onClick={() => setSelectedDate(iso)}
            >
              <span className={styles.dateCellLabel}>{DAY_LABELS[i]}</span>
              <span className={styles.dateCellNum}>{dnum}</span>
            </button>
          )
        })}
      </footer>
    </div>
  )
}

/* ── Sidebar pieces ─────────────────────────────────────────────────── */

function BrandHeader({ course }) {
  return (
    <div className={styles.brand}>
      <span className={styles.brandMark}>TurfIntel</span>
      <span className={styles.brandCourse}>
        {course?.shortName ?? course?.name ?? '—'}
      </span>
    </div>
  )
}

function DateClockPanel({ selectedDate, onChange, now, todayIso }) {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return (
    <div className={styles.dateClockPanel}>
      <div className={styles.dateRow}>
        <button
          type="button"
          className={styles.dateNav}
          onClick={() => onChange(shiftDate(selectedDate, -1))}
          aria-label="Previous day"
        >‹</button>
        <span className={styles.dateText}>{selectedDate}</span>
        <button
          type="button"
          className={styles.dateNav}
          onClick={() => onChange(shiftDate(selectedDate, 1))}
          aria-label="Next day"
        >›</button>
      </div>
      {selectedDate !== todayIso && (
        <button
          type="button"
          className={styles.todayBtn}
          onClick={() => onChange(todayIso)}
        >
          Jump to today
        </button>
      )}
      <div className={styles.clock}>
        <span className={styles.clockH}>{hh}</span>
        <span className={styles.clockSep}>:</span>
        <span className={styles.clockM}>{mm}</span>
        <span className={styles.clockS}>:{ss}</span>
      </div>
    </div>
  )
}

function ConditionsPanel({ current, forecast, sourceLabel }) {
  const temp = current?.currentTemp
  const has  = Number.isFinite(temp)
  const next = forecast?.[0]
  return (
    <div className={styles.sidePanel}>
      <span className={styles.sidePanelLabel}>
        Current Conditions
        {sourceLabel && (
          <span className={styles.sourceTag}>{sourceLabel}</span>
        )}
      </span>
      {has ? (
        <>
          <span className={styles.bigTemp}>{Math.round(temp)}°F</span>
          {current?.wind != null && (
            <span className={styles.sidePanelSub}>
              Wind {current.wind}{current.windDir ? ` ${current.windDir}` : ''}
              {current.windGust != null && ` · gust ${Math.round(current.windGust)}`}
            </span>
          )}
          {current?.humidity != null && (
            <span className={styles.sidePanelSub}>Humidity {current.humidity}%</span>
          )}
          {current?.dewPoint != null && (
            <span className={styles.sidePanelSub}>Dew Point {current.dewPoint}°F</span>
          )}
        </>
      ) : (
        <span className={styles.sidePanelEmpty}>Weather not loaded.</span>
      )}
      {next && (next.label || next.shortForecast) && (
        <div className={styles.forecastRow}>
          <span className={styles.sidePanelSub}>
            Tomorrow: <strong>{next.label ?? next.shortForecast}</strong>
          </span>
        </div>
      )}
    </div>
  )
}

// Crew-facing weather impacts — glanceable chips, hidden when nothing notable.
function WeatherImpactsPanel({ impacts }) {
  if (!impacts || impacts.length === 0) return null
  return (
    <div className={styles.sidePanel}>
      <span className={styles.sidePanelLabel}>Weather Impacts</span>
      <div className={styles.impactRow}>
        {impacts.map(im => (
          <span key={im.key} className={styles.impactChip} data-severity={im.severity}>
            {im.label}{im.detail ? ` · ${im.detail}` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

// Course Watch Areas — crew-relevant moisture flags (location + flag only).
// Source: moisture_observations (field facts; no private data, no % / deficit).
function CourseWatchAreasPanel({ areas }) {
  return (
    <section className={styles.notesPanel}>
      <header className={styles.notesPanelHeader}>
        <h3 className={styles.notesPanelTitle}>Course Watch Areas</h3>
        <span className={styles.notesPanelHint}>{areas.length} area{areas.length !== 1 ? 's' : ''}</span>
      </header>
      <ul className={styles.watchList}>
        {areas.map(a => (
          <li key={a.id} className={styles.watchRow}>
            <span className={styles.watchLoc}>{a.location}</span>
            <span className={styles.watchFlags}>
              {a.flags.map(f => (
                <span
                  key={f}
                  className={styles.watchFlag}
                  data-flag={String(f).toLowerCase().replace(/\s+/g, '-')}
                >
                  {f}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function EquipmentStatusPanel({ reservations, eventTitleLookup }) {
  return (
    <div className={styles.sidePanel}>
      <span className={styles.sidePanelLabel}>Equipment Status</span>
      {reservations.length === 0 ? (
        <span className={styles.sidePanelEmpty}>No equipment reserved today.</span>
      ) : (
        <ul className={styles.equipList}>
          {reservations.map(r => (
            <li key={r.id} className={styles.equipRow}>
              <span className={styles.equipChip}>{r.equipmentName}</span>
              <span className={styles.equipMeta}>
                {eventTitleLookup[r.calendarEventId] ?? '—'}
              </span>
              <span className={styles.equipStatus} data-status={r.status}>{r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ModeToggle({ boardMode, navigate }) {
  if (boardMode) {
    return (
      <Link to="/display-board" className={styles.modeBtn}>← Exit Board Mode</Link>
    )
  }
  return (
    <button
      type="button"
      className={styles.modeBtn}
      onClick={() => navigate('/display-board/board')}
    >
      Board Mode →
    </button>
  )
}

/* ── Task card ──────────────────────────────────────────────────────── */

function TaskCard({ event, equipment, crew, resolveName }) {
  // ── Phase 10 chip resolution ──────────────────────────────────────────
  // Priority order per spec:
  //   1. linked employee equipment       (chip rendered beside the crew row)
  //   2. task-level reservation chips    (unlinked equipment_reservations)
  //   3. event.equipment[] payload       (legacy, no reservations exist)
  //   4. no chips
  //
  // A reservation linked to a crew_assignment we can locate goes under
  // that employee's row. Everything else stays at the task header.
  const crewIds          = new Set(crew.map(a => a.id))
  const linkedByAssign   = new Map()
  const taskLevelChips   = []
  for (const r of equipment) {
    if (r.crewAssignmentId && crewIds.has(r.crewAssignmentId)) {
      if (!linkedByAssign.has(r.crewAssignmentId)) {
        linkedByAssign.set(r.crewAssignmentId, [])
      }
      linkedByAssign.get(r.crewAssignmentId).push({
        id: r.id, name: r.equipmentName, status: r.status,
      })
    } else {
      taskLevelChips.push({
        id: r.id, name: r.equipmentName, status: r.status,
      })
    }
  }

  // Fallback to event.equipment[] payload only when no reservations
  // exist on the event at all.
  const headerChips = taskLevelChips.length > 0
    ? taskLevelChips
    : (equipment.length === 0
        ? (event.equipment ?? []).map((name, i) => ({ id: `eq-${i}`, name, status: null }))
        : [])

  const crewRows = crew.map(a => ({
    id:       a.id,
    name:     a.employeeId ? (resolveName(a.employeeId) ?? a.employeeName) : a.employeeName,
    role:     a.role,
    chips:    linkedByAssign.get(a.id) ?? [],
    status:   a.status ?? 'assigned',
    notes:    a.notes ?? '',
    real:     true,   // backed by a crew_assignment row → status is patchable
  }))
  // Fallback to event.assignedStaff[] only when no crew_assignments rows
  // exist for the event. These fallback rows can't carry linked chips
  // (no row id to match on) and aren't status-patchable.
  const fallbackNames = crewRows.length === 0
    ? (event.assignedStaff ?? []).map((name, i) => ({ id: `fb-${i}`, name, role: null, chips: [], status: 'assigned', notes: '', real: false }))
    : crewRows

  // Phase 34 — routing/mowing visual chips from existing event.tags[].
  const { chips: routingChips, extra: routingExtra } = routingChipsFromTags(event.tags)

  // Phase 6B.1 — card-level progress escalation. Only real (DB-backed) rows
  // contribute; fallback name-only rows have no patchable status.
  const cardProgress =
    crewRows.length === 0 ? null
    : crewRows.some(r => r.status === 'blocked')    ? 'blocked'
    : crewRows.some(r => r.status === 'delayed')    ? 'delayed'
    : crewRows.every(r => r.status === 'completed') ? 'completed'
    : null

  return (
    <article
      className={styles.taskCard}
      data-priority={event.priority}
      data-card-progress={cardProgress ?? undefined}
    >
      <header className={styles.taskCardHeader}>
        <div className={styles.taskTitleBlock}>
          <h2 className={styles.taskTitle}>{event.title}</h2>
          <div className={styles.taskMetaRow}>
            {event.eventType && <span>{EVENT_TYPE_LABEL[event.eventType] ?? event.eventType}</span>}
            {event.location && <span>{event.location}</span>}
          </div>
        </div>
        <div className={styles.headerRight}>
          {event.startTime && (
            <span className={styles.timePill}>{fmtTime(event.startTime)}</span>
          )}
          <span className={styles.priorityPill} data-priority={event.priority}>
            {PRIORITY_LABEL[event.priority] ?? 'TASK'}
          </span>
        </div>
      </header>

      {routingChips.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Route</span>
          <div className={styles.routingRow}>
            {routingChips.map(c => (
              <span
                key={c.key}
                className={styles.routingChip}
                data-tone={c.tone}
                title={c.label}
              >
                <span className={styles.routingIcon} aria-hidden="true">{c.icon}</span>
                <span className={styles.routingLabel}>{c.label}</span>
              </span>
            ))}
            {routingExtra > 0 && (
              <span className={styles.routingMore}>+{routingExtra}</span>
            )}
          </div>
        </div>
      )}

      {headerChips.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Equip</span>
          <div className={styles.chipRow}>
            {headerChips.map(c => (
              <span
                key={c.id}
                className={styles.chip}
                data-status={c.status}
                title={c.status ? `${c.name} · ${c.status}` : c.name}
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {event.description && (
        <p className={styles.taskDescription}>{event.description}</p>
      )}

      {fallbackNames.length > 0 && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Crew</span>
          <ul className={styles.crewList}>
            {fallbackNames.map(c => (
            <li key={c.id} className={styles.crewRow} data-progress={c.status}>
              <span className={styles.crewName}>{c.name}</span>
              {c.role && <span className={styles.crewRole}>· {c.role}</span>}
              {c.chips.length > 0 && (
                <span className={styles.crewChips}>
                  {c.chips.map(chip => (
                    <span
                      key={chip.id}
                      className={styles.chip}
                      data-status={chip.status}
                      title={chip.status ? `${chip.name} · ${chip.status}` : chip.name}
                    >
                      {chip.name}
                    </span>
                  ))}
                </span>
              )}
              {c.real && (
                <CrewStatusControl
                  assignmentId={c.id}
                  status={c.status}
                  notes={c.notes}
                />
              )}
            </li>
          ))}
          </ul>
        </div>
      )}
    </article>
  )
}

/* ── Crew progress control (Phase 33) ───────────────────────────────────
 *
 * Two-tap status update: tap the chip to open the picker, tap a status to
 * set it (optimistic via patchCrewAssignment). An optional quick note is
 * saved alongside. Schema-free — rides crew_assignments.status + .notes.
 */
function CrewStatusControl({ assignmentId, status, notes }) {
  const [open, setOpen]   = useState(false)
  const [busy, setBusy]   = useState(false)
  const [note, setNote]   = useState(notes ?? '')
  const toast = useToast()

  async function applyStatus(next) {
    setBusy(true)
    try {
      await patchCrewAssignment(assignmentId, { status: next })
      toast?.success?.(`Marked ${PROGRESS_LABEL[next] ?? next}`)
      setOpen(false)
    } catch (err) {
      toast?.error?.(`Update failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function saveNote() {
    const trimmed = note.trim()
    if (trimmed === (notes ?? '').trim()) { setOpen(false); return }
    setBusy(true)
    try {
      await patchCrewAssignment(assignmentId, { notes: trimmed })
      toast?.success?.('Note saved')
      setOpen(false)
    } catch (err) {
      toast?.error?.(`Note failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className={styles.progressWrap}>
      <button
        type="button"
        className={styles.progressChip}
        data-progress={status}
        onClick={() => setOpen(o => !o)}
        title={`Status: ${PROGRESS_LABEL[status] ?? status} — tap to change`}
        aria-label={`Crew status ${PROGRESS_LABEL[status] ?? status}`}
      >
        {PROGRESS_SHORT[status] ?? '○'}
      </button>
      {open && (
        <div className={styles.progressPicker} role="menu">
          <div className={styles.progressBtns}>
            {PROGRESS_STATUSES.map(s => (
              <button
                key={s.key}
                type="button"
                className={styles.progressOption}
                data-progress={s.key}
                data-active={s.key === status ? 'true' : undefined}
                disabled={busy}
                onClick={() => applyStatus(s.key)}
              >
                <span aria-hidden="true">{s.short}</span> {s.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            className={styles.progressNote}
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={saveNote}
            placeholder="Quick note (optional)"
            disabled={busy}
          />
        </div>
      )}
    </span>
  )
}

/* ── Notes column pieces ────────────────────────────────────────────── */

function NotesPanel({ notes, alerts, events }) {
  return (
    <section className={styles.notesPanel}>
      <header className={styles.notesPanelHeader}>
        <h3 className={styles.notesPanelTitle}>Daily Briefing</h3>
        <span className={styles.notesPanelHint}>
          {notes.length > 0
            ? `${notes.length} from supervisor`
            : 'Safety · routing · conditions'}
        </span>
      </header>
      {notes.length > 0 ? (
        notes.map(n => (
          <NoticeWithPhotos key={n.id} note={n} tone={noticeTone(n.priority)} />
        ))
      ) : (
        <FallbackNotices alerts={alerts} events={events} />
      )}
    </section>
  )
}

function NoticeWithPhotos({ note, tone }) {
  const { attachments } = useAttachmentsForParent('daily_briefing', note.id)
  return (
    <div
      className={styles.noticeRow}
      data-tone={tone}
      data-pinned={note.pinned ? 'true' : undefined}
    >
      <strong className={styles.noticeTitle}>
        {note.pinned && '📌 '}
        {note.title || titleFromBody(note.body)}
      </strong>
      <p className={styles.noticeBody}>{note.body}</p>
      {attachments.length > 0 && (
        <div className={styles.noticePhotos}>
          {attachments.map(att => (
            <a
              key={att.id}
              className={styles.noticePhoto}
              href={att.url}
              target="_blank"
              rel="noreferrer"
              title={att.caption ?? att.fileName ?? 'briefing photo'}
            >
              <img src={att.url} alt={att.caption ?? att.fileName ?? 'briefing photo'} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function FallbackNotices({ alerts, events }) {
  const highAlerts = alerts.filter(a => a.priority === 'high')
  const eventNotes = events
    .filter(e => e.description && e.description.length > 0)
    .slice(0, 4)
  if (highAlerts.length === 0 && eventNotes.length === 0) {
    return (
      <p className={styles.notesEmpty}>
        No briefings yet. Post one in Operations &gt; Daily Briefing.
      </p>
    )
  }
  return (
    <>
      {highAlerts.map(a => (
        <div key={a.id} className={styles.noticeRow} data-tone="alert">
          <strong className={styles.noticeTitle}>{a.title}</strong>
          {a.message && <p className={styles.noticeBody}>{a.message}</p>}
        </div>
      ))}
      {eventNotes.map(e => (
        <div key={e.id} className={styles.noticeRow}>
          <strong className={styles.noticeTitle}>{e.title}</strong>
          <p className={styles.noticeBody}>{e.description}</p>
        </div>
      ))}
    </>
  )
}

function SprayPanel({ sprays }) {
  return (
    <section className={styles.notesPanel}>
      <header className={styles.notesPanelHeader}>
        <h3 className={styles.notesPanelTitle}>Spray Operations</h3>
        <span className={styles.notesPanelHint}>
          {sprays.length} application{sprays.length !== 1 ? 's' : ''}
        </span>
      </header>
      {sprays.map(s => (
        <div
          key={s.id}
          className={styles.sprayRow}
          data-rei={(s.rei ?? 0) > 0 ? 'true' : undefined}
        >
          <div className={styles.sprayHeader}>
            <span className={styles.sprayName}>
              {s.applicationName ?? s.area ?? 'Spray Application'}
            </span>
            {(s.rei ?? 0) > 0 && (
              <span className={styles.reiBadge}>REI {s.rei}h</span>
            )}
          </div>
          <div className={styles.taskMetaRow}>
            {s.applicator && <span>{s.applicator}</span>}
            {s.area && <span>· {s.area}</span>}
            {s.acreage != null && <span>· {s.acreage} ac</span>}
          </div>
          {Array.isArray(s.products) && s.products.length > 0 && (
            <p className={styles.sprayProducts}>
              {s.products.map(p => p.name).filter(Boolean).join(' + ')}
            </p>
          )}
        </div>
      ))}
    </section>
  )
}

function AlertsPanel({ alerts }) {
  return (
    <section className={styles.notesPanel}>
      <header className={styles.notesPanelHeader}>
        <h3 className={styles.notesPanelTitle}>Active Alerts</h3>
        <span className={styles.notesPanelHint}>{alerts.length}</span>
      </header>
      {alerts.map(a => (
        <div
          key={a.id}
          className={styles.noticeRow}
          data-tone={a.priority === 'high' ? 'alert' : undefined}
        >
          <strong className={styles.noticeTitle}>{a.title}</strong>
          {a.message && <p className={styles.noticeBody}>{a.message}</p>}
        </div>
      ))}
    </section>
  )
}
