#!/usr/bin/env node
// Phase 5.1d — Lightweight D1 migration tracker.
//
// Reads worker/migrations/*.sql, applies anything not yet recorded in the
// _migrations table, and records each success. Idempotent: re-running a
// second time skips already-applied migrations. Fails closed: a SQL error
// aborts the run and does NOT record the migration as applied.
//
// Usage:
//   node scripts/applyMigrations.js --local            # apply against local D1
//   node scripts/applyMigrations.js --remote           # apply against remote D1
//   node scripts/applyMigrations.js --local  --status  # list status only
//   node scripts/applyMigrations.js --remote --status  # list status only
//
// Intentionally tiny. Not a migration framework. No external deps —
// shells out to wrangler. The user-facing contract is: SQL files in
// worker/migrations/ apply in filename order, exactly once.

import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DB_NAME        = 'turfintel-db'
const MIGRATIONS_DIR = 'worker/migrations'
const TRACK_TABLE    = '_migrations'

// ── CLI ───────────────────────────────────────────────────────────────────

function parseArgs() {
  const args      = process.argv.slice(2)
  const remote    = args.includes('--remote')
  const local     = args.includes('--local')
  const status    = args.includes('--status')
  // --reconcile: record every on-disk migration file as applied WITHOUT
  // running its SQL. One-time backfill for envs whose schema is correct
  // but whose tracker rows drifted (e.g. files applied via direct
  // `wrangler d1 execute --file` while the runner was broken).
  const reconcile = args.includes('--reconcile')
  if (remote && local) {
    fail('Specify either --local or --remote, not both.')
  }
  if (!remote && !local) {
    fail('Specify --local or --remote.\n\n' +
         '  node scripts/applyMigrations.js --local\n' +
         '  node scripts/applyMigrations.js --remote\n' +
         '  node scripts/applyMigrations.js --local  --status\n' +
         '  node scripts/applyMigrations.js --remote --status\n' +
         '  node scripts/applyMigrations.js --remote --reconcile  (metadata-only backfill)')
  }
  if (status && reconcile) {
    fail('--status and --reconcile are mutually exclusive.')
  }
  return { target: remote ? 'remote' : 'local', status, reconcile }
}

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

// ── wrangler shell helpers ────────────────────────────────────────────────
// All wrangler invocations go through these two helpers so a future tool
// swap (or a wrangler-output change) is a one-place edit.

function wranglerJson(sql, target) {
  // Run a single SQL statement, capture JSON output.
  // We pass the SQL via a temp -c argument; wrangler --json prints an
  // array of result objects. Errors throw via execSync.
  const cmd = `npx wrangler d1 execute ${DB_NAME} --${target} --json --command ${quote(sql)}`
  const raw = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return parseWranglerJson(raw)
}

function wranglerFile(filePath, target) {
  // Run a whole .sql file. Inherit stdio so the user sees wrangler's
  // own output (statement counts, durations, errors).
  const cmd = `npx wrangler d1 execute ${DB_NAME} --${target} --file=${quote(filePath)}`
  execSync(cmd, { stdio: 'inherit' })
}

function quote(s) {
  // Cross-platform argv quoting. Wraps in double quotes; escapes any
  // embedded double quotes. Adequate for SQL and file paths used here.
  return `"${String(s).replace(/"/g, '\\"')}"`
}

function parseWranglerJson(raw) {
  // wrangler may print log lines before the JSON payload. Find the first
  // '[' (start of the results array) and parse from there.
  const start = raw.indexOf('[')
  if (start < 0) return []
  try {
    return JSON.parse(raw.slice(start))
  } catch {
    return []
  }
}

// ── Migration state ───────────────────────────────────────────────────────

function ensureTrackingTable(target) {
  // SINGLE LINE: cmd.exe (Windows/PowerShell) shell-quoting through execSync
  // mangles multi-line strings inside --command "…" and wrangler reports
  // "incomplete input: SQLITE_ERROR". The tracker DDL is short; keep it
  // on one line and the runner is portable.
  const sql = `CREATE TABLE IF NOT EXISTS ${TRACK_TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`
  wranglerJson(sql, target)
}

function readAppliedSet(target) {
  const result = wranglerJson(`SELECT name FROM ${TRACK_TABLE} ORDER BY name;`, target)
  // wrangler returns [{ results: [{ name: '...' }, ...], ... }]
  const rows = result[0]?.results ?? []
  return new Set(rows.map(r => r.name))
}

function recordMigration(name, target) {
  // INSERT OR IGNORE so reconcile and re-run paths are idempotent — same
  // SQL whether the row already exists or not. The new partial-unique
  // PRIMARY KEY on `name` enforces uniqueness either way.
  const escaped = String(name).replace(/'/g, "''")
  wranglerJson(`INSERT OR IGNORE INTO ${TRACK_TABLE} (name) VALUES ('${escaped}');`, target)
}

function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
}

// ── Modes ─────────────────────────────────────────────────────────────────

function printStatus(target) {
  console.log(`\nD1 migration status (${target}):\n`)
  ensureTrackingTable(target)
  const applied = readAppliedSet(target)
  const files   = listMigrationFiles()
  if (files.length === 0) {
    console.log('  (no migration files found in worker/migrations/)')
    return
  }
  for (const file of files) {
    const mark = applied.has(file) ? '✓ applied' : '· pending'
    console.log(`  ${mark}   ${file}`)
  }
  const pending = files.filter(f => !applied.has(f)).length
  console.log(`\n${applied.size} applied · ${pending} pending\n`)
}

/**
 * Reconcile mode — backfill the tracker for envs whose schema is correct
 * but whose tracker is missing rows. Runs NO migration SQL; only records
 * each on-disk file as applied. Uses INSERT OR IGNORE so re-running is a
 * no-op. Use after fixing the bootstrap quoting bug to catch the tracker
 * up to reality without re-applying any DDL.
 */
function reconcileTracker(target) {
  console.log(`\nReconciling _migrations tracker (${target}):\n`)
  ensureTrackingTable(target)
  const before = readAppliedSet(target)
  const files  = listMigrationFiles()
  if (files.length === 0) {
    console.log('  (no migration files found in worker/migrations/)')
    return
  }
  let added = 0
  for (const file of files) {
    if (before.has(file)) {
      console.log(`  skip      ${file}  (already recorded)`)
      continue
    }
    console.log(`  record    ${file}`)
    recordMigration(file, target)
    added++
  }
  const after = readAppliedSet(target)
  console.log(`\nDone. ${added} migration(s) backfilled. ${after.size}/${files.length} now tracked.`)
  if (after.size !== files.length) {
    console.error(`\nWARNING: tracker count (${after.size}) does not match file count (${files.length}). Investigate before applying further migrations.`)
    process.exit(1)
  }
}

function applyMigrations(target) {
  console.log(`\nApplying migrations (${target}):\n`)
  ensureTrackingTable(target)
  const applied = readAppliedSet(target)
  const files   = listMigrationFiles()
  if (files.length === 0) {
    console.log('  (no migration files found in worker/migrations/)')
    return
  }
  let appliedCount = 0
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}  (already applied)`)
      continue
    }
    console.log(`  apply ${file}  ...`)
    try {
      wranglerFile(join(MIGRATIONS_DIR, file), target)
      recordMigration(file, target)
      appliedCount++
      console.log(`        ✓ recorded\n`)
    } catch (err) {
      console.error(`        ✗ FAILED\n`)
      console.error('Aborting. The migration was NOT recorded as applied. Re-run after fixing the SQL.')
      process.exit(1)
    }
  }
  console.log(`Done. ${appliedCount} migration(s) newly applied; ${applied.size + appliedCount} recorded total.`)
}

// ── Entry ─────────────────────────────────────────────────────────────────

const { target, status, reconcile } = parseArgs()
try {
  if (reconcile)   reconcileTracker(target)
  else if (status) printStatus(target)
  else             applyMigrations(target)
} catch (err) {
  console.error('Migration runner aborted:', err.message || err)
  process.exit(1)
}
