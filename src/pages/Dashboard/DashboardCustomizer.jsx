import { DASHBOARD_MODULES } from '../../utils/dashboard/dashboardPreferences'
import styles from './DashboardCustomizer.module.css'

export default function DashboardCustomizer({ layout, syncState, onChange, onReset, onClose }) {
  const modulesById = new Map(DASHBOARD_MODULES.map(item => [item.id, item]))
  const ordered = layout.order.map(id => modulesById.get(id)).filter(Boolean)
  const hidden = new Set(layout.hidden)

  function toggle(id) {
    const nextHidden = hidden.has(id)
      ? layout.hidden.filter(value => value !== id)
      : [...layout.hidden, id]
    onChange({ ...layout, hidden: nextHidden })
  }

  function move(id, direction) {
    const index = layout.order.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= layout.order.length) return
    const order = [...layout.order]
    ;[order[index], order[target]] = [order[target], order[index]]
    onChange({ ...layout, order })
  }

  return (
    <section className={styles.panel} aria-label="Customize dashboard">
      <div className={styles.header}>
        <div>
          <h2>Customize dashboard</h2>
          <p>Choose what appears and set the order for this course.</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.syncState}>{syncState === 'synced' ? 'Saved to cloud' : syncState === 'local' ? 'Saved on this device' : syncState === 'saving' ? 'Saving' : 'Loading'}</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close dashboard customization">Close</button>
        </div>
      </div>

      <div className={styles.moduleList}>
        {ordered.map((item, index) => (
          <div key={item.id} className={styles.moduleRow}>
            <label className={styles.visibilityControl}>
              <input type="checkbox" checked={!hidden.has(item.id)} onChange={() => toggle(item.id)} />
              <span>{item.label}</span>
            </label>
            <div className={styles.orderControls}>
              <button type="button" onClick={() => move(item.id, -1)} disabled={index === 0} aria-label={`Move ${item.label} up`}>Up</button>
              <button type="button" onClick={() => move(item.id, 1)} disabled={index === ordered.length - 1} aria-label={`Move ${item.label} down`}>Down</button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.resetButton} onClick={onReset}>Reset default layout</button>
      </div>
    </section>
  )
}
