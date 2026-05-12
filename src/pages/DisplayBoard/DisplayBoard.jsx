// Phase 5 — Display Board.
//
// Employee-facing daily operations view. Read-only. Surfaces what's
// scheduled, who's assigned, what equipment is in play, and any
// safety / weather signal the crew should see at the 5:30 AM meeting.
//
// Privacy invariant: this page never imports payRate, emergencyContact,
// or inventory cost. The only crew field used is name (for assignment
// row display). Anything sourced from /pages/Employees is forbidden.
//
// Two render modes:
//   Standard (/display-board)        — inside Layout, sidebar visible
//   Board    (/display-board/board)  — top-level route, sidebar hidden,
//                                       larger text, designed for TV / tablet
//
// All data comes from existing persistent verticals — no new schema,
// no new endpoints, no duplication.

import { useMemo } from 'react'
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

const TODAY = new Date().toISOString().slice(0, 10)

const PRIORITY_LABELS = { high: 'HIGH', medium: 'MED', routine: 'ROUTINE', low: 'LOW' }
const PRIORITY_ORDER  = { high: 0, medium: 1, routine: 2, low: 3 }

const EVENT_TYPE_LABEL = {
  spray:       'Spray',
  crew:        'Crew',
  maintenance: 'Maintenance',
  agronomy:    'Agronomy',
  irrigation:  'Irrigation',
}

function fmtTime(t) {
  if (!t) return ''
  // accepts "HH:MM" or "HH:MM:SS"
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  const am   = hour < 12
  const h12  = ((hour + 11) % 12) + 1
  return `${h12}:${m} ${am ? 'AM' : 'PM'}`
}

function prettyDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

export default function DisplayBoard({ boardMode = false }) {
  const navigate                = useNavigate()
  const { events }              = useCalendarData()
  const { records: sprays }     = useSpraysData()
  const { crewAssignments, equipmentReservations } = useAssignmentsData()
  const { alerts }              = useAlertsData()
  const { employees }           = useCrewData()
  const { current, forecast }   = useWeather()
  const selectedCourse          = useSelectedCourse()
  const { notes: dailyNotes }   = useOperationsNotesData()

  // ── Today filter (canonical) ──────────────────────────────────────────
  const todayEvents = useMemo(() => {
    return events
      .filter(e => e.startDate === TODAY)
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 9
        const pb = PRIORITY_ORDER[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        return (a.startTime ?? '').localeCompare(b.startTime ?? '')
      })
  }, [events])

  const todayEventIds = useMemo(
    () => new Set(todayEvents.map(e => e.id)),
    [todayEvents],
  )

  // ── Crew lookup (NAME ONLY — never pay rate or private fields) ────────
  const employeeNameLookup = useMemo(() => {
    const m = new Map()
    for (const e of employees) {
      m.set(e.id, e.name ?? e.fullName ?? '—')
    }
    return m
  }, [employees])

  // ── Spray operations today ────────────────────────────────────────────
  const todaySprays = useMemo(() => {
    return sprays
      .filter(s => s.date === TODAY && s.status !== 'deleted')
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  }, [sprays])

  // ── Equipment in play today ───────────────────────────────────────────
  const todayEquipment = useMemo(() => {
    return equipmentReservations
      .filter(r => r.calendarEventId && todayEventIds.has(r.calendarEventId))
      .filter(r => r.status !== 'cancelled' && r.status !== 'released')
  }, [equipmentReservations, todayEventIds])

  // ── Crew assignments today ────────────────────────────────────────────
  const todayCrew = useMemo(() => {
    return crewAssignments
      .filter(a => a.calendarEventId && todayEventIds.has(a.calendarEventId))
      .filter(a => a.status !== 'cancelled')
  }, [crewAssignments, todayEventIds])

  // ── Active alerts ─────────────────────────────────────────────────────
  const liveAlerts = useMemo(() => {
    return (alerts ?? [])
      .filter(a => a.status !== 'dismissed' && a.status !== 'acknowledged')
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 9
        const pb = PRIORITY_ORDER[b.priority] ?? 9
        return pa - pb
      })
      .slice(0, 6)
  }, [alerts])

  // ── Today's daily briefings (Phase 6) ─────────────────────────────────
  // Phase 6 makes these the primary Notices source. Alerts and event
  // descriptions fall back only when no notes exist for today.
  const NOTE_PRIORITY_ORDER = {
    urgent: 0, safety: 1, weather: 2, important: 3, routine: 4,
  }
  const todayNotes = useMemo(() => {
    return (dailyNotes ?? [])
      .filter(n => n.status === 'active')
      .filter(n => n.noteDate === TODAY)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        const pa = NOTE_PRIORITY_ORDER[a.priority] ?? 9
        const pb = NOTE_PRIORITY_ORDER[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      })
  }, [dailyNotes])

  const rootCls = boardMode ? `${styles.root} ${styles.rootBoard}` : styles.root

  return (
    <div className={rootCls}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Daily Board</h1>
          <p className={styles.subtitle}>
            {prettyDate(TODAY)}
            {selectedCourse?.name ? ` · ${selectedCourse.shortName ?? selectedCourse.name}` : ''}
          </p>
        </div>
        <div className={styles.headerActions}>
          {!boardMode && (
            <button
              type="button"
              className={styles.modeBtn}
              onClick={() => navigate('/display-board/board')}
              title="Switch to full-screen TV / tablet mode"
            >
              Board Mode →
            </button>
          )}
          {boardMode && (
            <Link
              to="/display-board"
              className={styles.modeBtn}
              title="Return to standard navigation"
            >
              ← Exit Board Mode
            </Link>
          )}
        </div>
      </header>

      {/* ── Weather + Alerts band ──────────────────────────────────────── */}
      <div className={styles.topBand}>
        <WeatherCard current={current} forecast={forecast} />
        <AlertsCard alerts={liveAlerts} />
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────── */}
      <div className={styles.grid}>

        {/* Today's Tasks */}
        <DisplaySection
          title="Today's Tasks"
          hint={todayEvents.length === 0 ? 'No scheduled tasks for today' : `${todayEvents.length} scheduled`}
          wide
        >
          {todayEvents.length === 0 ? (
            <p className={styles.empty}>Nothing on the board for {prettyDate(TODAY)}.</p>
          ) : (
            todayEvents.map(ev => (
              <TaskCard
                key={ev.id}
                event={ev}
                crew={todayCrew.filter(a => a.calendarEventId === ev.id)}
                equipment={todayEquipment.filter(r => r.calendarEventId === ev.id)}
                resolveName={empId => employeeNameLookup.get(empId)}
              />
            ))
          )}
        </DisplaySection>

        {/* Spray Operations */}
        <DisplaySection
          title="Spray Operations"
          hint={todaySprays.length === 0 ? 'No spray applications today' : `${todaySprays.length} application${todaySprays.length !== 1 ? 's' : ''}`}
        >
          {todaySprays.length === 0 ? (
            <p className={styles.empty}>No spray applications scheduled today.</p>
          ) : (
            todaySprays.map(s => (
              <SprayCard key={s.id} spray={s} />
            ))
          )}
        </DisplaySection>

        {/* Equipment */}
        <DisplaySection
          title="Equipment in Play"
          hint={todayEquipment.length === 0 ? 'No reservations today' : `${todayEquipment.length} reserved`}
        >
          {todayEquipment.length === 0 ? (
            <p className={styles.empty}>No equipment reserved for today's tasks.</p>
          ) : (
            todayEquipment.map(r => {
              const linkedEvent = todayEvents.find(e => e.id === r.calendarEventId)
              return (
                <div key={r.id} className={styles.equipmentRow}>
                  <span className={styles.equipmentName}>{r.equipmentName}</span>
                  <span className={styles.equipmentMeta}>
                    {linkedEvent?.title ?? '—'}
                  </span>
                  <span className={styles.equipmentStatus} data-status={r.status}>{r.status}</span>
                </div>
              )
            })
          )}
        </DisplaySection>

        {/* Routing / Mow patterns — sourced from event tags */}
        <DisplaySection
          title="Routing & Mow Patterns"
          hint="From today's task tags"
        >
          <RoutingPanel events={todayEvents} />
        </DisplaySection>

        {/* Safety / Daily Notices */}
        <DisplaySection
          title="Daily Notices"
          hint={todayNotes.length > 0
            ? `${todayNotes.length} briefing${todayNotes.length !== 1 ? 's' : ''} from supervisor`
            : 'Safety, course conditions, supervisor notes'}
        >
          <NoticesPanel
            notes={todayNotes}
            events={todayEvents}
            alerts={liveAlerts}
          />
        </DisplaySection>

        {/* Photos placeholder */}
        <DisplaySection
          title="Photos"
          hint="Field photos arrive in a future phase"
        >
          <p className={styles.empty}>
            Photo upload &amp; task photo gallery will be added in a future
            phase. This section is reserved for crew-shot photos that
            superintendents can pin from the Operations Board.
          </p>
        </DisplaySection>

      </div>

      <footer className={styles.footer}>
        <span>Display Board · read-only · employee-facing</span>
        <span>Updated {new Date().toLocaleTimeString()}</span>
      </footer>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function DisplaySection({ title, hint, wide, children }) {
  return (
    <section className={`${styles.section} ${wide ? styles.sectionWide : ''}`}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {hint && <span className={styles.sectionHint}>{hint}</span>}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  )
}

function WeatherCard({ current, forecast }) {
  const temp = current?.currentTemp
  const has  = Number.isFinite(temp)
  const nextDay = forecast?.[0]
  return (
    <div className={styles.weatherCard}>
      <span className={styles.weatherLabel}>Weather</span>
      {has ? (
        <>
          <span className={styles.weatherTemp}>{Math.round(temp)}°F</span>
          {current?.wind && (
            <span className={styles.weatherSub}>
              {current.wind}{current.windDir ? ` ${current.windDir}` : ''}
            </span>
          )}
          {current?.humidity != null && (
            <span className={styles.weatherSub}>Humidity {current.humidity}%</span>
          )}
          {nextDay && (nextDay.label || nextDay.shortForecast) && (
            <span className={styles.weatherSub}>
              Tomorrow: {nextDay.label ?? nextDay.shortForecast}
            </span>
          )}
        </>
      ) : (
        <span className={styles.empty}>Weather not loaded.</span>
      )}
    </div>
  )
}

function AlertsCard({ alerts }) {
  return (
    <div className={styles.alertsCard}>
      <span className={styles.alertsLabel}>Active Alerts</span>
      {alerts.length === 0 ? (
        <span className={styles.empty}>No active alerts.</span>
      ) : (
        <ul className={styles.alertList}>
          {alerts.map(a => (
            <li key={a.id} className={styles.alertItem} data-priority={a.priority}>
              <strong>{a.title}</strong>
              {a.message && <span>{a.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TaskCard({ event, crew, equipment, resolveName }) {
  const crewNames = crew.map(a =>
    a.employeeId ? (resolveName(a.employeeId) ?? a.employeeName) : a.employeeName,
  )
  return (
    <div className={styles.taskCard} data-priority={event.priority}>
      <div className={styles.taskCardTop}>
        <span className={styles.taskTitle}>{event.title}</span>
        <span className={styles.taskBadge} data-priority={event.priority}>
          {PRIORITY_LABELS[event.priority] ?? 'TASK'}
        </span>
      </div>
      <div className={styles.taskMetaRow}>
        {event.startTime && <span>⏰ {fmtTime(event.startTime)}</span>}
        {event.eventType && <span>· {EVENT_TYPE_LABEL[event.eventType] ?? event.eventType}</span>}
        {event.location && <span>· {event.location}</span>}
      </div>
      {crewNames.length > 0 && (
        <div className={styles.taskCrewRow}>
          <span className={styles.taskLabel}>Crew:</span>
          <span>{crewNames.join(' · ')}</span>
        </div>
      )}
      {equipment.length > 0 && (
        <div className={styles.taskCrewRow}>
          <span className={styles.taskLabel}>Equipment:</span>
          <span>{equipment.map(e => e.equipmentName).join(' · ')}</span>
        </div>
      )}
      {event.description && (
        <p className={styles.taskNotes}>{event.description}</p>
      )}
    </div>
  )
}

function SprayCard({ spray }) {
  const reiActive = (spray.rei ?? 0) > 0
  return (
    <div className={styles.sprayCard} data-rei={reiActive ? 'true' : undefined}>
      <div className={styles.sprayHeader}>
        <span className={styles.sprayName}>{spray.applicationName ?? spray.area ?? 'Spray Application'}</span>
        {reiActive && (
          <span className={styles.reiBadge}>REI {spray.rei}h</span>
        )}
      </div>
      <div className={styles.taskMetaRow}>
        {spray.applicator && <span>{spray.applicator}</span>}
        {spray.area && <span>· {spray.area}</span>}
        {spray.acreage != null && <span>· {spray.acreage} ac</span>}
      </div>
      {spray.carrierVolume && (
        <p className={styles.sprayCarrier}>{spray.carrierVolume}</p>
      )}
      {Array.isArray(spray.products) && spray.products.length > 0 && (
        <p className={styles.sprayProducts}>
          {spray.products.map(p => p.name).filter(Boolean).join(' + ')}
        </p>
      )}
    </div>
  )
}

function RoutingPanel({ events }) {
  // Pull routing-relevant tags from today's events.
  const routes = events
    .filter(e => (e.tags ?? []).length > 0 || /mow|roll/i.test(e.title ?? ''))
    .map(e => ({
      title:    e.title,
      tags:     e.tags ?? [],
      location: e.location,
    }))

  if (routes.length === 0) {
    return <p className={styles.empty}>No routing or mow pattern notes on today's tasks.</p>
  }
  return routes.map((r, i) => (
    <div key={i} className={styles.routingRow}>
      <span className={styles.routingTitle}>{r.title}</span>
      {r.location && <span className={styles.routingMeta}>{r.location}</span>}
      {r.tags.length > 0 && (
        <div className={styles.routingTags}>
          {r.tags.map(t => (
            <span key={t} className={styles.routingTag}>{t}</span>
          ))}
        </div>
      )}
    </div>
  ))
}

function NoticesPanel({ notes, events, alerts }) {
  // Phase 6 — operations_daily_notes is now the primary source. Each
  // priority tier maps to a tone the renderer uses for the left border.
  // Falls back to high-priority alerts + event descriptions only when
  // the supervisor hasn't posted any briefings for today.
  if (notes && notes.length > 0) {
    return notes.map(n => (
      <NoticeWithPhotos
        key={n.id}
        note={n}
        tone={noticeTone(n.priority)}
      />
    ))
  }

  // ── Fallback: alerts + event descriptions (legacy Phase 5 behaviour)
  const highAlerts = alerts.filter(a => a.priority === 'high')
  const eventNotes = events
    .filter(e => e.description && e.description.length > 0)
    .slice(0, 4)

  if (eventNotes.length === 0 && highAlerts.length === 0) {
    return (
      <p className={styles.empty}>
        No briefings posted for today. Supervisors post operational notes from
        Operations &gt; Daily Briefing.
      </p>
    )
  }
  return (
    <>
      {highAlerts.map(a => (
        <div key={a.id} className={styles.noticeRow} data-tone="alert">
          <strong>{a.title}</strong>
          {a.message && <p>{a.message}</p>}
        </div>
      ))}
      {eventNotes.map(e => (
        <div key={e.id} className={styles.noticeRow}>
          <strong>{e.title}</strong>
          <p>{e.description}</p>
        </div>
      ))}
    </>
  )
}

function noticeTone(priority) {
  switch (priority) {
    case 'urgent':
    case 'safety':
      return 'alert'
    case 'weather':
      return 'weather'
    case 'important':
      return 'important'
    default:
      return undefined
  }
}

function titleFromBody(body) {
  if (!body) return 'Briefing'
  const first = body.split('\n')[0]
  return first.length > 60 ? first.slice(0, 57) + '…' : first
}

/**
 * Single notice row + attached photo strip (Phase 8).
 * Per-note hook so the Display Board only fetches attachments for the
 * briefings actually visible today.
 */
function NoticeWithPhotos({ note, tone }) {
  const { attachments } = useAttachmentsForParent('daily_briefing', note.id)
  return (
    <div
      className={styles.noticeRow}
      data-tone={tone}
      data-pinned={note.pinned ? 'true' : undefined}
    >
      <strong>
        {note.pinned && '📌 '}
        {note.title || titleFromBody(note.body)}
      </strong>
      <p>{note.body}</p>
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
