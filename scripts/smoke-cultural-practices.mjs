// Cultural Practices — recovery state + categorization smoke test.
//
//   node scripts/smoke-cultural-practices.mjs

import {
  effectiveRecovery,
  categorizePractices,
  RECOVERY_STATES,
  RECOVERY_LABEL,
} from '../src/utils/culturalPractices/recoveryState.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// ── effectiveRecovery: stored wins; defaults are transparent ───────────────
assert(effectiveRecovery({ status: 'planned' }) === 'not-started', 'planned → not-started default')
assert(effectiveRecovery({ status: 'completed' }) === 'in-progress', 'completed → in-progress default')
assert(effectiveRecovery({ status: 'skipped' }) === null, 'skipped → no recovery state')
assert(effectiveRecovery({ status: 'completed', recoveryStatus: 'recovered' }) === 'recovered', 'stored recovery wins over default')
assert(effectiveRecovery({ status: 'planned', recoveryStatus: 'needs-attention' }) === 'needs-attention', 'stored needs-attention honored')
assert(effectiveRecovery({ status: 'completed', recoveryStatus: 'bogus' }) === 'in-progress', 'invalid stored value falls back to default')
assert(effectiveRecovery(null) === null, 'null practice → null')

// ── vocabulary integrity ───────────────────────────────────────────────────
assert(RECOVERY_STATES.length === 5, '5 recovery states', RECOVERY_STATES)
assert(RECOVERY_STATES.every(s => RECOVERY_LABEL[s]), 'every state has a label')

// ── categorization ─────────────────────────────────────────────────────────
const today = '2026-05-22'
const practices = [
  { id: 'a', practiceType: 'aerification', status: 'completed', practiceDate: '2026-05-20', recoveryStatus: 'recovering' },
  { id: 'b', practiceType: 'topdressing',  status: 'completed', practiceDate: '2026-05-18', recoveryStatus: 'recovered' },
  { id: 'c', practiceType: 'verticutting', status: 'planned',   practiceDate: '2026-05-25' },
  { id: 'd', practiceType: 'rolling',      status: 'planned',   practiceDate: '2026-05-23' },
  { id: 'e', practiceType: 'sand',         status: 'completed', practiceDate: '2026-05-10', recoveryStatus: 'needs-attention' },
  { id: 'f', practiceType: 'venting',      status: 'skipped',   practiceDate: '2026-05-19' },
]

const { recentCompleted, upcoming, watch } = categorizePractices(practices, today)

assert(recentCompleted.map(p => p.id).join(',') === 'a,b,e', 'recentCompleted = completed ≤ today, newest first', recentCompleted.map(p => p.id))
assert(upcoming.map(p => p.id).join(',') === 'd,c', 'upcoming = planned ≥ today, soonest first', upcoming.map(p => p.id))
assert(watch.map(p => p.id).sort().join(',') === 'a,e', 'watch = recovering OR needs-attention', watch.map(p => p.id))
assert(!watch.some(p => p.id === 'b'), 'recovered NOT in watch', watch.map(p => p.id))

// ── empty / honest ──────────────────────────────────────────────────────────
{
  const r = categorizePractices([], today)
  assert(r.recentCompleted.length === 0 && r.upcoming.length === 0 && r.watch.length === 0, 'empty → all empty')
  assert(categorizePractices(null, today).watch.length === 0, 'null → empty (no crash)')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
