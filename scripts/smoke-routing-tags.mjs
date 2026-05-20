// Phase 34 — routing tag → chip mapping smoke test.
//
//   node scripts/smoke-routing-tags.mjs

import {
  routingChipsFromTags,
  ROUTING_TAG_OPTIONS,
  ROUTING_PRESETS,
} from '../src/utils/routing/routingTags.js'

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

// ── Phase 35 authoring exports ───────────────────────────────────────────

// Every picker option's canonical value must be recognized by the parser
// (authoring/rendering stay in lock-step).
let allOptionsRender = true
for (const opt of ROUTING_TAG_OPTIONS) {
  const { chips } = routingChipsFromTags([opt.value])
  if (chips.length !== 1 || chips[0].label !== opt.label) { allOptionsRender = false; break }
}
assert(ROUTING_TAG_OPTIONS.length >= 12, 'at least 12 tag options exposed', { n: ROUTING_TAG_OPTIONS.length })
assert(allOptionsRender, 'every option value round-trips through the parser to its label')

// Every preset tag must be a recognized option value.
const optionValues = new Set(ROUTING_TAG_OPTIONS.map(o => o.value))
let presetsValid = true
for (const p of ROUTING_PRESETS) {
  for (const t of p.tags) {
    if (!optionValues.has(t)) { presetsValid = false; console.error(`   bad preset tag: ${p.key} → ${t}`) }
  }
}
assert(ROUTING_PRESETS.length >= 6, 'at least 6 presets exposed', { n: ROUTING_PRESETS.length })
assert(presetsValid, 'every preset references valid option values')

// A preset must produce chips when applied.
{
  const greens = ROUTING_PRESETS.find(p => p.key === 'greens-mow')
  const { chips } = routingChipsFromTags(greens?.tags ?? [])
  assert(chips.length === 2, 'greens-mow preset → 2 chips (direction + cleanup)', chips.map(c => c.label))
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
