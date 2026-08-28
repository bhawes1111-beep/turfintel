import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const equipment = await readFile(new URL('../src/pages/Equipment/tabs/EquipmentIssuesReview.jsx', import.meta.url), 'utf8')
const irrigation = await readFile(new URL('../src/pages/Irrigation/tabs/Repairs.jsx', import.meta.url), 'utf8')

for (const [label, source] of [['equipment', equipment], ['irrigation', irrigation]]) {
  assert.doesNotMatch(source, /qty === '' \|\| qty == null \? '1' : qty/, `${label} ticket does not force blank quantity to one`)
  assert.match(source, /if \(qty === '' \|\| qty == null\) return null/, `${label} ticket leaves blank quantity unpriced`)
  assert.match(source, /cost: nextCost == null \? '' : formatMoneyInput\(nextCost\)/, `${label} ticket clears calculated cost while quantity is blank`)
}

console.log('Service ticket part quantity smoke passed')
