// Event type → display color. Consumed by CalendarEvent, EventBadge, and any
// module that needs to render a colored legend matching the shared calendar.
export const EVENT_COLORS = {
  spray:     '#4a9e4a',
  cultural:  '#7c5cbf',
  crew:      '#3a8ad4',
  equipment: '#d4883a',
  disease:   '#e05050',
  weather:   '#5ba8a0',
  budget:    '#c8b830',
  nutrition: '#5b8fd4',
  default:   '#888',
}

// Status metadata. opacity drives visual dimming; label is the display string.
export const EVENT_STATUS = {
  completed:    { opacity: 1.0, label: 'Completed'   },
  planned:      { opacity: 0.6, label: 'Planned'     },
  'in-progress':{ opacity: 1.0, label: 'In Progress' },
  cancelled:    { opacity: 0.3, label: 'Cancelled'   },
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const DAY_HEADERS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Return the hex color for any event object, respecting the optional color override.
export function resolveEventColor(event) {
  return event.color || EVENT_COLORS[event.type] || EVENT_COLORS.default
}

// Build a YYYY-MM-DD string from year, month (0-indexed), and day.
export function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Today as a YYYY-MM-DD string, stable for the lifetime of the module.
export function todayStr() {
  const d = new Date()
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate())
}
