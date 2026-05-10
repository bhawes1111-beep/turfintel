// Reusable dashboard card with drag-to-resize handles in customize mode.
// Size is driven by a `size` prop: 'default' | 'small' | 'wide' | 'tall' | 'full' | 'wide-tall'.
// Legacy boolean props (wide/tall/full) still work for callers that haven't migrated.

import { useRef, useState } from 'react'
import { decomposeSize, recomposeSize } from '../../utils/dashboard/useDashboardPrefs'
import styles from './DashboardCard.module.css'

const SIZE_CLASS = {
  'default':    '',
  'small':      'small',
  'wide':       'wide',
  'tall':       'tall',
  'full':       'full',
  'wide-tall':  'wideTall',
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export default function DashboardCard({
  title,
  children,
  size,
  wide = false,
  tall = false,
  full = false,
  className = '',
  // Drag-resize props (set by Dashboard.jsx in customize mode)
  customizing  = false,
  cardKey      = null,
  onResize     = null,
  maxCols      = 3,
}) {
  // ── Resolve effective size ────────────────────────────────────────────────
  let resolved = size
  if (!resolved) {
    if (wide && tall) resolved = 'wide-tall'
    else if (full)    resolved = 'full'
    else if (wide)    resolved = 'wide'
    else if (tall)    resolved = 'tall'
    else              resolved = 'default'
  }

  // ── Drag state ────────────────────────────────────────────────────────────
  const cardRef       = useRef(null)
  const dragStateRef  = useRef(null)
  const [previewSize, setPreviewSize] = useState(null)
  const [dragging,    setDragging]    = useState(false)

  // The visually-applied size: preview wins over prop while dragging.
  const effectiveSize = previewSize ?? resolved
  const sizeClass     = styles[SIZE_CLASS[effectiveSize]] ?? ''

  const canResize = customizing && cardKey && onResize

  // ── Pointer handlers ──────────────────────────────────────────────────────
  function startResize(e, axis) {
    if (!canResize) return
    e.preventDefault()
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)

    const cardEl  = cardRef.current
    const gridEl  = cardEl.parentElement
    const cardR   = cardEl.getBoundingClientRect()
    const gridR   = gridEl.getBoundingClientRect()
    const gStyle  = getComputedStyle(gridEl)
    const gap     = parseFloat(gStyle.columnGap || gStyle.gap || '0') || 0
    const colWidth = (gridR.width - (maxCols - 1) * gap) / maxCols

    // Read density-driven CSS vars from the .page element (where data-density lives).
    const pageEl  = cardEl.closest('[data-density]') || document.body
    const pStyle  = getComputedStyle(pageEl)
    const minH    = parseFloat(pStyle.getPropertyValue('--card-min-height'))  || 140
    const tallH   = parseFloat(pStyle.getPropertyValue('--card-tall-height')) || 280
    const heightThreshold = (minH + tallH) / 2

    const { cols: initCols, isTall: initIsTall } = decomposeSize(resolved)

    dragStateRef.current = {
      axis,
      startCardLeft: cardR.left,
      startCardTop:  cardR.top,
      colWidth,
      heightThreshold,
      initialCols:   initCols,
      initialIsTall: initIsTall,
      maxCols,
    }
    setDragging(true)
  }

  function onPointerMove(e) {
    const s = dragStateRef.current
    if (!s) return

    let cols   = s.initialCols
    let isTall = s.initialIsTall

    if (s.axis === 'width' || s.axis === 'both') {
      const proposedW = e.clientX - s.startCardLeft
      cols = Math.round(proposedW / s.colWidth)
      cols = clamp(cols, 1, s.maxCols)
    }

    if (s.axis === 'height' || s.axis === 'both') {
      const proposedH = e.clientY - s.startCardTop
      isTall = proposedH > s.heightThreshold
    }

    const next = recomposeSize(cols, isTall)
    if (next !== previewSize) setPreviewSize(next)
  }

  function endResize(e) {
    const s = dragStateRef.current
    if (!s) return
    try { e.target.releasePointerCapture(e.pointerId) } catch { /* already released */ }

    if (previewSize && previewSize !== resolved) {
      onResize(cardKey, previewSize)
    }
    setPreviewSize(null)
    setDragging(false)
    dragStateRef.current = null
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const classes = [
    styles.card,
    sizeClass,
    canResize  ? styles.customizable : '',
    dragging   ? styles.dragging      : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={cardRef}
      className={classes}
      data-customizing={canResize ? 'true' : undefined}
    >
      {title && <p className={styles.cardTitle}>{title}</p>}
      <div className={styles.cardBody}>
        {children}
      </div>

      {canResize && (
        <>
          <div
            className={styles.handleRight}
            onPointerDown={e => startResize(e, 'width')}
            onPointerMove={onPointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label="Resize width"
          />
          <div
            className={styles.handleBottom}
            onPointerDown={e => startResize(e, 'height')}
            onPointerMove={onPointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label="Resize height"
          />
          <div
            className={styles.handleCorner}
            onPointerDown={e => startResize(e, 'both')}
            onPointerMove={onPointerMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-label="Resize width and height"
          />
        </>
      )}
    </div>
  )
}
