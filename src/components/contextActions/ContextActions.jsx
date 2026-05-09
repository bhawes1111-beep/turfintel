import { useState } from 'react'
import styles from './contextActions.module.css'

export default function ContextActions({ actions, hovered }) {
  const [focused,    setFocused]    = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const visible = hovered || focused

  return (
    <div
      className={styles.caWrap}
      onClick={e => e.stopPropagation()}
      onFocus={() => setFocused(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false) }}
    >
      <div className={`${styles.caActions} ${visible ? styles.caActionsVisible : ''}`}>
        {actions.map(action => (
          <button
            key={action.id}
            className={[
              styles.caBtn,
              action.variant === 'green'  ? styles.caBtnGreen  : '',
              action.variant === 'muted'  ? styles.caBtnMuted  : '',
              action.variant === 'danger' ? styles.caBtnDanger : '',
            ].filter(Boolean).join(' ')}
            style={action.style}
            onClick={action.onClick}
            title={action.title}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        ))}
      </div>

      <button
        className={styles.caOverflowBtn}
        onClick={e => { e.stopPropagation(); setMobileOpen(o => !o) }}
        aria-label="More actions"
      >
        ⋮
      </button>

      {mobileOpen && (
        <div className={styles.caDropdown}>
          {actions.map(action => (
            <button
              key={action.id}
              className={styles.caDropdownItem}
              disabled={action.disabled}
              onClick={e => { action.onClick(e); setMobileOpen(false) }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
