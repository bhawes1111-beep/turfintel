import styles from './activity.module.css'

const MODULE_OPTIONS = [
  { value: 'All',        label: 'All'        },
  { value: 'spray',      label: 'Spray'      },
  { value: 'irrigation', label: 'Irrigation' },
  { value: 'equipment',  label: 'Equipment'  },
  { value: 'alerts',     label: 'Alerts'     },
]

const SEVERITY_OPTIONS = [
  { value: 'All',      label: 'All'      },
  { value: 'critical', label: 'Critical' },
  { value: 'warning',  label: 'Warning'  },
  { value: 'caution',  label: 'Caution'  },
  { value: 'info',     label: 'Info'     },
  { value: 'good',     label: 'Good'     },
]

const DATE_OPTIONS = ['All Time', 'Today', 'This Week', 'This Month']

export default function ActivityFilters({ filters, onChange }) {
  return (
    <div className={styles.acFilters}>

      <div className={styles.acFilterGroup}>
        <span className={styles.acFilterLabel}>Module</span>
        <div className={styles.acFilterRow}>
          {MODULE_OPTIONS.map(o => (
            <button
              key={o.value}
              className={`${styles.acFilterBtn} ${filters.module === o.value ? styles.acFilterBtnActive : ''}`}
              onClick={() => onChange({ ...filters, module: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.acFilterGroup}>
        <span className={styles.acFilterLabel}>Date</span>
        <div className={styles.acFilterRow}>
          {DATE_OPTIONS.map(r => (
            <button
              key={r}
              className={`${styles.acFilterBtn} ${filters.dateRange === r ? styles.acFilterBtnActive : ''}`}
              onClick={() => onChange({ ...filters, dateRange: r })}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.acFilterGroup}>
        <span className={styles.acFilterLabel}>Severity</span>
        <div className={styles.acFilterRow}>
          {SEVERITY_OPTIONS.map(o => (
            <button
              key={o.value}
              className={`${styles.acFilterBtn} ${filters.severity === o.value ? styles.acFilterBtnActive : ''}`}
              onClick={() => onChange({ ...filters, severity: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <label className={styles.acToggle}>
        <input
          type="checkbox"
          checked={filters.hasAttachments}
          onChange={e => onChange({ ...filters, hasAttachments: e.target.checked })}
        />
        <span>Has Attachments</span>
      </label>

    </div>
  )
}
