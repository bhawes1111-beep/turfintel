import assert from 'node:assert/strict'
import fs from 'node:fs'

const reports = fs.readFileSync(new URL('../src/pages/Reports/Reports.jsx', import.meta.url), 'utf8')
const defaults = reports.match(/sections:\s*\{([\s\S]*?)\n\s*\},\n\s*notes:/)?.[1] ?? ''

for (const key of ['weeklyGoals', 'maintenance', 'sprays', 'fertilizer']) {
  assert.match(defaults, new RegExp(`${key}:\\s+true`), `${key} should default on`)
}
for (const key of ['tasks', 'plannedApplications', 'irrigation', 'labor', 'hours']) {
  assert.match(defaults, new RegExp(`${key}:\\s+false`), `${key} should default off`)
}

console.log('owner report defaults smoke: ok')
