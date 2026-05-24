import { useEffect, useState } from 'react'
import styles from './feedback.module.css'

const TYPE_META = {
  success: { icon: '✓', cls: 'toastSuccess' },
  error:   { icon: '✕', cls: 'toastError'   },
  warning: { icon: '⚠', cls: 'toastWarning' },
  info:    { icon: 'ℹ', cls: 'toastInfo'    },
}

export default function ToastItem({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false)
  const meta = TYPE_META[toast.type] ?? TYPE_META.info

  function dismiss() {
    setExiting(true)
    setTimeout(() => onDismiss(toast.id), 210)
  }

  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return
    const t1 = setTimeout(() => setExiting(true),         toast.duration - 220)
    const t2 = setTimeout(() => onDismiss(toast.id),      toast.duration)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [toast.id, toast.duration, onDismiss])

  // Phase 7A.4 — optional inline action ("+ Add photo", "Undo", "View", …).
  // The handler decides whether to dismiss the toast — most actions want
  // the toast to close on tap, so we do that here unless onClick returned
  // the literal false (escape hatch for actions that want to keep the
  // toast visible while doing something async).
  function handleAction() {
    if (!toast.action || typeof toast.action.onClick !== 'function') return
    const keep = toast.action.onClick()
    if (keep !== false) dismiss()
  }

  return (
    <div
      className={[
        styles.toastItem,
        styles[meta.cls],
        exiting ? styles.toastExiting : '',
      ].filter(Boolean).join(' ')}
      role="alert"
    >
      <span className={styles.toastIcon}>{meta.icon}</span>
      <span className={styles.toastMessage}>{toast.message}</span>
      {toast.action && typeof toast.action.label === 'string' && (
        <button
          type="button"
          className={styles.toastAction}
          onClick={handleAction}
        >
          {toast.action.label}
        </button>
      )}
      <button
        className={styles.toastDismiss}
        onClick={dismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  )
}
