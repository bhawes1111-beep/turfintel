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
