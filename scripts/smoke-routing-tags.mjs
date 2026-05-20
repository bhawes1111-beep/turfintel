// Phase 34 — routing tag → chip mapping smoke test.
//
//   node scripts/smoke-routing-tags.mjs

import { routingChipsFromTags } from '../src/utils/routing/routingTags.js'

let passed = 0, failed = 0
function assert(cond, label, ctx) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`); if (ctx !== undefined) console.error('    ctx:', JSON.stringify(ctx)) }
}

// Empty / junk inputs degrade quietly.
assert(routingChipsFromTags(null).chips.length === 0, 'null → no chips')
assert(routingChipsFromTags([]).chips.length === 0, 'empty → no chips')
assert(routingChipsFromTags(['totally-unknown', 'xyz']).chips.length === 0, 'unknown tags ignored')

// Direction mapping + separators/case tolerance.
let r = routingChipsFromTags(['Mow_NS'])
assert(r.chips[0]?.icon === '↕' && r.chips[0]?.label === 'N–S', 'Mow_NS → ↕ N–S', r.chips)

r = routingChipsFromTags(['MOW-EW'])
assert(r.chips[0]?.label === 'E–W', 'MOW-EW → E–W (case-insensitive)', r.chips)

// Tone assignment.
r = routingChipsFromTags(['closed'])
assert(r.chips[0]?.tone === 'critical' && r.chips[0]?.icon === '⛔', 'closed → critical ⛔', r.chips)

r = routingChipsFromTags(['frost-delay'])
assert(r.chips[0]?.tone === 'caution', 'frost-delay → caution', r.chips)

r = routingChipsFromTags(['handwater'])
assert(r.chips[0]?.tone === 'weather', 'handwater → weather', r.chips)

// De-dupe: irrigation + irr collapse to one chip.
r = routingChipsFromTags(['irrigation', 'irr'])
assert(r.chips.length === 1, 'irrigation + irr de-duped to 1', r.chips)

// Tone ordering: critical before neutral.
r = routingChipsFromTags(['cleanup', 'closed'])
assert(r.chips[0]?.tone === 'critical' && r.chips[1]?.tone === 'neutral',
  'critical sorts before neutral', r.chips.map(c => c.tone))

// Cap + overflow.
r = routingChipsFromTags(
  ['mow-ns', 'cleanup', 'roll', 'double-cut', 'no-cleanup', 'skip', 'frost', 'closed'],
  { max: 6 },
)
assert(r.chips.length === 6 && r.extra === 2, 'caps at 6 with extra=2', { len: r.chips.length, extra: r.extra })

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
