// Priority defines visual weight, color, and left-border accent.
// Critical is distinguished from High by a solid (not faded) border and bolder label.
export const ALERT_PRIORITY = {
  critical: {
    label:  'Critical',
    color:  '#e05050',
    bg:     'rgba(220, 60, 60, 0.15)',
    border: 'rgba(220, 60, 60, 0.35)',
    order:  0,
  },
  high: {
    label:  'High',
    color:  '#e05050',
    bg:     'rgba(220, 60, 60, 0.1)',
    border: 'rgba(220, 60, 60, 0.25)',
    order:  1,
  },
  medium: {
    label:  'Medium',
    color:  '#d4883a',
    bg:     'rgba(210, 130, 40, 0.12)',
    border: 'rgba(210, 130, 40, 0.25)',
    order:  2,
  },
  low: {
    label:  'Low',
    color:  '#c8b830',
    bg:     'rgba(200, 184, 48, 0.12)',
    border: 'rgba(200, 184, 48, 0.25)',
    order:  3,
  },
  info: {
    label:  'Info',
    color:  '#3a8ad4',
    bg:     'rgba(58, 138, 212, 0.1)',
    border: 'rgba(58, 138, 212, 0.25)',
    order:  4,
  },
}

// Status controls opacity dimming and the pulsing new-alert dot.
export const ALERT_STATUS = {
  new:          { label: 'New',          pulse: true,  opacity: 1.0 },
  acknowledged: { label: 'Acknowledged', pulse: false, opacity: 0.75 },
  snoozed:      { label: 'Snoozed',      pulse: false, opacity: 0.55 },
  resolved:     { label: 'Resolved',     pulse: false, opacity: 0.35 },
}

// Display label per originating module — used in alert meta rows.
export const MODULE_LABELS = {
  disease:    'Disease',
  inventory:  'Inventory',
  equipment:  'Equipment',
  spray:      'Spray',
  weather:    'Weather',
  nutrition:  'Plant Nutrition',
  budget:     'Budget',
  crew:       'Crew',
}

// Ordering for groupBy priority
export const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low', 'info']

// Ordering for groupBy status
export const STATUS_ORDER = ['new', 'acknowledged', 'snoozed', 'resolved']

// Resolve priority config safely.
export function resolvePriority(priority) {
  return ALERT_PRIORITY[priority] ?? ALERT_PRIORITY.info
}

// Resolve status config safely.
export function resolveStatus(status) {
  return ALERT_STATUS[status] ?? ALERT_STATUS.new
}
