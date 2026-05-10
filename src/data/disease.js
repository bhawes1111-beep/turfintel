// Disease data — empty in production until live records are imported.
//
// Schemas:
// ACTIVE_ISSUES   — [{ id, name, pathogen, severity, status, area, ... }]
// DISEASE_LIBRARY — [{ id, name, pathogen, hosts, conditions, controls, ... }]
// DISEASE_ALERTS  — [{ id, severity, message, conditions, ... }]
// MAP_PINS        — [{ id, x, y, label, severity, issue, ... }]
// PHOTO_ITEMS     — [{ id, url, caption, date, area, ... }]

export const ACTIVE_ISSUES   = []
export const DISEASE_LIBRARY = []
export const DISEASE_ALERTS  = []
export const MAP_PINS        = []
export const PHOTO_ITEMS     = []
