import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createEquipment } from '../worker/api/equipment.js'

let inserted = null
const env = {
  DB: {
    prepare(sql) {
      if (/INSERT INTO equipment/.test(sql)) {
        return {
          bind(...values) {
            inserted = values
            return { run: async () => ({ success: true }) }
          },
        }
      }
      return {
        bind(id) {
          return {
            first: async () => ({
              id,
              name: 'Test Spreader',
              category: 'Spreader',
              capacity_lbs: inserted?.[12] ?? null,
            }),
          }
        },
      }
    },
  },
}

const request = new Request('https://example.test/api/equipment', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Test Spreader', category: 'Spreader', capacityLbs: 500 }),
})
const response = await createEquipment(env, request)
assert.equal(response.status, 200)
assert.equal(inserted[12], 500)
assert.equal((await response.json()).capacityLbs, 500)

const invalid = await createEquipment(env, new Request('https://example.test/api/equipment', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Test Spreader', category: 'Spreader', capacityLbs: 0 }),
}))
assert.equal(invalid.status, 400)

const ui = readFileSync('src/pages/Equipment/tabs/EquipmentList.jsx', 'utf8')
assert.match(ui, /label="Capacity \(lb\)"/)
assert.match(ui, /label="Pounds Capacity"/)

console.log('equipment pounds capacity smoke passed')
