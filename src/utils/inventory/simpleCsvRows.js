// Phase 7K (2/?) — Minimal CSV-to-rows helper for the Cost Import
// Review surface. Deliberately tiny:
//   - header row required
//   - rows split on \r?\n
//   - columns split on the literal "," — no quoted-comma support yet
//   - whitespace trimmed off each cell
//   - empty / whitespace-only lines skipped
//   - returns an array of plain row objects keyed by the header values
//
// PURE: no React, no fetch, no store imports, no mutation. The helper
// never throws on bad input — it returns [] (or an empty body) so the
// caller can surface a friendly "no rows yet" message without
// crashing the React tree.
//
// Strict invariants:
//   - never references product_catalog, budget, invoice processing,
//     ledger, PDF parsing, or AI extraction
//   - never persists anything
//   - never touches the file system / network

function splitCells(line) {
  if (line == null) return []
  return String(line).split(',').map(c => c.trim())
}

/**
 * Parse a plain CSV string with a header row into an array of
 * row objects.
 *
 * @param {string} text
 * @returns {Array<Object>}
 */
export function parseSimpleCsv(text) {
  if (text == null) return []
  const raw = String(text)
  if (raw.trim() === '') return []

  const lines = raw.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== '')
  if (lines.length === 0) return []

  const header = splitCells(lines[0]).filter(h => h !== '')
  if (header.length === 0) return []

  const out = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCells(lines[i])
    // Empty body line — already trimmed; skip without throwing.
    if (cells.length === 0 || cells.every(c => c === '')) continue
    const row = {}
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = cells[c] ?? ''
    }
    out.push(row)
  }
  return out
}

// Exposed for the smoke; not part of the public render contract.
export const __TEST = { splitCells }
