// Phase 7B.2 — Cross-stress correlation: moisture × turf-health.
//
// Pure function over the two store snapshots both already loaded by the
// Turf Health workspace. Surfaces locations that appear in BOTH streams
// within a rolling window, ranked by combined activity. Answers the
// operational question: "Which zones repeatedly require handwatering AND
// show turf-health stress at the same time?"
//
// No new API, no schema, no stored relationship. Compute at render time
// over the existing observation arrays. Same explainable-rules ethos as
// computeTurfHealthIntel — every output traces to observed data; no
// invented precision.
//
// What counts on each side:
//   - moisture: only observations with ANY stress flag (wiltStress,
//     drySpot, handwaterRec, syringeRec) OR a low moisturePct reading
//     (≤ MOISTURE_LOW_THRESHOLD). Plain measurements without a stress
//     signal aren't operational "stress" — they're just data points.
//   - turf-health: any observation, regardless of status. The intent is
//     to catch locations under recurring scrutiny, including monitoring
//     and even recently-resolved ones (the resolved exclusion would
//     hide chronic-but-just-resolved patterns).
//
// Output shape (newest-relevant ranking):
//   {
//     hasData,
//     windowDays,
//     locations: [
//       {
//         location,
//         moistureCount,
//         moistureFlags: { wilt, dry, handwater, syringe, lowReading },
//         turfHealthCount,
//         turfHealthTypes: ['poor-airflow', 'morning-shade', ...],  // distinct types in window
//         score,                       // combined activity (see below)
//         latestEither,                // most recent observedAt across both streams
//       },
//       ...
//     ],
//     summary: { totalLocations, totalScore }
//   }
//
// Ranking score:
//   score = (moistureCount + 2 * turfHealthCount)
// The 2× weight reflects that turf-health observations are deliberate
// captures of chronic patterns, while moisture observations are routine
// daily logs — a single turf-health flag is operationally heavier than
// a single moisture flag at the same location.

const MOISTURE_LOW_THRESHOLD = 12  // VWC % — below this we count as "stress" regardless of flags

function withinWindow(iso, now, days) {
  const t = Date.parse(iso ?? '')
  if (!Number.isFinite(t)) return false
  return (now - t) <= days * 86_400_000 && t <= now
}

function moistureIsStress(o) {
  if (!o) return false
  if (o.wiltStress || o.drySpot || o.handwaterRec || o.syringeRec) return true
  if (typeof o.moisturePct === 'number' && Number.isFinite(o.moisturePct)
      && o.moisturePct <= MOISTURE_LOW_THRESHOLD) return true
  return false
}

/**
 * @param {Object}   input
 * @param {Object[]} [input.moistureObservations]
 * @param {Object[]} [input.turfHealthObservations]
 * @param {Object}   [opts]
 * @param {number}   [opts.now]         epoch ms (default Date.now())
 * @param {number}   [opts.windowDays]  default 30; honored as 30/60/90 only,
 *                                       falls back to 30 for anything else.
 */
export function computeStressCorrelation(input = {}, opts = {}) {
  const moisture   = Array.isArray(input.moistureObservations)   ? input.moistureObservations   : []
  const turfHealth = Array.isArray(input.turfHealthObservations) ? input.turfHealthObservations : []
  const now        = typeof opts.now === 'number' ? opts.now : Date.now()
  const windowDays = (opts.windowDays === 60 || opts.windowDays === 90) ? opts.windowDays : 30

  if (moisture.length === 0 && turfHealth.length === 0) {
    return {
      hasData: false,
      windowDays,
      locations: [],
      summary: { totalLocations: 0, totalScore: 0 },
    }
  }

  // Build the per-location accumulator. Keyed by location string — case-
  // sensitive match to whatever each store recorded (consistent with the
  // capture sheet's preset vocabulary).
  const byLocation = new Map()

  function ensure(location) {
    let row = byLocation.get(location)
    if (!row) {
      row = {
        location,
        moistureCount: 0,
        moistureFlags: { wilt: 0, dry: 0, handwater: 0, syringe: 0, lowReading: 0 },
        turfHealthCount: 0,
        turfHealthTypes: new Set(),
        latestEither: '',
      }
      byLocation.set(location, row)
    }
    return row
  }

  for (const o of moisture) {
    if (!o.location) continue
    if (!withinWindow(o.observedAt, now, windowDays)) continue
    if (!moistureIsStress(o)) continue
    const row = ensure(o.location)
    row.moistureCount++
    if (o.wiltStress)        row.moistureFlags.wilt++
    if (o.drySpot)           row.moistureFlags.dry++
    if (o.handwaterRec)      row.moistureFlags.handwater++
    if (o.syringeRec)        row.moistureFlags.syringe++
    if (typeof o.moisturePct === 'number' && o.moisturePct <= MOISTURE_LOW_THRESHOLD) {
      row.moistureFlags.lowReading++
    }
    if ((o.observedAt ?? '') > row.latestEither) row.latestEither = o.observedAt
  }

  for (const o of turfHealth) {
    if (!o.location) continue
    if (!withinWindow(o.observedAt, now, windowDays)) continue
    const row = ensure(o.location)
    row.turfHealthCount++
    if (o.healthType) row.turfHealthTypes.add(o.healthType)
    if ((o.observedAt ?? '') > row.latestEither) row.latestEither = o.observedAt
  }

  // Only surface locations where BOTH streams contributed — pure overlap
  // is the operational signal. Single-source noise doesn't qualify.
  const locations = []
  for (const row of byLocation.values()) {
    if (row.moistureCount === 0 || row.turfHealthCount === 0) continue
    locations.push({
      location:        row.location,
      moistureCount:   row.moistureCount,
      moistureFlags:   row.moistureFlags,
      turfHealthCount: row.turfHealthCount,
      turfHealthTypes: [...row.turfHealthTypes],
      score:           row.moistureCount + 2 * row.turfHealthCount,
      latestEither:    row.latestEither || null,
    })
  }

  // Rank by score DESC, then latestEither DESC. Stable enough for the
  // intended "top 3-5 in the Overview" display.
  locations.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    return (b.latestEither ?? '').localeCompare(a.latestEither ?? '')
  })

  const totalScore = locations.reduce((s, l) => s + l.score, 0)

  return {
    hasData: locations.length > 0,
    windowDays,
    locations,
    summary: {
      totalLocations: locations.length,
      totalScore,
    },
  }
}

// Exported for the smoke; intentionally not part of the public render contract.
export const __TEST = { MOISTURE_LOW_THRESHOLD, moistureIsStress, withinWindow }
