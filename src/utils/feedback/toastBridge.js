// Toast bridge — lets module-level code (vertical stores, helpers) fire
// toasts without depending on React context.
//
// Pattern: ToastProvider calls registerToast(handle) once on mount; module
// callers use bridgeToast() to grab the latest handle. If no provider has
// mounted yet (early boot, tests), calls are silently no-ops — the work
// the caller was doing still completes normally.
//
// Added in Phase 7A.4 so the moisture store can announce successful photo
// uploads from its async pipeline (which has no React component nearby to
// fire toast.success() directly). Reusable for future store-side notices.

let handle = null

/**
 * Called by ToastProvider on mount. Re-registers on remount; the latest
 * registration wins. Pass `null` on unmount to disable.
 * @param {Object|null} t  - the same shape returned by useToast()
 */
export function registerToast(t) {
  handle = t
}

/**
 * Module-side accessor. Returns the latest registered handle, or a no-op
 * stub if no provider has mounted yet. Always safe to call.
 * @returns {{ success: Function, error: Function, warning: Function, info: Function, show: Function, dismiss: Function }}
 */
export function bridgeToast() {
  if (handle) return handle
  return NOOP
}

const NOOP = {
  show:    () => {},
  dismiss: () => {},
  success: () => {},
  error:   () => {},
  warning: () => {},
  info:    () => {},
}
