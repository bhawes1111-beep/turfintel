import styles from './StatusBoard.module.css'

/**
 * StatusBoard — shared operational stat-row primitive (Phase 3.1).
 *
 * Compound API:
 *   <StatusBoard columns={4}>
 *     <StatusBoard.Tile value={15} label="Active"            tone="ok" />
 *     <StatusBoard.Tile value={2}  label="In Service"        tone="info" />
 *     <StatusBoard.Tile value={3}  label="Needs Maintenance" tone="warn" />
 *     <StatusBoard.Tile value={0}  label="Out of Service"    tone="critical" />
 *   </StatusBoard>
 *
 * Layout:
 *   columns = 'auto' | 3 | 4 | 5 | 6   (default 'auto')
 *   Mobile collapses every column count to 2-column.
 *
 * Tones:
 *   'ok' | 'info' | 'warn' | 'critical' | 'neutral'
 *
 * Tiles are read-only by default. Pass `onClick` to make a tile actionable;
 * it then renders as a <button> with a hover state and may be marked
 * `active` to indicate selection (e.g. when driving a filter).
 *
 * Intentional non-goals: no charts, no spark lines, no trend arrows, no
 * drill-down behavior, no internal state. Operational status surface only.
 */
export default function StatusBoard({ columns = 'auto', children }) {
  const columnsClass =
    columns === 'auto' ? styles.boardAuto
    : columns === 3    ? styles.board3
    : columns === 4    ? styles.board4
    : columns === 5    ? styles.board5
    : columns === 6    ? styles.board6
    : styles.boardAuto

  return (
    <div className={`${styles.board} ${columnsClass}`} role="group">
      {children}
    </div>
  )
}

const TONE_CLASS = {
  ok:       styles.toneOk,
  info:     styles.toneInfo,
  warn:     styles.toneWarn,
  critical: styles.toneCritical,
  neutral:  styles.toneNeutral,
}

function Tile({ value, label, sub, tone = 'neutral', onClick, active, ariaLabel }) {
  const toneClass = TONE_CLASS[tone] ?? styles.toneNeutral
  const classes = [
    styles.tile,
    toneClass,
    active ? styles.active : '',
  ].filter(Boolean).join(' ')

  const content = (
    <>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
      {sub && <span className={styles.sub}>{sub}</span>}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        aria-pressed={active ? 'true' : undefined}
        aria-label={ariaLabel}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={classes} aria-label={ariaLabel}>
      {content}
    </div>
  )
}

StatusBoard.Tile = Tile
