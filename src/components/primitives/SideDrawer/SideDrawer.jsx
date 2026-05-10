import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './SideDrawer.module.css'

/**
 * SideDrawer — right-anchored operational drawer primitive (Phase 3.0a).
 *
 * One drawer is open at a time per consumer. Owns its layering, backdrop,
 * Escape handling, click-outside, body scroll lock, and focus restoration.
 * No internal open/close state — fully controlled by the consumer.
 *
 * Compound API:
 *   <SideDrawer open onClose ...>
 *     <SideDrawer.Header title="..." subtitle="..." status={...} onClose={...} />
 *     <SideDrawer.Body>...</SideDrawer.Body>
 *     <SideDrawer.Footer>...</SideDrawer.Footer>
 *   </SideDrawer>
 *
 * Modes:
 *   mode="overlay" (default) — overlays the page with a click-to-close backdrop.
 *   mode="push"              — reserved for future Operations Panel migration.
 *                              Falls back to overlay in Phase 3.0a.
 *
 * Visual rule: behavior parity first, visual restraint everywhere. No
 * gradients or animations beyond a single slide-in transform.
 */
export default function SideDrawer({
  open,
  onClose,
  mode = 'overlay',
  accentColor,
  ariaLabel,
  children,
}) {
  const panelRef           = useRef(null)
  const previousFocusRef   = useRef(null)
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)

  // ── Mount / unmount lifecycle with transition ──────────────────────────
  // Keep the drawer mounted briefly after `open` flips false so the
  // close transition can play.
  useEffect(() => {
    if (open) {
      setMounted(true)
      const id = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(id)
    }
    setEntered(false)
    const id = setTimeout(() => setMounted(false), 200)
    return () => clearTimeout(id)
  }, [open])

  // ── Escape key close ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = e => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // ── Body scroll lock while drawer is open ───────────────────────────────
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  // ── Focus handling: capture on open, restore on close ──────────────────
  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement
    const id = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable) focusable.focus()
      else panel.focus()
    })
    return () => {
      cancelAnimationFrame(id)
      const previous = previousFocusRef.current
      if (previous && typeof previous.focus === 'function') previous.focus()
    }
  }, [open])

  if (!mounted) return null

  const backdropClick = () => onClose?.()
  const stopPropagation = e => e.stopPropagation()

  return createPortal(
    <>
      <div
        className={styles.backdrop}
        onClick={backdropClick}
        aria-hidden="true"
        data-mode={mode}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`${styles.panel} ${entered ? styles.panelOpen : ''}`}
        onClick={stopPropagation}
        data-mode={mode}
      >
        {accentColor && (
          <span
            className={styles.accent}
            style={{ background: accentColor }}
            aria-hidden="true"
          />
        )}
        {children}
      </aside>
    </>,
    document.body,
  )
}

function Header({ title, subtitle, status, onClose, children }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        {title && <h2 className={styles.title}>{title}</h2>}
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
      <div className={styles.headerRight}>
        {status}
        {onClose && (
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>
    </header>
  )
}

function Body({ children }) {
  return <div className={styles.body}>{children}</div>
}

function Footer({ children }) {
  return <div className={styles.footer}>{children}</div>
}

SideDrawer.Header = Header
SideDrawer.Body   = Body
SideDrawer.Footer = Footer
