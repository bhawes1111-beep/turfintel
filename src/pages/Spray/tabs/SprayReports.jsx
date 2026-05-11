import { useState, useMemo } from 'react'
import { useSpraysData } from '../../../utils/sprays/spraysStore'
import { buildSpraySummaryReport } from '../../../utils/reports/reportBuilder'
import ReportPreviewModal from '../../../components/reports/ReportPreviewModal'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import styles from '../Spray.module.css'

export default function SprayReports() {
  const { records }                     = useSpraysData()
  const [activeReport, setActiveReport] = useState(null)

  // Flatten multi-product records to the shape buildSpraySummaryReport expects
  const flatRecords = useMemo(
    () => records.map(r => ({
      ...r,
      product: r.products.map(p => p.name).join(' + '),
      rate:    r.products.map(p => p.rate).join(' / '),
    })),
    [records],
  )

  const REPORT_DEFS = useMemo(() => [
    {
      id:    1,
      title: 'YTD Spray Summary',
      desc:  'Total applications by product type, area, and month. Includes application count and product volume used year-to-date.',
      build: () => buildSpraySummaryReport(flatRecords, {
        title:     'YTD Spray Summary',
        dateRange: '2026 Season',
      }),
    },
    {
      id:    2,
      title: 'Product Usage Log',
      desc:  'Full list of products applied, quantities used, and remaining inventory. Cross-references chemical label data.',
      build: () => buildSpraySummaryReport(flatRecords, {
        title: 'Product Usage Log',
      }),
    },
    {
      id:    3,
      title: 'Cost Per Application',
      desc:  'Breakdown of chemical cost per 1,000 sq ft by area and application type for the current season.',
      build: null,
    },
    {
      id:    4,
      title: 'Applicator Log',
      desc:  'All spray events grouped by applicator with total hours, products handled, and areas covered.',
      build: () => buildSpraySummaryReport(flatRecords, {
        title: 'Applicator Log — All Staff',
      }),
    },
    {
      id:    5,
      title: 'FRAC/HRAC Rotation Report',
      desc:  'Resistance management audit showing which mode-of-action groups have been applied and rotation intervals.',
      build: null,
    },
    {
      id:    6,
      title: 'Weather Conditions Log',
      desc:  'Historical weather data recorded at time of each application — temperature, wind, humidity, and spray window compliance.',
      build: null,
    },
  ], [flatRecords])

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Reports"
        subtitle="Generate spray summaries and audit reports."
      >
      <div className={styles.reportsGrid}>
        {REPORT_DEFS.map(r => (
          <div key={r.id} className={styles.reportCard}>
            <p className={styles.reportTitle}>{r.title}</p>
            <p className={styles.reportDesc}>{r.desc}</p>
            <button
              className={styles.reportBtn}
              onClick={() => r.build && setActiveReport(r.build())}
              disabled={!r.build}
              title={!r.build ? 'Coming soon — requires additional data' : undefined}
            >
              {r.build ? 'Generate →' : 'Coming Soon'}
            </button>
          </div>
        ))}
      </div>

      </WorkspaceSection>
      <ReportPreviewModal
        report={activeReport}
        onClose={() => setActiveReport(null)}
      />
    </div>
  )
}
