import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rowToItem } from '../worker/api/inventory.js'

const mapped = rowToItem({
  id: 'inv-test',
  kind: 'chemical',
  name: '  Mixed Case Product  ',
})
assert.equal(mapped.name, 'MIXED CASE PRODUCT')

const api = readFileSync('worker/api/inventory.js', 'utf8')
assert.match(api, /const name = normalizeInventoryName\(body\.name\)/)
assert.match(api, /if \(apiKey === 'name'\)/)

const migration = readFileSync('worker/migrations/0087_inventory_names_uppercase.sql', 'utf8')
assert.match(migration, /SET name = UPPER\(TRIM\(name\)\)/)

console.log('inventory uppercase names smoke passed')
