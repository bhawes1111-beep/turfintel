import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSpraysData } from '../../utils/sprays/spraysStore'
import { buildSpraySummaryReport } from '../../utils/reports/reportBuilder'
import ReportPreviewModal from '../../components/reports/ReportPreviewModal'
import styles from './QuickActions.module.css'

export default function QuickActions() {
  const navigate = useNavigate()
  const { records: sprayRecords } = useSpraysData()
  const [activeReport, setActiveReport] = useState(null)

  // Normalize multi-product spray records for the report builder.
  const allSpray = useMemo(
    () => sprayRecords.map(r => ({
      ...r,
      product: r.products.map(p => p.name).join(' + '),
      rate:    r.products.map(p => p.rate).join(' / '),
    })),
    [sprayRecords],
  )

  function generateDailyReport() {
    const dateLabel = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
    setActiveReport(buildSpraySummaryReport(allSpray, {
      title:     'Daily Operations Summary',
      dateRange: dateLabel,
    }))
  }

  const ACTIONS = [
    {
      icon:  '🔧',
      label: 'New Irrigation Repair',
      title: 'Go to Irrigation Repairs',
      onClick: () => navigate('/irrigation'),
    },
    {
      icon:  '🌿',
      label: 'New Spray Record',
      title: 'Go to Spray Records',
      onClick: () => navigate('/spray'),
    },
    {
      icon:  '📋',
      label: 'Generate Daily Report',
      title: 'Build a summary report for today',
      onClick: generateDailyReport,
    },
    {
      icon:  '📸',
      label: 'Upload Photos',
      title: 'Go to Equipment for photo attachments',
      onClick: () => navigate('/equipment'),
    },
    {
      icon:  '🕐',
      label: 'Activity Feed',
      title: 'View unified activity timeline',
      onClick: () => navigate('/activity'),
    },
    {
      icon:  '🗓️',
      label: 'Operations Calendar',
      title: 'Go to Cultural Practices calendar',
      onClick: () => navigate('/cultural-practices'),
    },
  ]

  return (
    <>
      <div className={styles.qaGrid}>
        {ACTIONS.map(a => (
          <button
            key={a.label}
            className={styles.qaBtn}
            onClick={a.onClick}
            title={a.title}
          >
            <span className={styles.qaIcon}>{a.icon}</span>
            <span className={styles.qaLabel}>{a.label}</span>
          </button>
        ))}
      </div>

      <ReportPreviewModal
        report={activeReport}
        onClose={() => setActiveReport(null)}
      />
    </>
  )
}
