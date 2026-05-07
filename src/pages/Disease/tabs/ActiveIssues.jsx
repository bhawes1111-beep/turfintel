import { useState, useMemo } from 'react'
import styles from '../Disease.module.css'
import { ACTIVE_ISSUES } from '../../../data/disease'

const STATUS_ORDER = { active: 0, monitoring: 1, resolved: 2 }

export default function ActiveIssues() {
  const [filter, setFilter] = useState('all')

  const issues = useMemo(() => {
    const filtered = filter === 'all' ? ACTIVE_ISSUES : ACTIVE_ISSUES.filter(i => i.status === filter || i.severity === filter)
    return [...filtered].sort((a, b) => {
      const sevOrder = { high: 0, medium: 1, low: 2 }
      return sevOrder[a.severity] - sevOrder[b.severity] || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    })
  }, [filter])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'active', 'monitoring', 'resolved', 'high', 'medium', 'low'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: filter === f ? 'var(--color-accent)' : 'var(--color-card)',
              color: filter === f ? '#fff' : 'var(--color-text-muted)',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div className={styles.issueGrid}>
        {issues.map(issue => (
          <div key={issue.id} className={`${styles.issueCard} ${styles[issue.severity]}`}>
            <div className={styles.issueHeader}>
              <div>
                <div className={styles.issueName}>{issue.name}</div>
                <div className={styles.issuePathogen}>{issue.pathogen}</div>
              </div>
              <div className={styles.issueBadges}>
                <span className={`${styles.severityBadge} ${styles['severity' + issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)]}`}>
                  {issue.severity}
                </span>
                <span className={`${styles.statusBadge} ${styles[issue.status]}`}>
                  {issue.status}
                </span>
              </div>
            </div>

            <div className={styles.issueMeta}>
              <span><strong>Area</strong>{issue.area}</span>
              <span><strong>Turf</strong>{issue.turf}</span>
              <span><strong>First Seen</strong>{issue.firstSeen}</span>
              <span><strong>Updated</strong>{issue.lastUpdated}</span>
            </div>

            <div className={styles.issueConditions}>
              <strong style={{ color: 'var(--color-text)', fontWeight: 500 }}>Conditions: </strong>
              {issue.conditions}
            </div>

            <div className={styles.issueAction}>
              <div className={styles.issueActionLabel}>Recommended Action</div>
              {issue.action}
            </div>

            {issue.photos > 0 && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                📷 {issue.photos} photo{issue.photos > 1 ? 's' : ''} attached
              </div>
            )}
          </div>
        ))}
      </div>

      {issues.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No issues match this filter.</p>
      )}
    </div>
  )
}
