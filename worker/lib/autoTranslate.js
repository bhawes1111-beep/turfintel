// Phase 9C.5c3 — Auto-translation sweep.
//
// Runs from the worker's scheduled() handler (every 30 min). Fills
// blank *_es columns on the three crew-broadcast content tables:
//
//   crew_assignments.notes        → crew_assignments.notes_es
//   operations_daily_notes.title  → operations_daily_notes.title_es
//   operations_daily_notes.body   → operations_daily_notes.body_es
//   alerts.title                  → alerts.title_es
//   alerts.message                → alerts.message_es
//
// Invariants enforced by SQL (race-safe with concurrent human authoring):
//   • Every UPDATE includes `AND <col>_es IS NULL` so a manual Spanish
//     value authored via Phase 9C.5b2 is NEVER overwritten.
//   • Total rows translated per run is capped by TRANSLATE_MAX_PER_RUN
//     so a cron loop bug can't run away with cost.
//   • The sweep early-returns when NO active employee has
//     auto_translate_board_notes=1 AND board_language='es'. Cheap
//     no-op when nobody needs translation.
//
// Privacy: this module reads ONLY from crew-broadcast content tables
// (crew_assignments / operations_daily_notes / alerts) plus the
// translation-prefs columns on crew_employees (auto_translate_board_notes,
// board_language). It NEVER reads or writes the 9C.5a.5 private fields
// (pay_rate, emergency_contact, etc.) and NEVER touches the per-
// employee admin notes column (crew_employees.notes).

import { translateText } from './translate.js'

const DEFAULT_MAX_PER_RUN = 50

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Returns true when at least one active crew_employees row has
 * auto-translate enabled AND a non-English board language. When this
 * returns false the entire sweep is a no-op — the kiosk falls back to
 * manual *_es authoring (Phase 9C.5b2/b3) and the cron costs nothing.
 */
async function anyEmployeeNeedsTranslation(env) {
  if (!env?.DB) return false
  const row = await env.DB.prepare(
    `SELECT 1 AS n FROM crew_employees
      WHERE auto_translate_board_notes = 1
        AND board_language = 'es'
        AND status = 'active'
      LIMIT 1`,
  ).first()
  return row != null
}

/**
 * Translation sweep for crew_assignments.notes → notes_es.
 *
 * Phase 9C.7a — Scope widened to ALL eligible assignment rows across
 * ALL dates. Previously the sweep JOINed calendar_events.start_date =
 * today (9C.5c3a), which mirrored the kiosk's dayCrew derivation for
 * the public TV view. That was correct for the kiosk but wrong for the
 * Translate Now / Regenerate UX — a supervisor toggling Spanish on for
 * Jose, then clicking Regenerate on a row for tomorrow's task, would
 * see assignments.scanned: 0 and assume the system was broken.
 *
 * Eligibility is now driven by the assignment itself + the linked
 * employee's translation prefs, not by today's calendar:
 *   • notes is non-blank
 *   • notes_es is blank (preserves manual override — 9C.5b2)
 *   • status != 'cancelled'
 *   • linked employee (by employee_id, falling back to employee_name)
 *     is active AND has auto_translate_board_notes=1 AND board_language='es'
 *
 * The TRANSLATE_MAX_PER_RUN budget still caps each run, so a backlog
 * of 100 blank rows drains over ~2-3 ticks at the default 50 limit.
 *
 * Ordering: `assigned_at DESC` so recently-created tasks (typically
 * today or tomorrow) translate first — the supervisor sees the most
 * relevant rows fill in immediately, and any historical backlog
 * follows behind.
 *
 * Manual override protection is unchanged: the UPDATE statement still
 * carries the race-safe `WHERE notes_es IS NULL OR TRIM = ''` guard.
 */
async function sweepAssignments(env, budget) {
  if (budget <= 0) return { scanned: 0, translated: 0 }
  // Employee-opt-in filter joins to crew_employees by employee_id when
  // populated (Phase 5.6b backfilled this for matching rows), falling
  // back to employee_name for legacy rows that never linked to a
  // crew_employees.id. LEFT JOIN + the WHERE clause's employee status
  // checks together enforce eligibility — rows with no matching
  // employee are excluded by the `emp.status = 'active'` predicate.
  // Phase DAB.10j — Employee-match normalization. The previous
  //   OR emp.name = a.employee_name
  // predicate silently missed legacy assignments where the stored
  // employee_name had trailing whitespace, mixed case, or double
  // spaces — none of those are visible to the supervisor but they
  // break exact string equality in SQLite. Match on the LOWER +
  // TRIM'd form of both sides so 'John Smith ' == 'john smith'
  // for the join, matching how the client-side normalized-name
  // fallback behaves. Employee ID still wins when populated.
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.notes
       FROM crew_assignments AS a
       LEFT JOIN crew_employees AS emp
         ON  emp.id = a.employee_id
         OR  LOWER(TRIM(emp.name)) = LOWER(TRIM(a.employee_name))
      WHERE a.notes IS NOT NULL
        AND TRIM(a.notes) != ''
        AND (a.notes_es IS NULL OR TRIM(a.notes_es) = '')
        AND a.status != 'cancelled'
        AND emp.status = 'active'
        AND emp.auto_translate_board_notes = 1
        AND emp.board_language = 'es'
      ORDER BY datetime(a.assigned_at) DESC
      LIMIT ?`,
  ).bind(budget).all()

  let translated = 0
  let failed     = 0
  // Phase DAB.10k — Reason-code buckets so a single debug run answers
  // WHY the sweep isn't producing translations. Every candidate row
  // increments exactly one of translated / reasons.*. Sum of reasons +
  // translated === scanned (invariant). Reason names are safe to log
  // and expose in the /api/admin/translate/run debug response — they
  // carry no source or translated text.
  const reasons = {
    empty_provider_result: 0,   // translateText returned null (provider off / AI parse failed)
    provider_error:        0,   // translateText threw (network / rate limit)
    update_not_applied:    0,   // UPDATE succeeded but changes=0 (race with manual authoring)
    identical_to_source:   0,   // provider returned English input unchanged (model refused)
    write_failed:          0,   // D1 UPDATE returned success=false
  }
  for (const row of results ?? []) {
    // Phase DAB.10j — Per-row try/catch so one bad row (transient
    // AI provider hiccup, D1 write race) doesn't abort the whole
    // sweep. Errors are logged with row id only (no note contents)
    // and the loop continues to the next candidate.
    try {
      const out = await translateText(env, row.notes, { from: 'en', to: 'es' })
      if (!out) {
        // Phase DAB.10k — treat null/blank provider result as an
        // explicit failure bucket instead of silently continuing. This
        // is the most common cause of a sweep that reports scanned>0
        // + translated=0 with no other signal.
        failed++
        reasons.empty_provider_result++
        continue
      }
      // Phase DAB.10k — validate the returned string before writing.
      // Provider is instructed to output Spanish only; if we get the
      // English input back verbatim (some model refusals do this), we
      // reject it so the row stays eligible for the next sweep.
      const outTrim = String(out).trim()
      if (outTrim.length === 0) {
        failed++
        reasons.empty_provider_result++
        continue
      }
      if (outTrim === String(row.notes ?? '').trim()) {
        failed++
        reasons.identical_to_source++
        continue
      }
      // Race-safe UPDATE — only writes when the row STILL has no manual
      // Spanish. A concurrent PATCH from the DAB authoring path wins.
      const result = await env.DB.prepare(
        `UPDATE crew_assignments
            SET notes_es = ?, updated_at = datetime('now')
          WHERE id = ?
            AND (notes_es IS NULL OR TRIM(notes_es) = '')`,
      ).bind(outTrim, row.id).run()
      if (!result?.success) {
        failed++
        reasons.write_failed++
        continue
      }
      const changes = result.meta?.changes ?? 0
      if (changes > 0) {
        translated++
      } else {
        // Row still exists (WHERE id = ? matched) but the notes_es
        // guard rejected the write — a concurrent manual PATCH filled
        // it. Not a failure per se; count as update_not_applied so it
        // shows up distinctly in the debug summary.
        failed++
        reasons.update_not_applied++
      }
    } catch (err) {
      failed++
      reasons.provider_error++
      console.warn('[TurfIntel Translate] row failed', {
        id: row.id,
        message: err?.message ?? String(err),
      })
    }
  }
  return { scanned: results?.length ?? 0, translated, failed, reasons }
}

/**
 * Translation sweep for operations_daily_notes.title/body → title_es/body_es.
 * Scope: today's notes only (note_date = today, status = 'active').
 * Title and body are translated independently so a daily note with only
 * a title (or only a body) is handled correctly.
 */
async function sweepDailyNotes(env, budget) {
  if (budget <= 0) return { scanned: 0, translated: 0 }
  const today = todayIso()
  const { results } = await env.DB.prepare(
    `SELECT id, title, body, title_es, body_es FROM operations_daily_notes
      WHERE note_date = ?
        AND status = 'active'
        AND (
              (title IS NOT NULL AND TRIM(title) != '' AND (title_es IS NULL OR TRIM(title_es) = ''))
           OR (body  IS NOT NULL AND TRIM(body)  != '' AND (body_es  IS NULL OR TRIM(body_es)  = ''))
        )
      LIMIT ?`,
  ).bind(today, budget).all()

  let translated = 0
  for (const row of results ?? []) {
    // Translate title if needed.
    if (row.title && row.title.trim() && !(row.title_es && row.title_es.trim())) {
      const out = await translateText(env, row.title, { from: 'en', to: 'es' })
      if (out) {
        const r = await env.DB.prepare(
          `UPDATE operations_daily_notes
              SET title_es = ?, updated_at = datetime('now')
            WHERE id = ?
              AND (title_es IS NULL OR TRIM(title_es) = '')`,
        ).bind(out, row.id).run()
        if (r?.success && (r.meta?.changes ?? 0) > 0) translated++
      }
    }
    // Translate body if needed.
    if (row.body && row.body.trim() && !(row.body_es && row.body_es.trim())) {
      const out = await translateText(env, row.body, { from: 'en', to: 'es' })
      if (out) {
        const r = await env.DB.prepare(
          `UPDATE operations_daily_notes
              SET body_es = ?, updated_at = datetime('now')
            WHERE id = ?
              AND (body_es IS NULL OR TRIM(body_es) = '')`,
        ).bind(out, row.id).run()
        if (r?.success && (r.meta?.changes ?? 0) > 0) translated++
      }
    }
  }
  return { scanned: results?.length ?? 0, translated }
}

/**
 * Translation sweep for alerts.title/message → title_es/message_es.
 * Scope: alerts that are still in scope on the kiosk (status NOT IN
 * resolved/dismissed-equivalent). Programmatic alerts dominate this
 * table; we translate their English text so the kiosk marquee can
 * surface bilingual content for Spanish-needing crew members.
 */
async function sweepAlerts(env, budget) {
  if (budget <= 0) return { scanned: 0, translated: 0 }
  const { results } = await env.DB.prepare(
    `SELECT id, title, message, title_es, message_es FROM alerts
      WHERE status NOT IN ('resolved')
        AND (
              (title   IS NOT NULL AND TRIM(title)   != '' AND (title_es   IS NULL OR TRIM(title_es)   = ''))
           OR (message IS NOT NULL AND TRIM(message) != '' AND (message_es IS NULL OR TRIM(message_es) = ''))
        )
      ORDER BY datetime(created_at) DESC
      LIMIT ?`,
  ).bind(budget).all()

  let translated = 0
  for (const row of results ?? []) {
    if (row.title && row.title.trim() && !(row.title_es && row.title_es.trim())) {
      const out = await translateText(env, row.title, { from: 'en', to: 'es' })
      if (out) {
        const r = await env.DB.prepare(
          `UPDATE alerts
              SET title_es = ?, updated_at = datetime('now')
            WHERE id = ?
              AND (title_es IS NULL OR TRIM(title_es) = '')`,
        ).bind(out, row.id).run()
        if (r?.success && (r.meta?.changes ?? 0) > 0) translated++
      }
    }
    if (row.message && row.message.trim() && !(row.message_es && row.message_es.trim())) {
      const out = await translateText(env, row.message, { from: 'en', to: 'es' })
      if (out) {
        const r = await env.DB.prepare(
          `UPDATE alerts
              SET message_es = ?, updated_at = datetime('now')
            WHERE id = ?
              AND (message_es IS NULL OR TRIM(message_es) = '')`,
        ).bind(out, row.id).run()
        if (r?.success && (r.meta?.changes ?? 0) > 0) translated++
      }
    }
  }
  return { scanned: results?.length ?? 0, translated }
}

/**
 * runAutoTranslateSweep — top-level entry point invoked from the
 * scheduled() handler. Returns a summary object that the caller can
 * log; never throws.
 *
 * Phase DAB.10k.1 — Optional `opts.debug` flag guarantees the
 * assignments table receives at least one budget slot even when the
 * caller has forced TRANSLATE_MAX_PER_RUN down to 1. Without this,
 * the 60% assignments split computed as `Math.floor(1 * 0.6) = 0`
 * and the debug endpoint could never actually invoke translateText,
 * so `attempts` came back empty and the diagnostic told us nothing.
 * The flag is opt-in and only used by the manual admin endpoint;
 * the scheduled() cron handler still uses the default budget split.
 */
export async function runAutoTranslateSweep(env, opts = {}) {
  const debug = Boolean(opts?.debug)
  // Phase DAB.10k — Expose the resolved AI model + a top-level trigger
  // hint (defaulting to 'cron'; the /api/admin/translate/run handler
  // overwrites it to 'manual' before returning). Assignments summary
  // now carries `failed` + `reasons` so `?debug=1` reveals the failure
  // mode in one call.
  const summary = {
    trigger:  'cron',
    debug,
    skipped:  false,
    reason:   null,
    provider: env?.TRANSLATE_PROVIDER ?? 'none',
    model:    env?.TRANSLATE_MODEL    ?? null,
    budget:   0,
    assignments: { scanned: 0, translated: 0, failed: 0, reasons: {} },
    dailyNotes:  { scanned: 0, translated: 0 },
    alerts:      { scanned: 0, translated: 0 },
  }
  try {
    if (!env?.DB) {
      summary.skipped = true
      summary.reason  = 'no-db-binding'
      return summary
    }
    if ((env?.TRANSLATE_PROVIDER ?? 'none').toLowerCase() === 'none') {
      summary.skipped = true
      summary.reason  = 'provider-none-killswitch'
      return summary
    }
    const needs = await anyEmployeeNeedsTranslation(env)
    if (!needs) {
      summary.skipped = true
      summary.reason  = 'no-employee-needs-translation'
      return summary
    }

    // Budget cap from env var. parseInt for safety; clamp to a sane range.
    const raw = parseInt(env?.TRANSLATE_MAX_PER_RUN, 10)
    const budget = Number.isFinite(raw) && raw > 0
      ? Math.min(raw, 500)
      : DEFAULT_MAX_PER_RUN
    summary.budget = budget

    // Phase DAB.10k.1 — Debug mode guarantees a single assignment
    // slot. Normal (cron / non-debug manual) runs keep the existing
    // 60% assignments / 20% daily-notes / 20% alerts split.
    const assignmentBudget = debug ? 1 : Math.floor(budget * 0.6)

    // Split the budget across the three tables. Assignments get the
    // largest share since they accumulate fastest. Remaining budget
    // is consumed in order: assignments → daily notes → alerts.
    const asn = await sweepAssignments(env, assignmentBudget)
    summary.assignments = asn
    const dailyBudget = budget - (asn.translated + asn.scanned > 0 ? asn.scanned : 0)
    const dn = await sweepDailyNotes(env, Math.max(0, Math.min(20, dailyBudget)))
    summary.dailyNotes = dn
    const alertBudget = budget - asn.scanned - dn.scanned
    const al = await sweepAlerts(env, Math.max(0, Math.min(20, alertBudget)))
    summary.alerts = al

    return summary
  } catch (err) {
    summary.skipped = true
    summary.reason  = `error:${err?.message ?? err}`
    console.warn('[autoTranslate] sweep error:', err?.message ?? err)
    return summary
  }
}
