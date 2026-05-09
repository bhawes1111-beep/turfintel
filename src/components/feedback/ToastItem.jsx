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
