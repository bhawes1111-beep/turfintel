// Pre-built message strings for consistent operational feedback across workflows.
// Import alongside useToast() when you want standardized copy.

export const TOAST_MSG = {
  REPAIR_COMPLETE:   'Repair marked complete ✓',
  REPAIR_REOPENED:   'Repair reopened',
  REPAIR_SCHEDULED:  'Repair added to Operations Calendar',
  SERVICE_COMPLETE:  'Service marked complete ✓',
  SERVICE_REOPENED:  'Service record reopened',
  SERVICE_SCHEDULED: 'Service event added to Operations Calendar',
  SHIFT_SAVED:       'Shift saved',
  SHIFT_DELETED:     'Shift deleted',
  REPORT_GENERATED:  'Report generated',
  FEATURE_COMING:    'Coming in a future update',
}

export function calendarAddedMsg(count) {
  return `${count} event${count !== 1 ? 's' : ''} added to Operations Calendar`
}

export function priorityChangedMsg(priority) {
  return `Priority set to ${priority}`
}
