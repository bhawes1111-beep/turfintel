import { useState, useMemo, useEffect } from 'react'
import { useOperations } from '../../utils/operations/OperationsContext'
import { PLACEHOLDER_CURRENT, SPRAY_WINDOW_TOKENS } from '../../components/shared/weather/weatherTokens'
import styles from './OperationsCalendar.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const TODAY = '2026-05-08'

const CATEGORY_META = {
  spray:       { label: 'Spray',       color: '#2980b9' },
  crew:        { label: 'Crew',        color: '#8e44ad' },
  maintenance: { label: 'Maintenance', color: '#d35400' },
  agronomy:    { label: 'Agronomy',    color: '#4a9e4a' },
  irrigation:  { label: 'Irrigation',  color: '#2eb8b8' },
}

const STATUS_META = {
  scheduled:     { label: 'Scheduled',   cls: styles.ocStatusScheduled   },
  'in-progress': { label: 'In Progress', cls: styles.ocStatusInProgress  },
  completed:     { label: 'Completed',   cls: styles.ocStatusCompleted   },
  cancelled:     { label: 'Cancelled',   cls: styles.ocStatusCancelled   },
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startOffset; i++) {
    const d = new Date(year, month, 1 - startOffset + i)
    cells.push({ dateStr: toDateStr(d), day: d.getDate(), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      dateStr: `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
      day: d,
      inMonth: true,
    })
  }
  while (cells.length < 42) {
    const extra = new Date(year, month + 1, cells.length - startOffset - daysInMonth + 1)
    cells.push({ dateStr: toDateStr(extra), day: extra.getDate(), inMonth: false })
  }
  return cells
}

function getWeekDates(refDateStr) {
  const [y, m, d] = refDateStr.split('-').map(Number)
  const ref = new Date(y, m - 1, d)
  const dow = ref.getDay()
  const monday = new Date(ref)
  monday.setDate(ref.getDate() - (dow === 0 ? 6 : dow - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    return toDateStr(day)
  })
}

function fmtDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${MONTH_NAMES[m-1].slice(0,3)} ${d}`
}

function fmtFullDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dt.getDay()]
  return `${dayName}, ${MONTH_NAMES[m-1]} ${d}`
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const p = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
    if (p !== 0) return p
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime)
    return 0
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OperationsCalendar() {
  const { state } = useOperations()
  const calendarEvents = state.calendarEvents

  const [view, setView] = useState('month')
  const [navDate, setNavDate] = useState(TODAY)
  const [activeCategories, setActiveCategories] = useState(
    new Set(['spray', 'crew', 'maintenance', 'agronomy', 'irrigation'])
  )
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [dayModal, setDayModal] = useState(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (selectedEvent) { setSelectedEvent(null); return }
      if (dayModal) setDayModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedEvent, dayModal])

  const navDateObj = useMemo(() => {
    const [y, m, d] = navDate.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [navDate])

  const year = navDateObj.getFullYear()
  const month = navDateObj.getMonth()

  const filteredEvents = useMemo(
    () => calendarEvents.filter(e => activeCategories.has(e.category)),
    [calendarEvents, activeCategories]
  )

  const eventsByDate = useMemo(() => {
    const map = new Map()
    filteredEvents.forEach(evt => {
      const list = map.get(evt.date) || []
      list.push(evt)
      map.set(evt.date, list)
    })
    map.forEach((list, key) => map.set(key, sortEvents(list)))
    return map
  }, [filteredEvents])

  const monthGrid = useMemo(() => buildMonthGrid(year, month), [year, month])
  const weekDates = useMemo(() => getWeekDates(navDate), [navDate])

  // Mini calendar always shows TODAY's month
  const miniGrid = useMemo(() => {
    const [ty, tm] = TODAY.split('-').map(Number)
    return buildMonthGrid(ty, tm - 1)
  }, [])

  const upcomingEvents = useMemo(() =>
    filteredEvents
      .filter(e => e.date >= TODAY && e.status !== 'completed' && e.status !== 'cancelled')
      .sort((a, b) => a.date.localeCompare(b.date) || (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
      .slice(0, 5),
    [filteredEvents]
  )

  // Weekly metrics derived from context state — includes operations-layer events and persists on refresh
  const weeklyMetrics = useMemo(() => {
    const todayWeek = getWeekDates(TODAY)
    const ws = todayWeek[0]
    const we = todayWeek[6]
    return {
      spray:       calendarEvents.filter(e => e.category === 'spray'       && e.date >= ws && e.date <= we).length,
      crew:        calendarEvents.filter(e => e.category === 'crew'        && e.date >= ws && e.date <= we).length,
      maintenance: calendarEvents.filter(e => e.category === 'maintenance' && e.date >= ws && e.date <= we).length,
      openRepairs: calendarEvents.filter(e => e.category === 'irrigation'  && e.status !== 'completed').length,
    }
  }, [calendarEvents])

  const headerLabel = useMemo(() => {
    if (view === 'month') return `${MONTH_NAMES[month]} ${year}`
    if (view === 'week') return `${fmtDate(weekDates[0])} – ${fmtDate(weekDates[6])}, ${year}`
    return `${MONTH_NAMES[month]} ${year}`
  }, [view, month, year, weekDates])

  const sprayWindowMeta = SPRAY_WINDOW_TOKENS[PLACEHOLDER_CURRENT.sprayWindow]

  function navPrev() {
    if (view === 'month') {
      setNavDate(toDateStr(new Date(year, month - 1, 1)))
    } else {
      const [y2, m2, d2] = navDate.split('-').map(Number)
      setNavDate(toDateStr(new Date(y2, m2 - 1, d2 - 7)))
    }
  }

  function navNext() {
    if (view === 'month') {
      setNavDate(toDateStr(new Date(year, month + 1, 1)))
    } else {
      const [y2, m2, d2] = navDate.split('-').map(Number)
      setNavDate(toDateStr(new Date(y2, m2 - 1, d2 + 7)))
    }
  }

  function toggleCategory(cat) {
    setActiveCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  return (
    <div className={styles.ocWrap}>

      {/* ── Header ── */}
      <div className={styles.ocHeader}>
        <div className={styles.ocHeaderTop}>
          <h2 className={styles.ocTitle}>Operations Calendar</h2>
          <div className={styles.ocViewToggle}>
            {['month','week','list'].map(v => (
              <button
                key={v}
                className={`${styles.ocViewBtn} ${view === v ? styles.ocViewBtnActive : ''}`}
                onClick={() => setView(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.ocHeaderNav}>
          <button className={styles.ocNavBtn} onClick={navPrev} aria-label="Previous">&#8249;</button>
          <span className={styles.ocNavLabel}>{headerLabel}</span>
          <button className={styles.ocNavBtn} onClick={navNext} aria-label="Next">&#8250;</button>
          <button className={styles.ocTodayBtn} onClick={() => setNavDate(TODAY)}>Today</button>
        </div>

        <div className={styles.ocCategoryRow}>
          {Object.entries(CATEGORY_META).map(([key, meta]) => (
            <button
              key={key}
              className={`${styles.ocCatChip} ${activeCategories.has(key) ? styles.ocCatChipActive : ''}`}
              style={activeCategories.has(key) ? { '--cat-color': meta.color } : {}}
              onClick={() => toggleCategory(key)}
            >
              <span className={styles.ocCatDot} style={{ background: meta.color }} />
              {meta.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className={styles.ocBody}>

        {/* ── Main view ── */}
        <div className={styles.ocMain}>

          {/* Month view */}
          {view === 'month' && (
            <div className={styles.ocMonthWrap}>
              <div className={styles.ocMonthDayHeaders}>
                {DAY_LABELS.map(l => (
                  <div key={l} className={styles.ocMonthDayHeader}>{l}</div>
                ))}
              </div>
              <div className={styles.ocMonthGrid}>
                {monthGrid.map(cell => {
                  const dayEvents = eventsByDate.get(cell.dateStr) || []
                  const isToday = cell.dateStr === TODAY
                  const visible = dayEvents.slice(0, 3)
                  const overflow = dayEvents.length - 3
                  return (
                    <div
                      key={cell.dateStr}
                      className={[
                        styles.ocMonthCell,
                        !cell.inMonth ? styles.ocMonthCellOut : '',
                        isToday ? styles.ocMonthCellToday : '',
                      ].join(' ')}
                    >
                      <span className={`${styles.ocMonthDayNum} ${isToday ? styles.ocMonthDayNumToday : ''}`}>
                        {cell.day}
                      </span>
                      <div className={styles.ocMonthEvents}>
                        {visible.map(evt => (
                          <button
                            key={evt.id}
                            className={styles.ocEventChip}
                            style={{ '--chip-color': CATEGORY_META[evt.category]?.color || '#888' }}
                            onClick={() => setSelectedEvent(evt)}
                            title={evt.title}
                          >
                            {evt.startTime && (
                              <span className={styles.ocChipTime}>
                                {evt.startTime.replace(' AM','a').replace(' PM','p')}
                              </span>
                            )}
                            <span className={styles.ocChipTitle}>{evt.title}</span>
                          </button>
                        ))}
                        {overflow > 0 && (
                          <button
                            className={styles.ocMoreBtn}
                            onClick={() => setDayModal({ date: cell.dateStr, events: dayEvents })}
                          >
                            +{overflow} more
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Week view */}
          {view === 'week' && (
            <div className={styles.ocWeekWrap}>
              <div className={styles.ocWeekGrid}>
                {weekDates.map((dateStr, idx) => {
                  const dayEvents = eventsByDate.get(dateStr) || []
                  const isToday = dateStr === TODAY
                  const [,, d2] = dateStr.split('-').map(Number)
                  return (
                    <div key={dateStr} className={`${styles.ocWeekCol} ${isToday ? styles.ocWeekColToday : ''}`}>
                      <div className={`${styles.ocWeekDayHeader} ${isToday ? styles.ocWeekDayHeaderToday : ''}`}>
                        <span className={styles.ocWeekDow}>{DAY_LABELS[idx]}</span>
                        <span className={`${styles.ocWeekDayNum} ${isToday ? styles.ocWeekDayNumToday : ''}`}>{d2}</span>
                      </div>
                      <div className={styles.ocWeekEvents}>
                        {dayEvents.length === 0
                          ? <span className={styles.ocWeekEmpty}>—</span>
                          : dayEvents.map(evt => (
                            <button
                              key={evt.id}
                              className={styles.ocWeekEventCard}
                              style={{ '--chip-color': CATEGORY_META[evt.category]?.color || '#888' }}
                              onClick={() => setSelectedEvent(evt)}
                            >
                              <span className={styles.ocWeekCardCat} style={{ color: CATEGORY_META[evt.category]?.color }}>
                                {CATEGORY_META[evt.category]?.label}
                              </span>
                              <span className={styles.ocWeekCardTitle}>{evt.title}</span>
                              {evt.startTime && <span className={styles.ocWeekCardTime}>{evt.startTime}</span>}
                            </button>
                          ))
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* List view */}
          {view === 'list' && (() => {
            const dates = [...new Set(filteredEvents.map(e => e.date))].sort()
            if (dates.length === 0) return (
              <p className={styles.ocListEmpty}>No events match the active filters.</p>
            )
            return (
              <div className={styles.ocListWrap}>
                {dates.map(dateStr => {
                  const dayEvents = eventsByDate.get(dateStr) || []
                  return (
                    <div key={dateStr} className={styles.ocListGroup}>
                      <div className={`${styles.ocListDateHeader} ${dateStr === TODAY ? styles.ocListDateHeaderToday : ''}`}>
                        {fmtFullDate(dateStr)}
                        {dateStr === TODAY && <span className={styles.ocTodayPill}>Today</span>}
                      </div>
                      {dayEvents.map(evt => {
                        const statusMeta = STATUS_META[evt.status]
                        return (
                          <button
                            key={evt.id}
                            className={styles.ocListCard}
                            style={{ '--chip-color': CATEGORY_META[evt.category]?.color || '#888' }}
                            onClick={() => setSelectedEvent(evt)}
                          >
                            <div className={styles.ocListCardMain}>
                              <div className={styles.ocListCardLeft}>
                                <div className={styles.ocListCardTopRow}>
                                  <span className={styles.ocListCardTitle}>{evt.title}</span>
                                  {statusMeta && (
                                    <span className={`${styles.ocStatusBadge} ${statusMeta.cls}`}>
                                      {statusMeta.label}
                                    </span>
                                  )}
                                </div>
                                <div className={styles.ocListCardMeta}>
                                  {evt.startTime && (
                                    <span>{evt.startTime}{evt.endTime ? ` – ${evt.endTime}` : ''}</span>
                                  )}
                                  {evt.location && <span>· {evt.location}</span>}
                                </div>
                                {evt.assignedStaff.length > 0 && (
                                  <div className={styles.ocListCardStaff}>
                                    {evt.assignedStaff.join(', ')}
                                  </div>
                                )}
                              </div>
                              <div className={styles.ocListCardRight}>
                                <span className={styles.ocListCatDot} style={{ background: CATEGORY_META[evt.category]?.color }} />
                                <span className={styles.ocListCardCat}>{CATEGORY_META[evt.category]?.label}</span>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })()}

        </div>

        {/* ── Right panel ── */}
        <div className={styles.ocPanel}>

          {/* Mini calendar */}
          <div className={styles.ocPanelSection}>
            <p className={styles.ocPanelTitle}>
              {MONTH_NAMES[Number(TODAY.split('-')[1]) - 1]} {TODAY.split('-')[0]}
            </p>
            <div className={styles.ocMiniCal}>
              <div className={styles.ocMiniCalDayRow}>
                {['M','T','W','T','F','S','S'].map((l, i) => (
                  <span key={i} className={styles.ocMiniCalDayLabel}>{l}</span>
                ))}
              </div>
              <div className={styles.ocMiniCalGrid}>
                {miniGrid.map((cell, i) => (
                  <button
                    key={i}
                    className={[
                      styles.ocMiniCalCell,
                      !cell.inMonth ? styles.ocMiniCalCellOut : '',
                      cell.dateStr === TODAY ? styles.ocMiniCalCellToday : '',
                      cell.dateStr === navDate && cell.dateStr !== TODAY ? styles.ocMiniCalCellNav : '',
                    ].join(' ')}
                    onClick={() => setNavDate(cell.dateStr)}
                  >
                    {cell.day}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Upcoming */}
          <div className={styles.ocPanelSection}>
            <p className={styles.ocPanelTitle}>Upcoming</p>
            {upcomingEvents.length === 0
              ? <p className={styles.ocPanelEmpty}>No upcoming events.</p>
              : upcomingEvents.map(evt => (
                <button key={evt.id} className={styles.ocUpcomingCard} onClick={() => setSelectedEvent(evt)}>
                  <span className={styles.ocUpcomingDot} style={{ background: CATEGORY_META[evt.category]?.color }} />
                  <div className={styles.ocUpcomingInfo}>
                    <span className={styles.ocUpcomingTitle}>{evt.title}</span>
                    <span className={styles.ocUpcomingDate}>
                      {fmtDate(evt.date)}{evt.startTime ? ` · ${evt.startTime}` : ''}
                    </span>
                  </div>
                </button>
              ))
            }
          </div>

          {/* Weekly metrics */}
          <div className={styles.ocPanelSection}>
            <p className={styles.ocPanelTitle}>This Week</p>
            <div className={styles.ocMetricsGrid}>
              <div className={styles.ocMetricItem}>
                <span className={styles.ocMetricVal} style={{ color: '#2980b9' }}>{weeklyMetrics.spray}</span>
                <span className={styles.ocMetricLabel}>Spray Records</span>
              </div>
              <div className={styles.ocMetricItem}>
                <span className={styles.ocMetricVal} style={{ color: '#8e44ad' }}>{weeklyMetrics.crew}</span>
                <span className={styles.ocMetricLabel}>Crew Shifts</span>
              </div>
              <div className={styles.ocMetricItem}>
                <span className={styles.ocMetricVal} style={{ color: '#d35400' }}>{weeklyMetrics.maintenance}</span>
                <span className={styles.ocMetricLabel}>Maintenance</span>
              </div>
              <div className={styles.ocMetricItem}>
                <span className={styles.ocMetricVal} style={{ color: '#2eb8b8' }}>{weeklyMetrics.openRepairs}</span>
                <span className={styles.ocMetricLabel}>Open Repairs</span>
              </div>
            </div>
          </div>

          {/* Conditions */}
          <div className={styles.ocPanelSection}>
            <p className={styles.ocPanelTitle}>Conditions</p>
            <div className={styles.ocWeatherStrip}>
              <div className={styles.ocWeatherRow}>
                <span className={styles.ocWeatherTemp}>{PLACEHOLDER_CURRENT.currentTemp}°F</span>
                <span className={styles.ocWeatherSub}>Feels {PLACEHOLDER_CURRENT.feelsLike}°</span>
              </div>
              <div className={styles.ocWeatherStats}>
                <span>&#x1F4A8; {PLACEHOLDER_CURRENT.wind} mph {PLACEHOLDER_CURRENT.windDir}</span>
                <span>&#x1F4A7; {PLACEHOLDER_CURRENT.humidity}% RH</span>
              </div>
              <div
                className={styles.ocSprayWindow}
                style={{
                  color: sprayWindowMeta.color,
                  background: sprayWindowMeta.bg,
                  border: `1px solid ${sprayWindowMeta.border}`,
                }}
              >
                {sprayWindowMeta.icon} Spray: {sprayWindowMeta.label}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Event detail modal (IIFE) ── */}
      {selectedEvent && (() => {
        const evt = selectedEvent
        const catMeta = CATEGORY_META[evt.category]
        const statusMeta = STATUS_META[evt.status]
        return (
          <div
            className={styles.ocModalOverlay}
            onClick={e => { if (e.target === e.currentTarget) setSelectedEvent(null) }}
          >
            <div className={styles.ocModalPanel}>
              <div className={styles.ocModalAccent} style={{ background: catMeta?.color || '#888' }} />
              <div className={styles.ocModalBody}>

                <div className={styles.ocModalHeader}>
                  <div>
                    <h2 className={styles.ocModalTitle}>{evt.title}</h2>
                    <p className={styles.ocModalSub}>
                      {fmtFullDate(evt.date)}
                      {evt.startTime ? ` · ${evt.startTime}` : ''}
                      {evt.endTime   ? ` – ${evt.endTime}`   : ''}
                    </p>
                  </div>
                  <button className={styles.ocModalCloseX} onClick={() => setSelectedEvent(null)} aria-label="Close">
                    ✕
                  </button>
                </div>

                <div className={styles.ocModalBadgeRow}>
                  <span
                    className={styles.ocModalCatBadge}
                    style={{
                      background: `${catMeta?.color}22`,
                      color: catMeta?.color,
                      border: `1px solid ${catMeta?.color}55`,
                    }}
                  >
                    {catMeta?.label || evt.category}
                  </span>
                  {statusMeta && (
                    <span className={`${styles.ocStatusBadge} ${statusMeta.cls}`}>
                      {statusMeta.label}
                    </span>
                  )}
                  <span className={styles.ocPriorityBadge} data-priority={evt.priority}>
                    {evt.priority.charAt(0).toUpperCase() + evt.priority.slice(1)} Priority
                  </span>
                </div>

                {evt.location && (
                  <div className={styles.ocModalField}>
                    <span className={styles.ocModalFieldLabel}>Location</span>
                    <span className={styles.ocModalFieldValue}>{evt.location}</span>
                  </div>
                )}

                {evt.assignedStaff.length > 0 && (
                  <div className={styles.ocModalField}>
                    <span className={styles.ocModalFieldLabel}>Assigned Staff</span>
                    <span className={styles.ocModalFieldValue}>{evt.assignedStaff.join(', ')}</span>
                  </div>
                )}

                {evt.equipment.length > 0 && (
                  <div className={styles.ocModalField}>
                    <span className={styles.ocModalFieldLabel}>Equipment</span>
                    <span className={styles.ocModalFieldValue}>{evt.equipment.join(', ')}</span>
                  </div>
                )}

                {evt.tags.length > 0 && (
                  <div className={styles.ocModalField}>
                    <span className={styles.ocModalFieldLabel}>Products / Tags</span>
                    <div className={styles.ocModalTags}>
                      {evt.tags.map(t => (
                        <span key={t} className={styles.ocModalTag}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {evt.notes && (
                  <div className={styles.ocModalField}>
                    <span className={styles.ocModalFieldLabel}>Notes</span>
                    <p className={styles.ocModalNotes}>{evt.notes}</p>
                  </div>
                )}

                <button className={styles.ocModalClose} onClick={() => setSelectedEvent(null)}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Day overflow modal (IIFE) ── */}
      {dayModal && (() => (
        <div
          className={styles.ocModalOverlay}
          onClick={e => { if (e.target === e.currentTarget) setDayModal(null) }}
        >
          <div className={styles.ocModalPanel}>
            <div className={styles.ocModalAccent} style={{ background: '#4a9e4a' }} />
            <div className={styles.ocModalBody}>
              <div className={styles.ocModalHeader}>
                <h2 className={styles.ocModalTitle}>{fmtFullDate(dayModal.date)}</h2>
                <button className={styles.ocModalCloseX} onClick={() => setDayModal(null)} aria-label="Close">✕</button>
              </div>
              <div className={styles.ocDayModalList}>
                {dayModal.events.map(evt => {
                  const catMeta = CATEGORY_META[evt.category]
                  return (
                    <button
                      key={evt.id}
                      className={styles.ocDayModalCard}
                      style={{ '--chip-color': catMeta?.color || '#888' }}
                      onClick={() => { setDayModal(null); setSelectedEvent(evt) }}
                    >
                      <span className={styles.ocDayModalDot} style={{ background: catMeta?.color }} />
                      <div className={styles.ocDayModalInfo}>
                        <span className={styles.ocDayModalTitle}>{evt.title}</span>
                        <span className={styles.ocDayModalMeta}>
                          {evt.startTime || 'All day'}{evt.location ? ` · ${evt.location}` : ''}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
              <button className={styles.ocModalClose} onClick={() => setDayModal(null)}>Close</button>
            </div>
          </div>
        </div>
      ))()}

    </div>
  )
}
