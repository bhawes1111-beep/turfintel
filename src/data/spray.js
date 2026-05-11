// Spray data — moved to D1 persistence in Phase 5.3.
// Consumers now use spraysStore (src/utils/sprays/spraysStore.js).
//
// Schemas (for reference; SQL truth lives in
// worker/migrations/0006_sprays.sql):
//
// spray_records  — { id, applicationName, targetPest, applicator, course,
//                    date, startTime, endTime, status,
//                    conditions: { temp, wind, humidity, soilTemp },
//                    rei, phi, carrierVolume, totalVolume, holes,
//                    area (first), areas[], products[], notes,
//                    createdAt, updatedAt }
//
// spray_products — { id, name, type, rate, unit, quantityUsed,
//                    inventoryItemId }  (nested inside record.products)
//
// spray_areas    — { id, name, acreage }  (nested inside record.areas)
//
// PLANNED_PROGRAMS remains static (spray templates are out of scope for
// the Phase 5.3 vertical migration).
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
