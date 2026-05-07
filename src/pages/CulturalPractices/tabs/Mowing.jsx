import { useState } from 'react'
import styles from '../CulturalPractices.module.css'
import { MOWING_SETTINGS, MOWING_LOG } from '../../../data/culturalPractices'

export default function Mowing() {
  const [showLog, setShowLog] = useState(false)

  return (
    <div>
      <div className={styles.mowingSettingsGrid}>
        {MOWING_SETTINGS.map(s => (
          <div key={s.id} className={styles.mowingCard}>
            <div>
              <div className={styles.mowingCardTitle}>{s.area}</div>
              <div className={styles.mowingTurf}>{s.turf}</div>
            </div>

            <div className={styles.hocDisplay}>
              <span className={styles.hocValue}>{s.currentHOC}</span>
              <span className={styles.hocLabel}>current HOC</span>
            </div>

            <div className={styles.mowingDetailGrid}>
              <div className={styles.specBox}>
                <div className={styles.specLabel}>Summer HOC</div>
                <div className={styles.specValue}>{s.summerHOC}</div>
              </div>
              <div className={styles.specBox}>
                <div className={styles.specLabel}>Winter HOC</div>
                <div className={styles.specValue}>{s.winterHOC}</div>
              </div>
              <div className={styles.specBox}>
                <div className={styles.specLabel}>Frequency</div>
                <div className={styles.specValue} style={{ fontSize: 11 }}>{s.frequency}</div>
              </div>
              <div className={styles.specBox}>
                <div className={styles.specLabel}>Clip Removal</div>
                <div className={styles.specValue} style={{ fontSize: 11 }}>{s.clipRemoval}</div>
              </div>
              <div className={styles.specBox} style={{ gridColumn: '1 / -1' }}>
                <div className={styles.specLabel}>Equipment</div>
                <div className={styles.specValue} style={{ fontSize: 11 }}>{s.equipment}</div>
              </div>
              <div className={styles.specBox} style={{ gridColumn: '1 / -1' }}>
                <div className={styles.specLabel}>Clipping Yield</div>
                <div className={styles.specValue} style={{ fontSize: 11 }}>{s.clippingYield}</div>
              </div>
              <div className={styles.specBox} style={{ gridColumn: '1 / -1' }}>
                <div className={styles.specLabel}>Mowing Pattern</div>
                <div className={styles.specValue} style={{ fontSize: 11 }}>{s.pattern}</div>
              </div>
            </div>

            {s.notes && (
              <div className={styles.eventNotes}>{s.notes}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className={styles.sectionTitle} style={{ margin: 0 }}>Recent Mowing Log</div>
        <button
          onClick={() => setShowLog(v => !v)}
          style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)', background: 'var(--color-card)',
            color: 'var(--color-text-muted)', cursor: 'pointer',
          }}
        >
          {showLog ? 'Hide' : 'Show'} Log
        </button>
      </div>

      {showLog && (
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.rollingTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Area</th>
                <th>HOC</th>
                <th>Equipment</th>
                <th>Operator</th>
                <th>Clippings</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {MOWING_LOG.map(row => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>{row.area}</td>
                  <td>{row.hoc}</td>
                  <td>{row.equipment}</td>
                  <td>{row.operator}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{row.clippings}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{row.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
