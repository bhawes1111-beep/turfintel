// Cultural practices data — empty in production until live records arrive.
//
// Schemas (preserved for reference and future re-population):
// AERIFICATION_EVENTS — [{ id, area, date, type, depth, spacing, status, ... }]
// TOPDRESS_EVENTS     — [{ id, area, date, rate, material, ... }]
// VERTICUT_EVENTS     — [{ id, area, date, depth, direction, ... }]
// ROLLING_LOG         — [{ id, date, area, double, single, operator, ... }]
// ROLLING_SUMMARY     — { currentMonth, ytd } per surface
// MOWING_SETTINGS     — [{ id, area, turf, currentHOC, ... }]
// MOWING_LOG          — [{ id, date, area, hoc, equipment, operator, ... }]
// CALENDAR_EVENTS     — [{ id, type, date, area, ... }]
// CP_REPORTS          — [{ id, period, summary, ... }]
//
// PRACTICE_COLORS is display config (NOT data) — preserved for badge colors.

export const AERIFICATION_EVENTS = []
export const TOPDRESS_EVENTS     = []
export const VERTICUT_EVENTS     = []
export const ROLLING_LOG         = []

export const ROLLING_SUMMARY = {
  currentMonth: {
    greens:   { total: 0, double: 0, single: 0 },
    tees:     { total: 0, double: 0, single: 0 },
    fairways: { total: 0, double: 0, single: 0 },
  },
  ytd: {
    greens:   { total: 0, double: 0, single: 0 },
    tees:     { total: 0, double: 0, single: 0 },
    fairways: { total: 0, double: 0, single: 0 },
  },
}

export const MOWING_SETTINGS = []
export const MOWING_LOG      = []

export const PRACTICE_COLORS = {
  aerification: '#7c5cbf',
  topdressing:  '#3a8ad4',
  verticutting: '#d4883a',
  rolling:      '#4a9e4a',
  mowing:       '#5db85d',
}

export const CALENDAR_EVENTS = []
export const CP_REPORTS      = []
