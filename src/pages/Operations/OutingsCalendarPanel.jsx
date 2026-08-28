import { useMemo, useState } from 'react'
import {
  useCalendarData,
  createCalendarEvent,
  patchCalendarEvent,
  deleteCalendarEvent,
} from '../../utils/calendar/calendarStore'
import { useToast } from '../../utils/feedback/toastContext'
import styles from './OutingsCalendarPanel.module.css'

const TODAY = () => new Date().toISOString().slice(0, 10)
const MONTH_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const EVENT_TYPE_STORAGE_KEY = 'turfintel:events-calendar:event-types/v1'

const PRIORITIES = [
  { value: 'high',    label: 'High' },
  { value: 'medium',  label: 'Medium' },
  { value: 'routine', label: 'Routine' },
  { value: 'low',     label: 'Low' },
]

const DEFAULT_EVENT_TYPES = [
  { value: 'outing',            label: 'Outing' },
  { value: 'tournament',        label: 'Tournament' },
  { value: 'cultural-practice', label: 'Cultural Practice' },
  { value: 'course-closure',    label: 'Course Closure' },
  { value: 'member-event',      label: 'Member Event' },
  { value: 'staff-event',       label: 'Staff Event' },
  { value: 'vendor',            label: 'Vendor / Delivery' },
  { value: 'weather-watch',     label: 'Weather Watch' },
  { value: 'other',             label: 'Other' },
]

const LEGACY_OUTING_KEYWORDS = [
  'golf outing',
  'outing',
  'tournament',
  'shotgun',
  'member guest',
  'member-guest',
  'scramble',
]

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'custom-event'
}

function titleCase(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function uniqueEventTypes(types) {
  const seen = new Set()
  const out = []
  for (const type of types) {
    const value = slugify(type.value ?? type.label)
    const label = titleCase(type.label ?? value.replace(/-/g, ' '))
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push({ value, label })
  }
  return out
}

function loadCustomEventTypes() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(EVENT_TYPE_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return uniqueEventTypes(Array.isArray(parsed) ? parsed : [])
  } catch {
    return []
  }
}

function saveCustomEventTypes(types) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(EVENT_TYPE_STORAGE_KEY, JSON.stringify(uniqueEventTypes(types)))
  } catch {
    // Local customization is best-effort.
  }
}

function emptyDraft() {
  return {
    id:        null,
    date:      TODAY(),
    title:     '',
    eventType: 'outing',
    startTime: '',
    endTime:   '',
    location:  '',
    priority:  'medium',
    notes:     '',
  }
}

function getSourceModule(event) {
  return event?.sourceModule ?? event?.metadata?.sourceModule ?? event?.sourceType
}

function isEventsCalendarEvent(event) {
  if (!event) return false
  const eventType = event.eventType ?? event.category
  const sourceModule = getSourceModule(event)
  const tags = Array.isArray(event.tags) ? event.tags : []
  if (sourceModule === 'events-calendar' || sourceModule === 'golf-outings-calendar') return true
  if (tags.includes('event-calendar') || tags.includes('golf-outing')) return true
  if (eventType === 'outing' || eventType === 'tournament') return true

  const haystack = [
    eventType,
    event.title,
    event.description,
    event.notes,
    event.location,
    ...tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return LEGACY_OUTING_KEYWORDS.some(keyword => haystack.includes(keyword))
}

function formatDate(iso) {
  if (!iso) return ''
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(time) {
  if (!time) return 'All day'
  const [hourRaw, minute = '00'] = time.split(':')
  let hour = Number(hourRaw)
  if (!Number.isFinite(hour)) return time
  const suffix = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12 || 12
  return `${hour}:${minute} ${suffix}`
}

function formatTimeRange(event) {
  if (!event?.startTime && !event?.endTime) return 'All day'
  if (event.startTime && event.endTime) return `${formatTime(event.startTime)} - ${formatTime(event.endTime)}`
  return formatTime(event.startTime ?? event.endTime)
}

function monthKeyFromIso(iso) {
  return (iso || TODAY()).slice(0, 7)
}

function shiftMonth(monthKey, offset) {
  const date = new Date(`${monthKey}-01T00:00:00`)
  date.setMonth(date.getMonth() + offset)
  return date.toISOString().slice(0, 7)
}

function formatMonth(monthKey) {
  const date = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return monthKey
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function buildMonthCells(monthKey) {
  const first = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(first.getTime())) return []

  const cells = []
  const leading = first.getDay()
  for (let i = 0; i < leading; i++) cells.push({ key: `lead-${i}`, iso: null })

  const cursor = new Date(first)
  while (cursor.getMonth() === first.getMonth()) {
    const iso = cursor.toISOString().slice(0, 10)
    cells.push({ key: iso, iso, dayNumber: cursor.getDate() })
    cursor.setDate(cursor.getDate() + 1)
  }

  while (cells.length % 7 !== 0) cells.push({ key: `trail-${cells.length}`, iso: null })
  return cells
}

function eventTypeLabel(eventType, eventTypes) {
  return eventTypes.find(type => type.value === eventType)?.label
    ?? titleCase(String(eventType ?? 'Event').replace(/-/g, ' '))
}

function eventSearchText(event, eventTypes) {
  return [
    event.title,
    event.description,
    event.notes,
    event.location,
    event.priority,
    eventTypeLabel(event.eventType ?? event.category, eventTypes),
    ...(Array.isArray(event.tags) ? event.tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export default function OutingsCalendarPanel() {
  const { events, loading, error } = useCalendarData()
  const toast = useToast()
  const [draft, setDraft] = useState(emptyDraft())
  const [busy, setBusy] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => monthKeyFromIso(TODAY()))
  const [detailEvent, setDetailEvent] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [customTypes, setCustomTypes] = useState(loadCustomEventTypes)
  const [newTypeName, setNewTypeName] = useState('')

  const defaultTypeValues = useMemo(() => new Set(DEFAULT_EVENT_TYPES.map(type => type.value)), [])

  const allManagedEvents = useMemo(() => (
    events
      .filter(isEventsCalendarEvent)
      .filter(event => event.status !== 'cancelled' && event.status !== 'deleted')
      .sort((a, b) => {
        const dateSort = (a.startDate ?? a.date ?? '').localeCompare(b.startDate ?? b.date ?? '')
        if (dateSort !== 0) return dateSort
        return (a.startTime ?? '').localeCompare(b.startTime ?? '')
      })
  ), [events])

  const eventTypes = useMemo(() => {
    const discovered = allManagedEvents
      .map(event => event.eventType ?? event.category)
      .filter(Boolean)
      .map(value => ({ value, label: eventTypeLabel(value, DEFAULT_EVENT_TYPES) }))
    return uniqueEventTypes([...DEFAULT_EVENT_TYPES, ...customTypes, ...discovered])
  }, [allManagedEvents, customTypes])

  const filteredEvents = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return allManagedEvents.filter(event => {
      const eventType = event.eventType ?? event.category ?? 'other'
      if (typeFilter !== 'all' && eventType !== typeFilter) return false
      if (!q) return true
      return eventSearchText(event, eventTypes).includes(q)
    })
  }, [allManagedEvents, eventTypes, searchText, typeFilter])

  const upcomingCount = useMemo(() => (
    allManagedEvents.filter(event => (event.startDate ?? event.date ?? '') >= TODAY()).length
  ), [allManagedEvents])

  const eventsByDate = useMemo(() => {
    const map = new Map()
    for (const event of filteredEvents) {
      const date = event.startDate ?? event.date
      if (!date) continue
      if (!map.has(date)) map.set(date, [])
      map.get(date).push(event)
    }
    return map
  }, [filteredEvents])

  const monthCells = useMemo(() => buildMonthCells(calendarMonth), [calendarMonth])

  function setField(key, value) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  function startEdit(event) {
    const eventType = event.eventType ?? event.category ?? 'other'
    setDetailEvent(null)
    setCalendarMonth(monthKeyFromIso(event.startDate ?? event.date ?? TODAY()))
    setDraft({
      id:        event.id,
      date:      event.startDate ?? event.date ?? TODAY(),
      title:     event.title ?? '',
      eventType,
      startTime: event.startTime ?? '',
      endTime:   event.endTime ?? '',
      location:  event.location ?? '',
      priority:  event.priority ?? 'medium',
      notes:     event.description ?? event.notes ?? '',
    })
    if (!eventTypes.some(type => type.value === eventType)) {
      const nextTypes = uniqueEventTypes([...customTypes, { value: eventType, label: eventTypeLabel(eventType, eventTypes) }])
      setCustomTypes(nextTypes)
      saveCustomEventTypes(nextTypes)
    }
    setEditorOpen(true)
  }

  function startNew() {
    setDetailEvent(null)
    setDraft(emptyDraft())
    setEditorOpen(true)
  }

  function startNewForDate(iso) {
    setDetailEvent(null)
    setCalendarMonth(monthKeyFromIso(iso))
    setDraft({ ...emptyDraft(), date: iso })
    setEditorOpen(true)
  }

  function closeEditor() {
    if (busy) return
    setEditorOpen(false)
    setDraft(emptyDraft())
  }

  function openDetails(event) {
    setDetailEvent(event)
  }

  function handleAddType(event) {
    event?.preventDefault?.()
    const label = titleCase(newTypeName)
    if (!label) return
    const value = slugify(label)
    if (eventTypes.some(type => type.value === value)) {
      toast.info(`${label} already exists`)
      setNewTypeName('')
      return
    }
    const nextTypes = uniqueEventTypes([...customTypes, { value, label }])
    setCustomTypes(nextTypes)
    saveCustomEventTypes(nextTypes)
    setDraft(prev => ({ ...prev, eventType: value }))
    setTypeFilter(value)
    setNewTypeName('')
    toast.success('Event type added')
  }

  function handleDeleteType(type) {
    if (!type?.value || defaultTypeValues.has(type.value)) return
    const inUse = allManagedEvents.some(event => (event.eventType ?? event.category) === type.value)
    if (inUse && !confirm(`Remove "${type.label}" from your type menu? Existing events keep that type.`)) return
    const nextTypes = customTypes.filter(item => item.value !== type.value)
    setCustomTypes(nextTypes)
    saveCustomEventTypes(nextTypes)
    if (draft.eventType === type.value) setDraft(prev => ({ ...prev, eventType: 'other' }))
    if (typeFilter === type.value) setTypeFilter('all')
    toast.success('Event type removed')
  }

  async function handleSave(event) {
    event?.preventDefault?.()
    const title = draft.title.trim()
    if (!title) {
      toast.info('Event name is required')
      return
    }

    const type = draft.eventType || 'other'
    const tags = ['event-calendar']
    if (type === 'outing' || type === 'tournament') tags.push('golf-outing')
    if (type === 'cultural-practice') tags.push('cultural-practice')

    const payload = {
      title,
      eventType:   type,
      category:    type,
      sourceType:  'events-calendar',
      startDate:   draft.date,
      date:        draft.date,
      startTime:   draft.startTime || null,
      endTime:     draft.endTime || null,
      location:    draft.location.trim() || null,
      description: draft.notes.trim() || null,
      notes:       draft.notes.trim() || null,
      priority:    draft.priority,
      status:      'scheduled',
      tags,
    }

    setBusy(true)
    try {
      if (draft.id) {
        await patchCalendarEvent(draft.id, payload)
        toast.success('Event updated')
      } else {
        await createCalendarEvent({
          ...payload,
          sourceModule: 'events-calendar',
          sourceId:     `event-${Date.now()}`,
        })
        toast.success('Event added to Display Board')
      }
      setDraft(emptyDraft())
      setEditorOpen(false)
    } catch (err) {
      toast.error(`Event save failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(event) {
    if (!event?.id) return
    if (!confirm(`Delete event "${event.title}"?`)) return
    setBusy(true)
    try {
      await deleteCalendarEvent(event.id)
      if (draft.id === event.id) {
        setDraft(emptyDraft())
        setEditorOpen(false)
      }
      if (detailEvent?.id === event.id) setDetailEvent(null)
      toast.success('Event deleted')
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Events Calendar</h2>
          <p className={styles.subtitle}>
            Outings, cultural practices, closures, and custom events shown at the top of the public Display Board.
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.countChip}>{upcomingCount} upcoming</span>
          <button type="button" className={styles.btnPrimary} onClick={startNew}>
            + New event
          </button>
        </div>
      </header>

      <section className={styles.eventControls} aria-label="Search and customize events">
        <div className={styles.searchRow}>
          <label className={styles.searchField}>
            <span>Search events</span>
            <input
              type="search"
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              placeholder="Search title, type, location, notes..."
            />
          </label>
          <label className={styles.filterField}>
            <span>Type</span>
            <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
              <option value="all">All event types</option>
              {eventTypes.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.typeManager}>
          <div className={styles.typeChips}>
            {eventTypes.map(type => (
              <button
                key={type.value}
                type="button"
                className={styles.typeChip}
                data-active={typeFilter === type.value ? 'true' : undefined}
                onClick={() => setTypeFilter(type.value)}
              >
                <span>{type.label}</span>
                {!defaultTypeValues.has(type.value) && (
                  <strong
                    role="button"
                    tabIndex={0}
                    onClick={event => {
                      event.stopPropagation()
                      handleDeleteType(type)
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        handleDeleteType(type)
                      }
                    }}
                    aria-label={`Remove event type ${type.label}`}
                  >
                    x
                  </strong>
                )}
              </button>
            ))}
          </div>
          <form className={styles.addTypeForm} onSubmit={handleAddType}>
            <input
              type="text"
              value={newTypeName}
              onChange={event => setNewTypeName(event.target.value)}
              placeholder="Add custom type"
              aria-label="Add custom event type"
            />
            <button type="submit" className={styles.btnSecondary} disabled={!newTypeName.trim()}>
              Add type
            </button>
          </form>
        </div>
      </section>

      <section className={styles.monthCalendar} aria-label="Events month calendar">
        <header className={styles.calendarHeader}>
          <div>
            <h3 className={styles.calendarTitle}>{formatMonth(calendarMonth)}</h3>
            <p className={styles.calendarSub}>Click any empty date to add an event.</p>
          </div>
          <div className={styles.calendarActions}>
            <button type="button" className={styles.btnSecondary} onClick={() => setCalendarMonth(prev => shiftMonth(prev, -1))}>
              Previous
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => setCalendarMonth(monthKeyFromIso(TODAY()))}>
              Today
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => setCalendarMonth(prev => shiftMonth(prev, 1))}>
              Next
            </button>
          </div>
        </header>

        <div className={styles.calendarGrid} role="grid" aria-label={`${formatMonth(calendarMonth)} events`}>
          {MONTH_DAYS.map(day => (
            <div key={day} className={styles.calendarWeekday} role="columnheader">{day}</div>
          ))}
          {monthCells.map(cell => {
            const dayEvents = cell.iso ? (eventsByDate.get(cell.iso) ?? []) : []
            return (
              <div
                key={cell.key}
                className={styles.calendarCell}
                data-empty={!cell.iso ? 'true' : undefined}
                data-addable={cell.iso && dayEvents.length === 0 ? 'true' : undefined}
                data-today={cell.iso === TODAY() ? 'true' : undefined}
                role="gridcell"
                onClick={cell.iso && dayEvents.length === 0 ? () => startNewForDate(cell.iso) : undefined}
                title={cell.iso && dayEvents.length === 0 ? 'Add an event on this date' : undefined}
              >
                {cell.iso && (
                  <>
                    <div className={styles.calendarCellHeader}>
                      <button
                        type="button"
                        className={styles.calendarDayBtn}
                        onClick={() => startNewForDate(cell.iso)}
                        title="Start a new event on this date"
                      >
                        {cell.dayNumber}
                      </button>
                      {dayEvents.length > 0 && (
                        <span className={styles.calendarCount}>{dayEvents.length}</span>
                      )}
                    </div>
                    <div className={styles.calendarOutings}>
                      {dayEvents.map(event => {
                        const type = event.eventType ?? event.category ?? 'other'
                        return (
                          <article key={event.id} className={styles.calendarOuting} data-priority={event.priority}>
                            <button
                              type="button"
                              className={styles.calendarOutingTitle}
                              onClick={() => openDetails(event)}
                              title="View event details"
                            >
                              <span>{formatTime(event.startTime)}</span>
                              <strong>{event.title}</strong>
                              <em>{eventTypeLabel(type, eventTypes)}</em>
                            </button>
                            <div className={styles.calendarOutingActions}>
                              <button type="button" onClick={() => startEdit(event)}>Edit</button>
                              <button type="button" data-danger="true" onClick={() => handleDelete(event)} disabled={busy}>Delete</button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <div className={styles.listHeader}>
        <span>{filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}</span>
        {error && <span className={styles.errorText}>{error}</span>}
      </div>

      {loading && allManagedEvents.length === 0 ? (
        <p className={styles.empty}>Loading events...</p>
      ) : filteredEvents.length === 0 ? (
        <p className={styles.empty}>No events match this view. Add one above to show it on the Display Board.</p>
      ) : (
        <div className={styles.list}>
          {filteredEvents.map(event => {
            const type = event.eventType ?? event.category ?? 'other'
            return (
              <article key={event.id} className={styles.card} data-priority={event.priority}>
                <div className={styles.cardMain}>
                  <div>
                    <h3>{event.title}</h3>
                    <p className={styles.meta}>
                      <span>{eventTypeLabel(type, eventTypes)}</span>
                      <span>{formatDate(event.startDate ?? event.date)}</span>
                      <span>{formatTime(event.startTime)}</span>
                      {event.endTime && <span>Ends {formatTime(event.endTime)}</span>}
                      {event.location && <span>{event.location}</span>}
                    </p>
                  </div>
                  <span className={styles.priority}>{event.priority ?? 'medium'}</span>
                </div>
                {(event.description || event.notes) && (
                  <p className={styles.cardNote}>{event.description ?? event.notes}</p>
                )}
                <div className={styles.cardActions}>
                  <button type="button" className={styles.btnSecondary} onClick={() => openDetails(event)}>
                    Details
                  </button>
                  <button type="button" className={styles.btnSecondary} onClick={() => startEdit(event)}>
                    Edit
                  </button>
                  <button type="button" className={styles.btnDanger} onClick={() => handleDelete(event)} disabled={busy}>
                    Delete
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {detailEvent && (
        <div className={styles.detailOverlay} role="presentation">
          <section
            className={styles.detailModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-detail-title"
            onClick={event => event.stopPropagation()}
          >
            <header className={styles.detailHeader}>
              <div>
                <span className={styles.detailKicker}>{eventTypeLabel(detailEvent.eventType ?? detailEvent.category, eventTypes)}</span>
                <h3 id="event-detail-title">{detailEvent.title}</h3>
              </div>
              <button
                type="button"
                className={styles.detailClose}
                onClick={() => setDetailEvent(null)}
                aria-label="Close event details"
              >
                x
              </button>
            </header>

            <dl className={styles.detailGrid}>
              <div>
                <dt>Date</dt>
                <dd>{formatDate(detailEvent.startDate ?? detailEvent.date)}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{formatTimeRange(detailEvent)}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{detailEvent.location || 'Not set'}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{detailEvent.priority || 'medium'}</dd>
              </div>
            </dl>

            <section className={styles.detailNotes}>
              <h4>Display board note</h4>
              <p>{detailEvent.description || detailEvent.notes || 'No note entered.'}</p>
            </section>

            <footer className={styles.detailActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setDetailEvent(null)}>
                Close
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => startEdit(detailEvent)}>
                Edit event
              </button>
              <button type="button" className={styles.btnDanger} onClick={() => handleDelete(detailEvent)} disabled={busy}>
                Delete
              </button>
            </footer>
          </section>
        </div>
      )}

      {editorOpen && (
        <div className={styles.detailOverlay} role="presentation">
          <form
            className={`${styles.detailModal} ${styles.editorModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-editor-title"
            onClick={event => event.stopPropagation()}
            onSubmit={handleSave}
          >
            <header className={styles.detailHeader}>
              <div>
                <span className={styles.detailKicker}>{draft.id ? 'Edit event' : 'New event'}</span>
                <h3 id="event-editor-title">{draft.id ? 'Edit Event' : `Add Event - ${formatDate(draft.date)}`}</h3>
              </div>
              <button
                type="button"
                className={styles.detailClose}
                onClick={closeEditor}
                aria-label="Close event editor"
                disabled={busy}
              >
                x
              </button>
            </header>

            <div className={styles.editor}>
              <div className={styles.row}>
                <label className={styles.fieldWide}>
                  <span>Event name</span>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={event => setField('title', event.target.value)}
                    placeholder="Member-Guest, Aerification, Cart Path Closure"
                    autoFocus
                  />
                </label>
                <label className={styles.field}>
                  <span>Date</span>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={event => setField('date', event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Priority</span>
                  <select
                    value={draft.priority}
                    onChange={event => setField('priority', event.target.value)}
                  >
                    {PRIORITIES.map(priority => (
                      <option key={priority.value} value={priority.value}>{priority.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Event type</span>
                  <select
                    value={draft.eventType}
                    onChange={event => setField('eventType', event.target.value)}
                  >
                    {eventTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Start</span>
                  <input
                    type="time"
                    value={draft.startTime}
                    onChange={event => setField('startTime', event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>End</span>
                  <input
                    type="time"
                    value={draft.endTime}
                    onChange={event => setField('endTime', event.target.value)}
                  />
                </label>
              </div>

              <div className={styles.row}>
                <label className={styles.fieldWide}>
                  <span>Location</span>
                  <input
                    type="text"
                    value={draft.location}
                    onChange={event => setField('location', event.target.value)}
                    placeholder="Clubhouse, Greens, Front 9"
                  />
                </label>
              </div>

              <label className={styles.notesField}>
                <span>Display board note</span>
                <textarea
                  value={draft.notes}
                  onChange={event => setField('notes', event.target.value)}
                  placeholder="What staff should know for this event."
                  rows={3}
                />
              </label>

              <div className={styles.actions}>
                <button type="button" className={styles.btnSecondary} onClick={closeEditor} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={busy}>
                  {busy ? 'Saving...' : draft.id ? 'Save event' : 'Add event'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
