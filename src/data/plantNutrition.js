// Plant nutrition data — empty in production until live records are imported.
//
// Schemas:
// SOIL_REPORTS    — [{ id, area, lab, date, ph, om, p, k, ca, mg, ... }]
// TISSUE_REPORTS  — [{ id, area, lab, date, n, p, k, ... }]
// WATER_REPORTS   — [{ id, source, lab, date, ph, ec, sar, ... }]
// TREND_SERIES    — [{ id, area, metric, points[] }]
// RECOMMENDATIONS — [{ id, area, summary, products[], priority, ... }]
// UPLOADED_FILES  — [{ id, name, kind, size, uploadedAt, status, ... }]

export const SOIL_REPORTS    = []
export const TISSUE_REPORTS  = []
export const WATER_REPORTS   = []
export const TREND_SERIES    = []
export const RECOMMENDATIONS = []
export const UPLOADED_FILES  = []
