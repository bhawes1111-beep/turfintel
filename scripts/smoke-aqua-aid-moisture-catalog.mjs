import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seedPath = path.join(root, 'worker', 'seeds', 'aqua_aid_moisture_catalog_2026-08-17.json')
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))

assert.equal(seed.products.length, 13, 'all current moisture-management products should be present')

const names = new Set(seed.products.map(product => product.product_name))
assert.equal(names.size, 13, 'catalog names should be unique')
assert.ok([...names].every(name => name === name.toUpperCase()), 'catalog names should be uppercase')

for (const product of seed.products) {
  assert.equal(product.brand_owner, 'AQUA-AID Solutions')
  assert.equal(product.category, 'surfactant')
  assert.equal(product.status, 'active')
  assert.ok(product.formulation, `${product.product_name} should identify its formulation`)
  assert.ok(product.label_url?.startsWith('https://www.aquaaidsolutions.com/'), `${product.product_name} should link to an official source`)
  assert.ok(Array.isArray(product.rates) && product.rates.length > 0, `${product.product_name} should include directions or rates`)
  assert.ok(product.rates.every(rate => rate.rate && rate.unit && rate.interval), `${product.product_name} has an incomplete rate`)
}

const byName = new Map(seed.products.map(product => [product.product_name, product]))
assert.match(byName.get('EXCALIBUR SOIL SURFACTANT').formulation, /Liquid \/ Pellet/)
assert.ok(byName.get('PBS150 MULTI-BRANCHED SOIL SURFACTANT').rates.some(rate => rate.unit === 'lb/1000 sq ft'))
assert.ok(byName.get('PBS150-INJ INJECTABLE SOIL SURFACTANT').rates.some(rate => rate.unit === 'qt/acre'))
assert.ok(byName.get('AQM SOIL SURFACTANT').active_ingredients.some(item => /Ascophyllum nodosum/i.test(item.name)))

console.log('AQUA-AID moisture catalog smoke passed')
