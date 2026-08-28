import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const builder = fs.readFileSync(path.join(root, 'scripts', 'buildRightLineCatalog.mjs'), 'utf8')
const seed = JSON.parse(fs.readFileSync(path.join(root, 'worker', 'seeds', 'rightline_catalog_2026-08-08.json'), 'utf8'))
const products = new Map(seed.products.map(product => [product.product_name, product]))

assert.match(builder, /function classifyPgr\(ingredients\)/)
assert.doesNotMatch(builder, /pgr_class:\s*category === 'pgr' \? description/)
assert.equal(products.get('GROOM PGR').pgr_class, 'GA biosynthesis inhibitor - Class A')
assert.equal(products.get('PACLO 2 SC').pgr_class, 'GA biosynthesis inhibitor - Class B')
assert.equal(products.get('PROHEX 27.5 WDG').pgr_class, 'GA biosynthesis inhibitor - Class A')

for (const product of seed.products.filter(item => item.category === 'pgr')) {
  assert.ok(product.pgr_class.length < 50, `${product.product_name} PGR class should stay concise`)
}

console.log('RightLine PGR class smoke passed')
