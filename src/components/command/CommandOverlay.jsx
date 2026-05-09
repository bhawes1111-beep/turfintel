import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import CommandPalette from './CommandPalette'
import styles from './command.module.css'

export default function CommandOverlay() {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const prevFocus = useRef(null)
  const navigate  = useNavigate()

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Focus management
  useEffect(() => {
    if (open) {
      prevFocus.current = document.activeElement
    } else {
      setQuery('')
      // Restore focus after the palette closes
      requestAnimationFrame(() => {
        if (prevFocus.current && typeof prevFocus.current.focus === 'function') {
          prevFocus.current.focus()
        }
      })
    }
  }, [open])

  const handleClose = useCallback(() => setOpen(false), [])

  const handleSelect = useCallback((command) => {
    navigate(command.route)
    handleClose()
  }, [navigate, handleClose])

  if (!open) return null

  return createPortal(
    <div
      className={styles.cpOverlay}
      onClick={handleClose}
      role="presentation"
    >
      <CommandPalette
        query={query}
        onQuery={setQuery}
        onSelect={handleSelect}
        onClose={handleClose}
      />
    </div>,
    document.body,
  )
}
