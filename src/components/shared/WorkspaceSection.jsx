/**
 * WorkspaceSection — convenience wrapper around workspace.module.css.
 *
 * Renders a standard workspace block:
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Title              │  actions (optional, top-right) │
 *   │ subtitle (optional)                                 │
 *   ├─────────────────────────────────────────────────────┤
 *   │ filters (optional row)                              │
 *   ├─────────────────────────────────────────────────────┤
 *   │ children (content)                                  │
 *   └─────────────────────────────────────────────────────┘
 *
 * Use this inside any tab body that wants standard rhythm. Tabs can also
 * skip the wrapper and apply workspace.module.css classes directly.
 */

import styles from '../../styles/workspace.module.css'

export default function WorkspaceSection({
  title,
  subtitle,
  actions,
  filters,
  className = '',
  children,
}) {
  const hasHeader = !!(title || actions)

  return (
    <section className={[styles.workspaceSection, className].filter(Boolean).join(' ')}>
      {hasHeader && (
        <div className={styles.workspaceSectionHeader}>
          {title && <h2 className={styles.workspaceSectionTitle}>{title}</h2>}
          {actions && (
            <div className={styles.workspaceSectionMeta}>{actions}</div>
          )}
        </div>
      )}
      {subtitle && <p className={styles.workspaceSectionSubtitle}>{subtitle}</p>}
      {filters && (
        <div className={styles.workspaceFilters}>{filters}</div>
      )}
      {children}
    </section>
  )
}
