// Phase S.6a — Shared "needs info" heuristic for spray records.
//
// Single source of truth used by:
//   • SprayWorkspace "Compliance — Needs Info" card
//   • SprayRecords filter toggle
//   • reportBuilder compliance packet (per-record flag + summary count)
//
// Returns true when a `completed` record is missing a clearly-required
// compliance field. Planned / in-progress / pending-review records are
// expected to be incomplete and are NOT flagged.
//
// Required field set (mirrors S.3 compliance schema):
//   • date
//   • applicator (non-blank trim)
//   • products (non-empty array)
//   • areas    (non-empty array)
//   • conditions block present
//   • at least one of: temp | humidity | wind (free-text)
//   • windSpeedMph
//   • windDirection
//
// Pure. No fetch, no mutation, no store reads. Safe to import from
// any client surface OR from a pure JS report builder.

export function recordNeedsInfo(record) {
  if (!record) return false
  if (record.status !== 'completed') return false
  if (!record.date) return true
  if (!record.applicator || !String(record.applicator).trim()) return true
  if (!Array.isArray(record.products) || record.products.length === 0) return true
  if (!Array.isArray(record.areas)    || record.areas.length    === 0) return true
  const c = record.conditions
  if (!c) return true
  // Need at least one basic weather observation. Many states require
  // temp / wind / humidity on the application record. The free-text
  // wind field counts because the legacy column is still populated
  // on older records.
  const hasAnyWeather = c.temp != null || c.humidity != null || c.wind != null
  if (!hasAnyWeather) return true
  // Phase S.3 compliance — structured wind speed + direction required.
  if (c.windSpeedMph == null) return true
  if (!c.windDirection)        return true
  return false
}
