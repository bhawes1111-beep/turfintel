// Spray data — empty in production until live records are imported.
//
// Schemas:
// SPRAY_EVENTS     — [{ id, date, product, type, area, status, applicator }]
// SPRAY_RECORDS    — [{ id, date, product, type, rate, area, weather, ... }]
// PLANNED_PROGRAMS — [{ id, name, target, products[], cadence, ... }]
//
// TYPE_COLORS is display config (NOT data) — preserved for category badges.

export const SPRAY_EVENTS     = []
export const SPRAY_RECORDS    = []
export const PLANNED_PROGRAMS = []

export const TYPE_COLORS = {
  Fungicide:   { bg: 'rgba(124,77,255,0.18)',  text: '#a07cff', border: 'rgba(124,77,255,0.45)' },
  Herbicide:   { bg: 'rgba(220,160,50,0.18)',  text: '#dca032', border: 'rgba(220,160,50,0.45)' },
  Insecticide: { bg: 'rgba(220,70,70,0.18)',   text: '#e87070', border: 'rgba(220,70,70,0.45)'  },
  PGR:         { bg: 'rgba(0,160,160,0.18)',   text: '#40c0c0', border: 'rgba(0,160,160,0.45)'  },
  Fertilizer:  { bg: 'rgba(74,158,74,0.18)',   text: '#4a9e4a', border: 'rgba(74,158,74,0.45)'  },
}
