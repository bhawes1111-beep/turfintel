// Phase 7B.2 — Turf Health Recurrence Intelligence.
//
// Pure, explainable rules over Turf Health observation rows. Same template
// as moistureIntel.js (Phase 7A): one input array, one output object,
// honest empty states, no invented precision, no ML. Reusable everywhere —
// workspace, Reports, future Morning Brief — without prop drilling or a
// React dependency.
//
// Inputs:
//   observations — turf_health_observations rows from useTurfHealthData():
//     { id, observedAt, location, healthType, severity, status,
//       followUpDate, orientation?, surfaceNote?, ... }
//   opts:
//     - now:        epoch ms (default Date.now()) — test seam for stable smoke
//     - windowDays: rolling window for severity-trend + ranking (default 90)
//
// Outputs:
//   {
//     hasData: boolean,
//     groups: [
//       {
//         key: '<location>::<healthType>',
//         location, healthType,
//         count, first, latest,
//         daysOpen,                      // first → (latest or today if open)
//         latestSeverity, latestStatus,
//         severityTrend: 'improving' | 'unchanged' | 'worsening' | 'insufficient data',
//         followUpDue:  boolean,         // any obs with followUpDate <= today AND not resolved
//         followUpDate: string|null,     // soonest due in this group
//         window30, window60, window90,  // counts per rolling window
//         isOpen,                        // any obs in group with status != 'resolved'
//         why: string,                   // short explanation for the trend
//       }, ...
//     ],
//     summary: {
//       totalObservations,
//       openGroups,                     // groups with at least one non-resolved row
//       worseningGroups,                // groups with severityTrend === 'worsening'
//       followUpDueCount,               // observations whose followUpDate <= today and not resolved
//       recurringCount,                 // groups with count >= 3 (within full input)
//     },
//     windowDays,
//   }
//
// Ranking: groups are returned sorted by:
//   1. isOpen DESC (open before resolved)
//   2. latestSeverity (high → moderate → low → null)
//   3. count DESC
//   4. latest DESC
// This matches the operational read: "what's open AND severe AND chronic
// AND fresh".

// ── Severity helpers ────────────────────────────────────────────────────────

const SEVERITY_RANK = { high: 0, moderate: 1, low: 2 }
function sevRank(s) {
  return SEVERITY_RANK[s] != null ? SEVERITY_RANK[s] : 99
}

// Compare two halves of the windowDays window: last `half` days vs the
// previous `half` days. Reports the severity trend in human terms.
//
// Rules (intentionally simple):
//   - fewer than 3 total observations in the window → 'insufficient data'
//   - mean severity rank IMPROVES (numerically lower → no wait, HIGHER
//     rank = LOWER severity in SEVERITY_RANK; "improving" means severity
//     got LESS severe, i.e. rank value INCREASED on average)
//   - mean rank gets MORE severe → 'worsening'
//   - within 0.4 → 'unchanged'
function computeSeverityTrend(observations, now, halfWindowMs) {
  // Bucket observations by half-window relative to `now`.
  const recent = []   // last `halfWindowMs`
  const prior  = []   // previous `halfWindowMs` (i.e. halfMs ago → 2*halfMs ago)
  for (const o of observations) {
    const t = Date.parse(o.observedAt ?? '')
    if (!Number.isFinite(t)) continue
    const age = now - t
    if (age < 0) continue
    if (age < halfWindowMs) recent.push(o)
    else if (age < halfWindowMs * 2) prior.push(o)
  }
  if (recent.length + prior.length < 3) {
    return { trend: 'insufficient data', why: 'not enough observations in the window to compare' }
  }
  if (recent.length === 0) {
    return { trend: 'improving', why: 'no recent observations in this window' }
  }
  if (prior.length === 0) {
    return { trend: 'worsening', why: 'all observations are in the recent half — newly recurring' }
  }
  const meanRank = (arr) => {
    const ranks = arr.map(o => sevRank(o.severity)).filter(r => r < 99)
    if (ranks.length === 0) return null
    return ranks.reduce((s, r) => s + r, 0) / ranks.length
  }
  const recentMean = meanRank(recent)
  const priorMean  = meanRank(prior)
  if (recentMean == null || priorMean == null) {
    return { trend: 'unchanged', why: 'severity unrecorded — cannot compare' }
  }
  // Lower rank = more severe (high=0). If recentMean < priorMean, severity
  // got WORSE; if recentMean > priorMean, severity IMPROVED.
  const delta = recentMean - priorMean
  if (delta <= -0.4) return { trend: 'worsening',  why: `mean severity worsened by ${(-delta).toFixed(1)} rungs` }
  if (delta >=  0.4) return { trend: 'improving',  why: `mean severity improved by ${(delta).toFixed(1)} rungs` }
  return { trend: 'unchanged', why: 'mean severity within ±0.4 rungs across the window halves' }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(aIso, bIso) {
  const a = Date.parse(aIso ?? '')
  const b = Date.parse(bIso ?? '')
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.floor(Math.abs(b - a) / 86_400_000)
}

function isOnOrBefore(iso, now) {
  const t = Date.parse(iso ?? '')
  if (!Number.isFinite(t)) return false
  return t <= now
}

function countWithinDays(observations, now, days) {
  const cutoff = now - days * 86_400_000
  let n = 0
  for (const o of observations) {
    const t = Date.parse(o.observedAt ?? '')
    if (Number.isFinite(t) && t >= cutoff) n++
  }
  return n
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * @param {Object[]} observations - turf_health_observations rows
 * @param {Object}   [opts]
 * @param {number}   [opts.now]         - epoch ms (default Date.now())
 * @param {number}   [opts.windowDays]  - rolling window for trend + ranking
 *                                         (default 90; valid 30/60/90)
 */
export function computeTurfHealthIntel(observations, opts = {}) {
  const list = Array.isArray(observations) ? observations : []
  const now  = typeof opts.now === 'number' ? opts.now : Date.now()
  const windowDays = opts.windowDays === 30 || opts.windowDays === 60 ? opts.windowDays : 90

  if (list.length === 0) {
    return {
      hasData: false,
      groups: [],
      summary: {
        totalObservations: 0,
        openGroups:        0,
        worseningGroups:   0,
        followUpDueCount:  0,
        recurringCount:    0,
      },
      windowDays,
    }
  }

  // Group by (location, healthType). Skip rows missing either — they can't
  // be classified as recurring. Pending optimistic rows (status set but
  // health type pending a synthetic id) are still grouped when the type is
  // present.
  const groupsByKey = new Map()
  for (const o of list) {
    if (!o.location || !o.healthType) continue
    const key = `${o.location}::${o.healthType}`
    let g = groupsByKey.get(key)
    if (!g) {
      g = { key, location: o.location, healthType: o.healthType, observations: [] }
      groupsByKey.set(key, g)
    }
    g.observations.push(o)
  }

  const halfWindowMs = (windowDays / 2) * 86_400_000

  let followUpDueCount = 0

  const groups = []
  for (const g of groupsByKey.values()) {
    // Order this group's observations newest-first for the per-group fields.
    const ordered = [...g.observations].sort((a, b) =>
      (b.observedAt ?? '').localeCompare(a.observedAt ?? ''),
    )
    const latest = ordered[0]
    const first  = ordered[ordered.length - 1]
    const isOpen = ordered.some(o => o.status !== 'resolved')

    // Earliest follow-up date that's still due (≤ now) AND attached to a
    // non-resolved observation. Surface count globally too.
    let groupFollowUpDate = null
    let groupFollowUpDue  = false
    for (const o of ordered) {
      if (o.status === 'resolved') continue
      if (!o.followUpDate) continue
      if (isOnOrBefore(o.followUpDate, now)) {
        groupFollowUpDue = true
        followUpDueCount++
        if (!groupFollowUpDate || o.followUpDate < groupFollowUpDate) {
          groupFollowUpDate = o.followUpDate
        }
      }
    }

    // daysOpen = first → (latest || today if open)
    const referenceForOpen = isOpen ? new Date(now).toISOString() : latest.observedAt
    const daysOpen = daysBetween(first.observedAt, referenceForOpen) ?? 0

    // Rolling windows.
    const window30 = countWithinDays(ordered, now, 30)
    const window60 = countWithinDays(ordered, now, 60)
    const window90 = countWithinDays(ordered, now, 90)

    // Severity trend across the configured window.
    const { trend, why } = computeSeverityTrend(ordered, now, halfWindowMs)

    groups.push({
      key:           g.key,
      location:      g.location,
      healthType:    g.healthType,
      count:         ordered.length,
      first:         first.observedAt,
      latest:        latest.observedAt,
      daysOpen,
      latestSeverity: latest.severity ?? null,
      latestStatus:   latest.status   ?? null,
      severityTrend:  trend,
      followUpDue:    groupFollowUpDue,
      followUpDate:   groupFollowUpDate,
      window30, window60, window90,
      isOpen,
      why,
    })
  }

  // Ranking. See top-of-file comment for the sort key intent.
  groups.sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1
    const sa = sevRank(a.latestSeverity), sb = sevRank(b.latestSeverity)
    if (sa !== sb) return sa - sb
    if (a.count !== b.count) return b.count - a.count
    return (b.latest ?? '').localeCompare(a.latest ?? '')
  })

  const openGroups      = groups.filter(g => g.isOpen).length
  const worseningGroups = groups.filter(g => g.severityTrend === 'worsening').length
  const recurringCount  = groups.filter(g => g.count >= 3).length

  return {
    hasData: true,
    groups,
    summary: {
      totalObservations: list.length,
      openGroups,
      worseningGroups,
      followUpDueCount,
      recurringCount,
    },
    windowDays,
  }
}
