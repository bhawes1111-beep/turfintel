import { useState, useCallback, useMemo, useEffect } from 'react'
import { ToastContext } from '../../utils/feedback/toastContext'
import { registerToast } from '../../utils/feedback/toastBridge'
import ToastContainer from './ToastContainer'

let _nextId = 1

// Phase 7A.4 — toast.success / .error / .warning / .info accept either:
//   - a number (legacy: duration ms), or
//   - an options object: { duration?, action?: { label, onClick } }
// The optional action renders a tappable button inline (e.g. "+ Add photo"
// after a successful capture). Keeping this generic so future workflows
// (Undo, Confirm, View, etc.) can reuse the same shape.
function normalizeOpts(durOrOpts, defaultDuration) {
  if (durOrOpts == null) return { duration: defaultDuration, action: null }
  if (typeof durOrOpts === 'number') return { duration: durOrOpts, action: null }
  if (typeof durOrOpts === 'object') {
    return {
      duration: typeof durOrOpts.duration === 'number' ? durOrOpts.duration : defaultDuration,
      action:   durOrOpts.action ?? null,
    }
  }
  return { duration: defaultDuration, action: null }
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback((message, type = 'success', durOrOpts = 3000) => {
    const { duration, action } = normalizeOpts(durOrOpts, 3000)
    const id = _nextId++
    setToasts(prev => [...prev, { id, message, type, duration, action }])
    // Backup removal — ensures cleanup even if ToastItem unmounts early
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration + 600)
  }, [])

  const ctx = useMemo(() => ({
    show,
    dismiss,
    success: (msg, opts = 3000) => show(msg, 'success', opts),
    error:   (msg, opts = 4000) => show(msg, 'error',   opts),
    warning: (msg, opts = 3500) => show(msg, 'warning', opts),
    info:    (msg, opts = 3000) => show(msg, 'info',    opts),
  }), [show, dismiss])

  // Phase 7A.4 — expose this provider's handle to module-level callers
  // (e.g. moistureStore.uploadStagedPhoto) via the toast bridge. Safe to
  // call from anywhere; no-ops until this effect runs.
  useEffect(() => {
    registerToast(ctx)
    return () => registerToast(null)
  }, [ctx])

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}
