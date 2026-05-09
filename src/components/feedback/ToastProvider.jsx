import { useState, useCallback, useMemo } from 'react'
import { ToastContext } from '../../utils/feedback/toastContext'
import ToastContainer from './ToastContainer'

let _nextId = 1

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback((message, type = 'success', duration = 3000) => {
    const id = _nextId++
    setToasts(prev => [...prev, { id, message, type, duration }])
    // Backup removal — ensures cleanup even if ToastItem unmounts early
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration + 600)
  }, [])

  const ctx = useMemo(() => ({
    show,
    dismiss,
    success: (msg, dur = 3000) => show(msg, 'success', dur),
    error:   (msg, dur = 4000) => show(msg, 'error',   dur),
    warning: (msg, dur = 3500) => show(msg, 'warning',  dur),
    info:    (msg, dur = 3000) => show(msg, 'info',    dur),
  }), [show, dismiss])

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}
