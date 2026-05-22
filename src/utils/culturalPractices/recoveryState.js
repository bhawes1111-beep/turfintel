// Cultural Practices — recovery state + categorization (explainable, no
// prediction). Recovery is a STORED, user-set field; this module only
// supplies a sensible DISPLAY DEFAULT when none is set, and groups practices
// for the Overview/Brief. The stored recovery_status always wins.

export const RECOVERY_STATES = ['not-started', 'in-progress', 'recovering', 'recovered', 'needs-attention']

export const RECOVERY_LABEL = {
  'not-started':     'Not started',
  'in-progress':     'In progress',
  'recovering':      'Recovering',
  'recovered':       'Recovered',
  'needs-attention': 'Needs attention',
}

/**
 * Effective recovery state for display. Uses the stored value if present;
 * otherwise a transparent default from status:
 *   planned   → not-started
 *   completed → in-progress   (work done, recovery underway by default)
 *   skipped   → null          (nothing to recover)
 * Never invents progress — just a starting label the user can override.
 */
export function effectiveRecovery(practice) {
  if (!practice) return null
  if (practice.recoveryStatus && RECOVERY_STATES.includes(practice.recoveryStatus)) {
    return practice.recoveryStatus
  }
  if (practice.status === 'planned')   return 'not-started'
  if (practice.status === 'completed') return 'in-progress'
  return null   // skipped / unknown → no recovery state
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * Categorize practices for the Overview / Brief:
 *   recentCompleted — completed, date ≤ today, newest first
 *   upcoming        — planned, date ≥ today, soonest first
 *   watch           — effective recovery is 'recovering' or 'needs-attention'
 *
 * Pure; operates on already-fetched rows (newest-first from the store).
 */
export function categorizePractices(practices, today = todayIso()) {
  const list = Array.isArray(practices) ? practices : []

  const recentCompleted = list
    .filter(p => p.status === 'completed' && (p.practiceDate ?? '') <= today)
    .sort((a, b) => (b.practiceDate ?? '').localeCompare(a.practiceDate ?? ''))

  const upcoming = list
    .filter(p => p.status === 'planned' && (p.practiceDate ?? '') >= today)
    .sort((a, b) => (a.practiceDate ?? '').localeCompare(b.practiceDate ?? ''))

  const watch = list
    .filter(p => {
      const r = effectiveRecovery(p)
      return r === 'recovering' || r === 'needs-attention'
    })
    .sort((a, b) => (b.practiceDate ?? '').localeCompare(a.practiceDate ?? ''))

  return { recentCompleted, upcoming, watch }
}
