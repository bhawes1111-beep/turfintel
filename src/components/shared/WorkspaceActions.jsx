/**
 * WorkspaceActions — flex row for action buttons inside a workspace.
 *
 * Use in PageShell.actions slot or inside a WorkspaceSection's actions slot
 * to keep horizontal action layouts consistent across the app.
 */

import styles from '../../styles/workspace.module.css'

export default function WorkspaceActions({ children, align = 'left', className = '' }) {
  const classes = [
    styles.workspaceActions,
    align === 'right' ? styles.workspaceActionsRight : '',
    className,
  ].filter(Boolean).join(' ')

  return <div className={classes}>{children}</div>
}
