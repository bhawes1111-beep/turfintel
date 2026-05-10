import styles from '../PlantNutrition.module.css'
import { WATER_REPORTS } from '../../../data/plantNutrition'
import { EmptyState } from '../../../components/shared/EmptyState'

function statusClass(status, s) {
  if (status === 'low')  return s.statusLow
  if (status === 'high') return s.statusHigh
  return s.statusOk
}

function riskClass(risk, s) {
  if (risk === 'high')   return s.riskHigh
  if (risk === 'medium') return s.riskMedium
  return s.riskLow
}

const PARAMS = [
  { key: 'ph',    label: 'pH' },
  { key: 'ec',    label: 'EC' },
  { key: 'sar',   label: 'SAR (Sodium Adsorption Ratio)' },
  { key: 'na',    label: 'Sodium (Na)' },
  { key: 'ca',    label: 'Calcium (Ca)' },
  { key: 'mg',    label: 'Magnesium (Mg)' },
  { key: 'hco3',  label: 'Bicarbonates (HCO₃)' },
  { key: 'co3',   label: 'Carbonates (CO₃)' },
  { key: 'cl',    label: 'Chloride (Cl)' },
  { key: 'b',     label: 'Boron (B)' },
  { key: 'hardness', label: 'Total Hardness' },
]

export default function WaterReports() {
  if (WATER_REPORTS.length === 0) {
    return (
      <div>
        <EmptyState
          title="No water reports uploaded yet."
          description="Upload irrigation water lab reports to monitor pH, EC, and SAR."
        />
      </div>
    )
  }
  return (
    <div>
      {WATER_REPORTS.map(report => (
        <div key={report.id} className={styles.reportCard}>
          <div className={styles.reportCardHeader}>
            <div>
              <div className={styles.reportAreaName}>{report.source}</div>
              <div className={styles.reportMeta}>
                {report.lab} · {report.date}
              </div>
            </div>
            <div className={styles.reportHeaderRight}>
              <span className={`${styles.riskBadge} ${riskClass(report.overallRisk, styles)}`}>
                {report.overallRisk} risk
              </span>
              <button className={styles.uploadBtn}>+ Upload New</button>
            </div>
          </div>

          <div>
            {PARAMS.map(({ key, label }) => {
              const param = report[key]
              if (!param) return null
              return (
                <div key={key} className={styles.waterParamRow}>
                  <span className={styles.waterParamName}>{label}</span>
                  <span className={styles.waterParamValue}>
                    {param.value}{param.unit ? ` ${param.unit}` : ''}
                  </span>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    {param.status && (
                      <span className={`${styles.statusBadge} ${statusClass(param.status, styles)}`}>
                        {param.status}
                      </span>
                    )}
                    {param.risk && (
                      <span className={`${styles.riskBadge} ${riskClass(param.risk, styles)}`}>
                        {param.risk} risk
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            <div className={styles.overallRiskRow}>
              <span>Overall Water Quality Risk</span>
              <span className={`${styles.riskBadge} ${riskClass(report.overallRisk, styles)}`}>
                {report.overallRisk}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
