import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSpraysData } from '../../utils/sprays/spraysStore'
import { useWeather } from '../../utils/weather/useWeather'
import { useImportedLabels } from '../../utils/inventory/labelImportStore'
import { computeSprayWindowIntel, rateSprayDate } from '../../utils/sprayWindow/sprayWindowIntel'
import styles from './ApplicationTimingCoverage.module.css'

const DAY_MS = 24 * 60 * 60 * 1000

function localDate(value = new Date()) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateAtMidnight(value) {
  const parsed = Date.parse(`${value}T00:00:00`)
  return Number.isFinite(parsed) ? parsed : null
}

function fmtDate(value) {
  const parsed = dateAtMidnight(value)
  if (parsed == null) return value || '-'
  return new Date(parsed).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function applicationType(record) {
  return record?.applicationType === 'granular' ? 'Granular' : 'Liquid'
}

function productsLabel(record) {
  const names = [...new Set((record?.products ?? []).map(product => product?.name).filter(Boolean))]
  return names.length ? names.join(', ') : 'Products not selected'
}

function acreageFor(record) {
  return (record?.areas ?? []).reduce((sum, area) => sum + (Number(area?.acreage) || 0), 0)
}

function toneFromRating(rating) {
  if (!rating) return 'unknown'
  if (rating.color === 'green') return 'good'
  if (rating.color === 'yellow') return 'caution'
  if (rating.color === 'red') return 'poor'
  return 'unknown'
}

function windowLabel(rating) {
  if (!rating) return 'Forecast unavailable'
  if (rating.color === 'green') return 'Favorable window'
  if (rating.color === 'yellow') return 'Use caution'
  if (rating.color === 'red') return 'Poor window'
  return 'Forecast unavailable'
}

export default function ApplicationTimingCoverage() {
  const navigate = useNavigate()
  const { records = [] } = useSpraysData()
  const { current, forecast, loading } = useWeather()
  const { labels = [] } = useImportedLabels()

  const model = useMemo(() => {
    const today = localDate()
    const start = dateAtMidnight(today)
    const end = start + (14 * DAY_MS)
    const historyStart = start - (30 * DAY_MS)
    const active = records.filter(record => !record?.deletedAt)
    const upcoming = active
      .filter(record => record.status === 'planned')
      .filter(record => {
        const date = dateAtMidnight(record.date)
        return date != null && date >= start && date < end
      })
      .sort((a, b) => `${a.date}|${a.startTime ?? ''}`.localeCompare(`${b.date}|${b.startTime ?? ''}`))

    const completed = active.filter(record => {
      const date = dateAtMidnight(record.date)
      return record.status === 'completed' && date != null && date >= historyStart && date <= start
    })

    const coverage = new Map()
    for (const record of completed) {
      const names = (record.areas ?? []).map(area => area?.name).filter(Boolean)
      if (names.length === 0 && record.area) names.push(record.area)
      for (const name of names) {
        const currentRow = coverage.get(name) ?? { name, count: 0, latest: '', liquid: 0, granular: 0 }
        currentRow.count += 1
        currentRow.latest = currentRow.latest > record.date ? currentRow.latest : record.date
        if (record.applicationType === 'granular') currentRow.granular += 1
        else currentRow.liquid += 1
        coverage.set(name, currentRow)
      }
    }

    const intel = computeSprayWindowIntel({ current, forecast, sprays: active, labels })
    return {
      upcoming,
      coverage: [...coverage.values()].sort((a, b) => b.latest.localeCompare(a.latest)).slice(0, 8),
      currentWindow: intel.current,
      nextIdeal: intel.nextIdeal,
      plannedAcres: upcoming.reduce((sum, record) => sum + acreageFor(record), 0),
      plannedAreas: new Set(upcoming.flatMap(record => {
        const names = (record.areas ?? []).map(area => area?.name).filter(Boolean)
        if (names.length) return names
        return [record.areaName, record.area, record.location].filter(Boolean)
      })).size,
    }
  }, [records, current, forecast, labels])

  return (
    <section className={styles.wrap} aria-label="Application timing and coverage">
      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Right now</span>
          <strong className={styles.summaryValue} data-tone={model.currentWindow.rating}>
            {loading
              ? 'Checking'
              : model.currentWindow.rating === 'ideal'
                ? 'Favorable'
                : model.currentWindow.rating
                  ? `${model.currentWindow.rating.charAt(0).toUpperCase()}${model.currentWindow.rating.slice(1)}`
                  : 'Unknown'}
          </strong>
          <span className={styles.summaryMeta}>
            {current?.wind != null ? `${current.wind} mph wind` : 'Wind unavailable'}
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Next best day</span>
          <strong className={styles.summaryValue}>{model.nextIdeal ? fmtDate(model.nextIdeal.date) : 'No ideal day'}</strong>
          <span className={styles.summaryMeta}>Current forecast</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Planned, 14 days</span>
          <strong className={styles.summaryValue}>{model.upcoming.length}</strong>
          <span className={styles.summaryMeta}>{model.plannedAreas} areas</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Planned coverage</span>
          <strong className={styles.summaryValue}>{model.plannedAcres > 0 ? `${Number(model.plannedAcres.toFixed(2))} ac` : '-'}</strong>
          <span className={styles.summaryMeta}>Known acreage</span>
        </div>
      </div>

      <div className={styles.columns}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Application timing</h3>
              <p>Planned liquid and granular work for the next 14 days.</p>
            </div>
            <button type="button" className={styles.linkButton} onClick={() => navigate('/spray')}>Applications</button>
          </div>
          {model.upcoming.length === 0 ? (
            <p className={styles.empty}>No planned applications in the next 14 days.</p>
          ) : (
            <div className={styles.timingList}>
              {model.upcoming.slice(0, 6).map(record => {
                const rating = rateSprayDate(record.date, forecast)
                const tone = toneFromRating(rating)
                return (
                  <button key={record.id} type="button" className={styles.timingRow} onClick={() => navigate('/spray')}>
                    <span className={styles.dateBlock}>
                      <strong>{fmtDate(record.date)}</strong>
                      <span>{record.startTime || 'Time not set'}</span>
                    </span>
                    <span className={styles.applicationBlock}>
                      <span className={styles.titleLine}>
                        <strong>{record.area || record.applicationName || 'Application'}</strong>
                        <span className={styles.typeBadge}>{applicationType(record)}</span>
                      </span>
                      <span className={styles.products}>{productsLabel(record)}</span>
                    </span>
                    <span className={styles.windowBadge} data-tone={tone} title={rating?.reasons?.map(reason => reason.why).join(' | ') || ''}>
                      {windowLabel(rating)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Recent area coverage</h3>
              <p>Completed applications by area during the last 30 days.</p>
            </div>
          </div>
          {model.coverage.length === 0 ? (
            <p className={styles.empty}>No completed area coverage in the last 30 days.</p>
          ) : (
            <div className={styles.coverageList}>
              {model.coverage.map(row => (
                <div key={row.name} className={styles.coverageRow}>
                  <span className={styles.coverageArea}>
                    <strong>{row.name}</strong>
                    <span>Last treated {fmtDate(row.latest)}</span>
                  </span>
                  <span className={styles.coverageMix}>
                    {row.liquid > 0 && <span>{row.liquid} liquid</span>}
                    {row.granular > 0 && <span>{row.granular} granular</span>}
                  </span>
                  <strong className={styles.coverageCount}>{row.count}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
