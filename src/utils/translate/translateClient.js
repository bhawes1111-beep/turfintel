// Phase 9C.5d — Translation control client helper.
//
// Single-purpose: POST /api/admin/translate/run and return the parsed
// summary. Used by the "Translate Now" button on the Daily Assignment
// Board so supervisors can fire the translation sweep without DevTools.
//
// The endpoint requires `canSystemSettings` server-side (Phase 9C.5c3b).
// Authorization rides automatically on the httpOnly session cookie via
// `credentials: 'same-origin'`. The mutationHeaders() helper supplies
// JSON Content-Type and the legacy x-admin-key when set locally.
//
// Error semantics: the caller catches and routes to UI toasts. We
// throw helpful errors with a `.status` property attached so the
// caller can branch on 401 / 403 / other without parsing message text.

import { mutationHeaders } from '../auth/mutationAuth'

const ENDPOINT = '/api/admin/translate/run'

class TranslateError extends Error {
  constructor(message, status) {
    super(message)
    this.name   = 'TranslateError'
    this.status = status
  }
}

/**
 * runTranslationSweep — fires the manual translation sweep on the
 * server. Returns the parsed JSON body { ok, summary } on success.
 * Throws TranslateError with a .status property on non-2xx.
 */
export async function runTranslationSweep() {
  let res
  try {
    res = await fetch(ENDPOINT, {
      method:      'POST',
      credentials: 'same-origin',
      headers:     mutationHeaders(),
    })
  } catch (err) {
    // Network-level failure (offline, DNS, CORS quirks).
    throw new TranslateError(`Network error: ${err?.message ?? err}`, 0)
  }
  if (!res.ok) {
    // Try to read the worker's { error: "..." } JSON for a clearer
    // message, but never throw if parsing fails.
    let detail = ''
    try {
      const body = await res.json()
      if (body && typeof body.error === 'string') detail = body.error
    } catch { /* fall through */ }
    throw new TranslateError(
      detail || `POST ${ENDPOINT} → ${res.status}`,
      res.status,
    )
  }
  return res.json()
}

// Phase 9C.8 — Auto-translate after work board edits.
//
// scheduleTranslationSweep() fires the same POST /api/admin/translate/run
// endpoint that runTranslationSweep() does, but after a debounced delay
// so a burst of edits (e.g. typing-then-blurring six English notes in
// quick succession) collapses into a single sweep instead of six.
//
// Behavior:
//   • Module-level timer holds the pending sweep. Calling
//     scheduleTranslationSweep() again before it fires CANCELS the
//     prior timer and restarts the countdown. This is the standard
//     "trailing-edge debounce" — the sweep fires once, `delayMs`
//     after the LAST schedule call.
//   • Default delay is 2000ms — short enough that a user editing
//     one English note sees Spanish appear quickly, long enough
//     that rapid-fire edits collapse cleanly.
//   • Failures are caught and console.debug-logged. There is no
//     toast — auto-triggers should be invisible UX. Manual triggers
//     (Translate Now, Regenerate) still show their own toasts.
//   • Callers that lack canSystemSettings will get a 403 from the
//     worker; that's silently swallowed and logged. The smarter
//     pattern is for callers to gate on can('canSystemSettings')
//     and only schedule when true.
let autoTranslateTimer = null

export function scheduleTranslationSweep({ delayMs = 2000 } = {}) {
  if (autoTranslateTimer) clearTimeout(autoTranslateTimer)
  autoTranslateTimer = setTimeout(() => {
    autoTranslateTimer = null
    runTranslationSweep().catch(err => {
      // Quiet failure path. Auto-triggers from save-success points
      // shouldn't surface toasts — the user just saved something,
      // they don't need a translation-failure alert popping up
      // unrelated to what they did. The next cron tick (or the
      // user's next save) will retry.
      console.debug('[translate] auto sweep failed:', err?.message ?? err)
    })
  }, delayMs)
}
