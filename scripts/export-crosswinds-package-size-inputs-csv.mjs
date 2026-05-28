// Phase 7V.4 — Export the Crosswinds package-size input worksheet as CSV
// so Bryan can fill in package sizes in a spreadsheet.
//
//   node scripts/export-crosswinds-package-size-inputs-csv.mjs            (CSV to stdout)
//   node scripts/export-crosswinds-package-size-inputs-csv.mjs --write     (write .csv next to the JSON)
//
// READ-ONLY. Reads docs/crosswinds-greens-program-2026-package-size-inputs.json
// and emits the columns:
//   productName, vendor, purchaseQuantity, purchaseUnit, totalCost,
//   neededInput, inputValue, inputUnit, notes
// Writes nothing unless --write (then only the .csv). No DB, no fetch,
// no apply. Editing the CSV does NOT feed back automatically — Bryan
// transcribes confirmed values into the JSON, then runs the calc script.

import { readFileSync, writeFileSync } from 'fs'

const INPUTS_FILE = 'docs/crosswinds-greens-program-2026-package-size-inputs.json'
const CSV_FILE    = 'docs/crosswinds-greens-program-2026-package-size-inputs.csv'

const WRITE = process.argv.slice(2).includes('--write')

const COLUMNS = [
  'productName', 'vendor', 'purchaseQuantity', 'purchaseUnit', 'totalCost',
  'neededInput', 'inputValue', 'inputUnit', 'notes',
]

// RFC-4180-ish CSV cell quoting: wrap in quotes + double internal quotes
// when the value contains a comma, quote, or newline.
function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(doc) {
  const entries = Array.isArray(doc.entries) ? doc.entries : []
  const lines = [COLUMNS.join(',')]
  for (const e of entries) {
    lines.push(COLUMNS.map(c => csvCell(e[c])).join(','))
  }
  return lines.join('\n') + '\n'
}

const doc = JSON.parse(readFileSync(INPUTS_FILE, 'utf8'))
const csv = toCsv(doc)

if (WRITE) {
  writeFileSync(CSV_FILE, csv, 'utf8')
  process.stderr.write(`Wrote ${CSV_FILE} (${doc.entries.length} rows)\n`)
} else {
  process.stdout.write(csv)
}
