#!/usr/bin/env node
// Cross-platform smoke aggregator.
//
//   node scripts/run-smokes.mjs        (or: npm run smoke)
//
// Discovers every scripts/smoke-*.mjs, runs them sequentially, prints a
// PASS/FAIL summary line per script, exits non-zero on any failure. Writes
// failing scripts' full stdout/stderr to .smoke-logs/<name>.log so they
// can be inspected without re-running.
//
// Replaces the inline bash loop we'd been pasting into every deploy turn.
// Works under PowerShell, cmd.exe, bash, zsh — no shell-specific syntax.
//
// Each smoke script is expected to end its stdout with a line containing
// "N passed, M failed". Any "M failed" with M > 0 (or a non-zero exit code)
// counts as a failure.

import { spawnSync } from 'node:child_process'
import { readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SMOKE_DIR  = 'scripts'
const LOG_DIR    = '.smoke-logs'
const FILE_REGEX = /^smoke-.+\.mjs$/

function listSmokes() {
  return readdirSync(SMOKE_DIR)
    .filter(f => FILE_REGEX.test(f))
    .sort()
}

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
}

function tailLine(text) {
  const lines = String(text || '').trimEnd().split(/\r?\n/)
  return lines[lines.length - 1] ?? ''
}

function parseTotals(line) {
  // Accept either "N passed, M failed" or decorated forms like "✅ N passed, M failed".
  const m = line.match(/(\d+)\s+passed,\s+(\d+)\s+failed/i)
  if (!m) return null
  return { passed: parseInt(m[1], 10), failed: parseInt(m[2], 10) }
}

function runOne(file) {
  const path = join(SMOKE_DIR, file)
  // `node` is on PATH for any environment that can run this script; no
  // shell required.
  const res = spawnSync(process.execPath, [path], {
    encoding: 'utf8',
    // Capture both streams so the .log file is the FULL transcript.
    stdio:    ['ignore', 'pipe', 'pipe'],
  })
  const stdout = res.stdout ?? ''
  const stderr = res.stderr ?? ''
  const combined = stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout
  const last     = tailLine(stdout)
  const totals   = parseTotals(last)

  const failed =
    res.status !== 0 ||
    !totals ||
    totals.failed > 0

  return { file, status: res.status, totals, last, combined, failed }
}

// ── Main ────────────────────────────────────────────────────────────────────

ensureLogDir()

const files = listSmokes()
if (files.length === 0) {
  console.error(`No smoke scripts found in ${SMOKE_DIR}/`)
  process.exit(1)
}

let totalPassed = 0
let totalFailed = 0
const failures  = []

const widest = files.reduce((w, f) => Math.max(w, f.length), 0)

for (const file of files) {
  const r = runOne(file)
  const label = file.padEnd(widest, ' ')
  const note  = r.totals
    ? `${r.totals.passed} passed, ${r.totals.failed} failed`
    : r.last || `(exit ${r.status})`

  if (r.failed) {
    console.log(`FAIL  ${label}  (${note})`)
    failures.push(r)
    // Persist full output for inspection.
    writeFileSync(join(LOG_DIR, file.replace(/\.mjs$/, '.log')), r.combined)
  } else {
    console.log(`PASS  ${label}  (${note})`)
    if (r.totals) {
      totalPassed += r.totals.passed
      totalFailed += r.totals.failed
    }
  }
}

console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} smoke script(s) FAILED:`)
  for (const f of failures) console.error(`  - ${f.file}  → see ${LOG_DIR}/${f.file.replace(/\.mjs$/, '.log')}`)
  console.error('')
  process.exit(1)
}

console.log(`All ${files.length} smoke scripts PASSED · ${totalPassed} assertions, ${totalFailed} failed.`)
process.exit(0)
