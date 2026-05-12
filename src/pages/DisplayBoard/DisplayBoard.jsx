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
import { useCalendarData }    from '../../utils/calendar/calendarStore'
import { useSpraysData }      from '../../utils/sprays/spraysStore'
import { useAssignmentsData } from '../../utils/assignments/assignmentsStore'
import { useAlertsData }      from '../../utils/alerts/alertsStore'
import { useCrewData }        from '../../utils/crew/crewStore'
import { useWeather }         from '../../utils/weather/useWeather'
import { useSelectedCourse }  from '../../utils/courses/courseStore'
import { useOperationsNotesData } from '../../utils/operations/notesStore'
import { useAttachmentsForParent } from '../../utils/attachments/attachmentsStore'
import styles from './DisplayBoard.module.css'

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
  const { events }                                  = useCalendarData()
  const { records: sprays }                         = useSpraysData()
  const { crewAssignments, equipmentReservations }  = useAssignmentsData()
  const { alerts }                                  = useAlertsData()
  const { employees }                               = useCrewData()
  const { current, forecast }                       = useWeather()
  const selectedCourse                              = useSelectedCourse()
  const { notes: dailyNotes }                       = useOperationsNotesData()

  // Display date — defaults to today, can shift via the date selector.
  const [selectedDate, setSelectedDate] = useState(isoToday)

  // Live clock — tick every second.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

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

  // ── Render ────────────────────────────────────────────────────────────
  const rootCls = boardMode ? `${styles.root} ${styles.rootBoard}` : styles.root
  const weekIsos = weekOf(selectedDate)
  const todayIso = isoToday()

  return (
    <div className={rootCls}>

      <aside className={styles.sidebar}>
        <BrandHeader course={selectedCourse} />

        <DateClockPanel
          selectedDate={selectedDate}
          onChange={setSelectedDate}
          now={now}
          todayIso={todayIso}
        />

        <ConditionsPanel current={current} forecast={forecast} />

        <EquipmentStatusPanel
          reservations={dayEquipment}
          eventTitleLookup={Object.fromEntries(dayEvents.map(e => [e.id, e.title]))}
        />

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
            <p>No tasks scheduled for {prettyDate(selectedDate)}.</p>
            <p className={styles.emptyHint}>
              Tasks added in Operations &gt; Operations Board appear here automatically.
            </p>
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
        <NotesPanel notes={dayNotes} alerts={liveAlerts} events={dayEvents} />
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

function ConditionsPanel({ current, forecast }) {
  const temp = current?.currentTemp
  const has  = Number.isFinite(temp)
  const next = forecast?.[0]
  return (
    <div className={styles.sidePanel}>
      <span className={styles.sidePanelLabel}>Current Conditions</span>
      {has ? (
        <>
          <span className={styles.bigTemp}>{Math.round(temp)}°F</span>
          {current?.wind && (
            <span className={styles.sidePanelSub}>
              Wind {current.wind}{current.windDir ? ` ${current.windDir}` : ''}
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
  }))
  // Fallback to event.assignedStaff[] only when no crew_assignments rows
  // exist for the event. These fallback rows can't carry linked chips
  // (no row id to match on).
  const fallbackNames = crewRows.length === 0
    ? (event.assignedStaff ?? []).map((name, i) => ({ id: `fb-${i}`, name, role: null, chips: [] }))
    : crewRows

  return (
    <article className={styles.taskCard} data-priority={event.priority}>
      <header className={styles.taskCardHeader}>
        <div className={styles.taskTitleBlock}>
          <h2 className={styles.taskTitle}>{event.title}</h2>
          <div className={styles.taskMetaRow}>
            {event.startTime && <span>⏰ {fmtTime(event.startTime)}</span>}
            {event.eventType && <span>{EVENT_TYPE_LABEL[event.eventType] ?? event.eventType}</span>}
            {event.location && <span>{event.location}</span>}
          </div>
        </div>
        <span className={styles.priorityPill} data-priority={event.priority}>
          {PRIORITY_LABEL[event.priority] ?? 'TASK'}
        </span>
      </header>

      {headerChips.length > 0 && (
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
      )}

      {event.description && (
        <p className={styles.taskDescription}>{event.description}</p>
      )}

      {fallbackNames.length > 0 && (
        <ul className={styles.crewList}>
          {fallbackNames.map(c => (
            <li key={c.id} className={styles.crewRow}>
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
            </li>
          ))}
        </ul>
      )}
    </article>
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
