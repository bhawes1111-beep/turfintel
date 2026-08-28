#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'

const seed = JSON.parse(fs.readFileSync('worker/seeds/yara_us_fertilizer_catalog_2026-08-17.json', 'utf8'))
const products = seed.products

assert.equal(products.length, 63, 'imports 63 unique current Yara U.S. portfolio products')
assert.equal(new Set(products.map(product => product.product_name)).size, products.length, 'product names are unique')
assert(products.every(product => product.product_name === product.product_name.toUpperCase()), 'product names are uppercase')
assert(products.every(product => product.category === 'fertilizer'), 'all portfolio rows are fertilizers')
assert(products.every(product => product.manufacturer === 'Yara North America, Inc.'), 'manufacturer is consistent')
assert(products.every(product => product.active_ingredients.length > 0), 'every row has published nutrient analysis')
assert(products.every(product => /^https:\/\//.test(product.label_url)), 'every row links to an official page or label')
assert(!products.some(product => /TROPICOTE|TURF ROYALE/.test(product.product_name)), 'hand-verified detailed records are not duplicated')

const byName = new Map(products.map(product => [product.product_name, product]))
assert.equal(byName.get('YARALIVA CALCINIT15.5-0-0').fertilizer_analysis.startsWith('15.5-0-0;'), true)
assert.equal(byName.get('YARAMILA 15-15-15').fertilizer_analysis.startsWith('15-15-15;'), true)
assert.equal(byName.get('YARAVITA MAGTRAC').active_ingredients.find(item => item.name === 'Magnesium (Mg)').percentage, 20)
assert(byName.get('YARAVITA MAGTRAC').rates.some(rate => rate.unit === 'fl.oz/1,000 sq ft'), 'MAGTRAC carries its official turf rate')
assert.equal([...byName.keys()].filter(name => name === 'YARAVERA AMIDAS 40-0-0').length, 1, 'legacy AMIDAS URL is deduplicated')

console.log('Yara U.S. catalog smoke passed')
