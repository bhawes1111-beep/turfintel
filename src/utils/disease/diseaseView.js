// Disease — pure view helpers (no React, no fetch).
//
// Categorize observations for display and pick out recent fungicide sprays
// from the existing spray records (the treatment link). Kept pure so the
// Observations tab and the Overview share one source of truth, and so it is
// node-testable.

const OPEN_STATUSES   = new Set(['suspected', 'confirmed', 'treated', 'monitoring'])
const ACTIVE_CONCERN  = new Set(['suspected', 'confirmed'])

/** Split observations into active concerns / monitoring / resolved buckets. */
export function categorizeObservations(observations = []) {
  const active     = []
  const monitoring = []
  const resolved   = []
  for (const o of observations) {
    if (!o) continue
    if (o.status === 'resolved')            resolved.push(o)
    else if (ACTIVE_CONCERN.has(o.status))  active.push(o)
    else                                    monitoring.push(o)   // treated, monitoring
  }
  return { active, monitoring, resolved }
}

/** Open (non-resolved) observations with a high severity flag. */
export function highSeverityOpen(observations = []) {
  return observations.filter(o => o && OPEN_STATUSES.has(o.status) && o.severity === 'high')
}

/** Open observations with a follow-up date on or before `asOf` (ISO date). */
export function dueFollowUps(observations = [], asOf = new Date().toISOString().slice(0, 10)) {
  return observations.filter(o =>
    o && OPEN_STATUSES.has(o.status) && o.followUpDate && o.followUpDate <= asOf,
  )
}

/**
 * recentFungicideSprays — pull fungicide applications from existing spray
 * records (the treatment-history link). A record counts as fungicide if any
 * of its products has a type containing "fungicide". Returns newest first,
 * normalized to { id, date, products: [name], target }.
 */
export function recentFungicideSprays(sprays = [], { days = 45, limit = 8 } = {}) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const out = []
  for (const s of sprays) {
    if (!s) continue
    const products = Array.isArray(s.products) ? s.products : []
    const isFungicide = products.some(p => typeof p?.type === 'string' && /fungicide/i.test(p.type))
    if (!isFungicide) continue
    if (s.date && s.date < cutoff) continue
    out.push({
      id:       s.id,
      date:     s.date ?? null,
      target:   s.target ?? null,
      products: products.filter(p => /fungicide/i.test(p?.type ?? '')).map(p => p.name).filter(Boolean),
    })
  }
  out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  return out.slice(0, limit)
}

/** Recent moisture wet-flag labels, for the awareness module's input. */
export function recentMoistureFlags(moistureObs = [], { hours = 48 } = {}) {
  const cutoff = Date.now() - hours * 3_600_000
  const flags = []
  for (const o of moistureObs ?? []) {
    if (!o) continue
    const t = Date.parse(o.observedAt)
    if (Number.isFinite(t) && t < cutoff) continue
    if (o.handwaterRec) flags.push(`Handwater ${o.location ?? ''}`.trim())
    if (o.wiltStress)   flags.push(`Wilt ${o.location ?? ''}`.trim())
    // standing-water / wet flags if the moisture log carries a free-text note
    if (typeof o.notes === 'string' && /wet|standing water|saturat/i.test(o.notes)) {
      flags.push(o.notes)
    }
  }
  return flags
}
