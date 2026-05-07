import styles from '../Spray.module.css'

const REPORTS = [
  {
    id: 1,
    title: 'YTD Spray Summary',
    desc: 'Total applications by product type, area, and month. Includes application count and product volume used year-to-date.',
  },
  {
    id: 2,
    title: 'Product Usage Log',
    desc: 'Full list of products applied, quantities used, and remaining inventory. Cross-references chemical label data.',
  },
  {
    id: 3,
    title: 'Cost Per Application',
    desc: 'Breakdown of chemical cost per 1,000 sq ft by area and application type for the current season.',
  },
  {
    id: 4,
    title: 'Applicator Log',
    desc: 'All spray events grouped by applicator with total hours, products handled, and areas covered.',
  },
  {
    id: 5,
    title: 'FRAC/HRAC Rotation Report',
    desc: 'Resistance management audit showing which mode-of-action groups have been applied and rotation intervals.',
  },
  {
    id: 6,
    title: 'Weather Conditions Log',
    desc: 'Historical weather data recorded at time of each application — temperature, wind, humidity, and spray window compliance.',
  },
]

export default function SprayReports() {
  return (
    <div className={styles.tabContent}>
      <div className={styles.reportsGrid}>
        {REPORTS.map(r => (
          <div key={r.id} className={styles.reportCard}>
            <p className={styles.reportTitle}>{r.title}</p>
            <p className={styles.reportDesc}>{r.desc}</p>
            <button
              className={styles.reportBtn}
              onClick={() => {/* report generation — coming soon */}}
            >
              Generate →
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
