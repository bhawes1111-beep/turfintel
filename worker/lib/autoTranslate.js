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
 * Scope matches the kiosk's dayCrew derivation in DisplayBoard.jsx:
 * an assignment is "for today" when its linked calendar_event has
 * start_date = today AND its own status is not cancelled. We JOIN
 * through calendar_events.start_date instead of using the row's own
 * assigned_at, because assigned_at is a creation timestamp (set to
 * now() at insert time), not a board-date scope — a row created
 * yesterday afternoon for today's event has assigned_at = yesterday.
 *
 * Phase 9C.5c3 originally filtered by DATE(assigned_at) = today, which
 * caused assignments that appeared on today's kiosk to silently miss
 * the sweep when they were authored on any prior day. 9C.5c3a fixes
 * this by mirroring the kiosk's join logic exactly: if it's on the
 * board, the sweep can see and translate it.
 *
 * Both indexed columns participate in the join — idx_cal_start_date on
 * calendar_events, and the unique (calendar_event_id, employee_name)
 * index on crew_assignments — so the JOIN stays cheap.
 */
async function sweepAssignments(env, budget) {
  if (budget <= 0) return { scanned: 0, translated: 0 }
  const today = todayIso()
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.notes
       FROM crew_assignments AS a
       JOIN calendar_events  AS e ON e.id = a.calendar_event_id
      WHERE a.notes IS NOT NULL
        AND TRIM(a.notes) != ''
        AND (a.notes_es IS NULL OR TRIM(a.notes_es) = '')
        AND e.start_date = ?
        AND a.status != 'cancelled'
      ORDER BY datetime(a.assigned_at) DESC
      LIMIT ?`,
  ).bind(today, budget).all()

  let translated = 0
  for (const row of results ?? []) {
    const out = await translateText(env, row.notes, { from: 'en', to: 'es' })
    if (!out) continue
    // Race-safe UPDATE — only writes when the row STILL has no manual
    // Spanish. A concurrent PATCH from the DAB authoring path wins.
    const result = await env.DB.prepare(
      `UPDATE crew_assignments
          SET notes_es = ?, updated_at = datetime('now')
        WHERE id = ?
          AND (notes_es IS NULL OR TRIM(notes_es) = '')`,
    ).bind(out, row.id).run()
    if (result?.success && (result.meta?.changes ?? 0) > 0) translated++
  }
  return { scanned: results?.length ?? 0, translated }
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
 */
export async function runAutoTranslateSweep(env) {
  const summary = {
    skipped: false,
    reason:  null,
    provider: env?.TRANSLATE_PROVIDER ?? 'none',
    budget:   0,
    assignments: { scanned: 0, translated: 0 },
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

    // Split the budget evenly-ish across the three tables. Assignments
    // get the largest share since they accumulate fastest. Remaining
    // budget is consumed in order: assignments → daily notes → alerts.
    const asn = await sweepAssignments(env, Math.floor(budget * 0.6))
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
