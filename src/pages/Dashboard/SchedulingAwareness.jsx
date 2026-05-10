import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOperations } from '../../utils/operations/OperationsContext'
import { useEquipmentData } from '../../utils/equipment/equipmentStore'
import { buildAwarenessGroups } from '../../utils/intelligence/schedulingAwareness'
import { SEVERITY_TOKENS } from '../../utils/intelligence/severity'
import styles from './SchedulingAwareness.module.css'

export default function SchedulingAwareness() {
  const { state }                  = useOperations()
  const { equipment, serviceLog }  = useEquipmentData()
  const navigate                   = useNavigate()

  const groups = useMemo(
    () => buildAwarenessGroups(state, {
      equipment,
      serviceLog,
      repairOverrides: state.repairOverrides,
    }),
    [state, state.calendarEvents, equipment, serviceLog, state.repairOverrides],
  )

  if (groups.length === 0) {
    return (
      <p className={styles.saEmpty}>No scheduling concerns detected — all clear</p>
    )
  }

  return (
    <div className={styles.saWrap}>
      <div className={styles.saGroups}>
        {groups.map(group => (
          <div key={group.id} className={styles.saGroup}>
            <div className={styles.saGroupLabel}>
              <span className={styles.saGroupIcon}>{group.icon}</span>
              {group.label}
            </div>
            <div className={styles.saItems}>
              {group.items.map(item => {
                const meta = SEVERITY_TOKENS[item.severity] ?? SEVERITY_TOKENS.info
                const Tag  = item.route ? 'button' : 'div'
                return (
                  <Tag
                    key={item.id}
                    className={`${styles.saItem}${item.route ? ` ${styles.saItemClickable}` : ''}`}
                    onClick={item.route ? () => navigate(item.route) : undefined}
                  >
                    <span
                      className={styles.saDot}
                      style={{ background: meta.color }}
                      title={item.severity}
                    />
                    <span className={styles.saItemIcon}>{item.icon}</span>
                    <span className={styles.saItemText}>{item.text}</span>
                  </Tag>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
