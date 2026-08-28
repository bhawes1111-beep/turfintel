import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(
  path.join(root, 'src/pages/Equipment/tabs/EquipmentIssuesReview.jsx'),
  'utf8',
)

const filterPosition = source.indexOf('aria-label="Filter equipment tickets"')
const serviceListPosition = source.indexOf('<section className={styles.serviceListPanel}')

assert.ok(filterPosition >= 0, 'equipment ticket filters should have an accessible label')
assert.ok(serviceListPosition >= 0, 'service ticket list should exist')
assert.ok(filterPosition < serviceListPosition, 'equipment ticket filters should render above service tickets')
assert.match(source, /if \(isFutureService\(item, today\)\) pending\.push\(item\)/)
assert.match(source, /filter === 'pending_review'\s*\? serviceBuckets\.pending/)
assert.match(source, /pending_review: issues[\s\S]*serviceBuckets\.pending\.length/)

console.log('Equipment issue sorting smoke checks passed.')
