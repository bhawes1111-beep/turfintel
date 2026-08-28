#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'

const seed = JSON.parse(fs.readFileSync('worker/seeds/earthworks_dry_fertilizers_2026-08-17.json', 'utf8'))
const products = seed.products
const byName = new Map(products.map(product => [product.product_name, product]))

assert.equal(products.length, 8, 'all six dry fertilizers and two soil conditioners are present')
assert.equal(byName.size, 8, 'product names are unique')
assert(products.every(product => product.product_name === product.product_name.toUpperCase()), 'product names are uppercase')
assert(products.every(product => product.category === 'fertilizer'), 'all rows use the supported fertilizer catalog category')
assert(products.every(product => product.rates.length > 0), 'every product has a published turf or aerification rate')
assert.equal(byName.get('REPLENISH 16-0-5').active_ingredients.find(item => item.name === 'Water Insoluble Nitrogen').percentage, 9.6)
assert.equal(byName.get('REPLENISH 10-2-5').active_ingredients.find(item => item.name === 'Water Insoluble Nitrogen').percentage, 4.55)
assert.equal(byName.get('MYCOREPLENISH 3-3-3').active_ingredients.find(item => item.name === 'Available Phosphate (P2O5)').percentage, 3)
assert.equal(byName.get('RENOVATEPLUS 1-0-1').active_ingredients.find(item => item.name === 'Calcium (Ca)').percentage, 5)
assert.equal(byName.get('ECOLITE').active_ingredients[0].name, 'Zeolite')

console.log('EarthWorks dry catalog smoke passed')
