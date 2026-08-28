import { useMemo } from 'react'
import { nutrientLabel } from '../../utils/inventory/nutrientForms'
import { useInventoryData } from '../../utils/inventory/inventoryStore'
import { useSpraysData } from '../../utils/sprays/spraysStore'
import {
  SOIL_INTERPRETATION_SOURCE,
  TIFEAGLE_GUIDANCE_SOURCES,
  TIFEAGLE_NUTRIENT_GUIDANCE,
  benchmarkTissueResult,
  buildApplicationNutrientInputs,
  buildRecommendationProgress,
  buildSampleResultComparison,
  findNextNutrientSample,
  findPreviousNutrientSample,
  tissueBaselineProfile,
} from '../../utils/turfHealth/nutrientBenchmarks'
import styles from './NutrientSamples.module.css'

const STATUS_ORDER = { low: 0, adequate: 1, high: 2, excessive: 3 }

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(Number(value))) return '—'
  return Number(Number(value).toFixed(digits)).toLocaleString()
}

function formatDate(value) {
  if (!value) return 'No date'
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatChange(row) {
  const sign = row.change > 0 ? '+' : ''
  const percent = row.percentChange == null ? '' : ` (${sign}${formatNumber(row.percentChange, 1)}%)`
  return `${sign}${formatNumber(row.change)} ${row.unit}${percent}`
}

function progressStatusLabel(status) {
  return ({
    'not-started': 'Not started',
    'in-progress': 'In progress',
    met: 'Target met',
    over: 'Over target',
  })[status] ?? status
}

function tissueFinding(rows) {
  const low = rows.filter(row => row.benchmark.status === 'low').map(row => nutrientLabel(row.result.nutrient))
  const high = rows.filter(row => ['high', 'excessive'].includes(row.benchmark.status)).map(row => nutrientLabel(row.result.nutrient))
  const potassium = rows.find(row => row.result.nutrient === 'K')
  const findings = []
  if (potassium) findings.push(`Potassium is ${potassium.benchmark.status} at ${formatNumber(potassium.benchmark.value)}${potassium.benchmark.unit}`)
  if (low.length) findings.push(`Low: ${low.join(', ')}`)
  if (high.length) findings.push(`High: ${high.join(', ')}`)
  return findings.length ? `${findings.join('. ')}.` : 'All reported tissue nutrients are within the selected reference ranges.'
}

function soilProgramFinding(sample) {
  const recommendations = (sample?.recommendations ?? [])
    .filter(row => Number.isFinite(Number(row.rateLbPer1000)))
    .map(row => {
      const label = row.nutrient === 'K' && /K2O basis/i.test(row.note ?? '') ? 'K2O' : nutrientLabel(row.nutrient)
      return `${label} ${formatNumber(row.rateLbPer1000)} lb / 1,000`
    })
  const phosphorus = String(sample?.notes ?? '').match(/P2O5 recommendation\s+([0-9.]+)\s+lb\/1,000/i)
  if (phosphorus) recommendations.push(`P2O5 ${formatNumber(phosphorus[1])} lb / 1,000`)
  return recommendations.length
    ? `This lab's entire-growing-season program: ${recommendations.join('; ')}.`
    : 'No numeric seasonal program is stored with this sample.'
}

export default function NutrientBaselineDashboard({ samples, selectedId, onSelect }) {
  const { records } = useSpraysData()
  const { items } = useInventoryData()
  const selected = samples.find(sample => sample.id === selectedId) ?? samples[0] ?? null
  const tissueProfile = useMemo(() => tissueBaselineProfile(selected), [selected])
  const tissueRows = useMemo(() => (selected?.sampleType === 'tissue' ? selected.results ?? [] : [])
    .map(result => ({ result, benchmark: benchmarkTissueResult(result, selected) }))
    .filter(row => row.benchmark), [selected])
  const soilRows = useMemo(() => (selected?.sampleType === 'soil' ? [...(selected.results ?? [])] : [])
    .sort((a, b) => (STATUS_ORDER[a.rating] ?? 9) - (STATUS_ORDER[b.rating] ?? 9)), [selected])
  const nextSample = useMemo(
    () => findNextNutrientSample(samples, selected),
    [samples, selected],
  )
  const inputs = useMemo(
    () => buildApplicationNutrientInputs(records, items, selected?.sampleDate, selected?.id, nextSample?.sampleDate),
    [records, items, selected?.sampleDate, selected?.id, nextSample?.sampleDate],
  )
  const recommendationProgress = useMemo(
    () => buildRecommendationProgress(selected?.recommendations, inputs.applications),
    [selected?.recommendations, inputs.applications],
  )
  const previousSample = useMemo(
    () => findPreviousNutrientSample(samples, selected),
    [samples, selected],
  )
  const comparisonRows = useMemo(
    () => buildSampleResultComparison(previousSample, selected),
    [previousSample, selected],
  )
  const intervalInputs = useMemo(
    () => previousSample
      ? buildApplicationNutrientInputs(records, items, previousSample.sampleDate, previousSample.id, selected?.sampleDate)
      : null,
    [records, items, previousSample, selected?.sampleDate],
  )
  const totalEntries = Object.entries(inputs.totals).sort((a, b) => b[1] - a[1])
  const maxInput = Math.max(0, ...totalEntries.map(([, value]) => value))
  const intervalTotalEntries = Object.entries(intervalInputs?.totals ?? {}).sort((a, b) => b[1] - a[1])
  const inferredPrevious = Boolean(previousSample && !selected?.previousSampleId)
  const sampleFinding = selected?.sampleType === 'tissue'
    ? tissueFinding(tissueRows)
    : soilProgramFinding(selected)
  const tissueBaselineUrl = selected?.sourcePdfUrl || tissueProfile.source.url

  if (!selected) return null

  return (
    <section className={styles.baselineDashboard} aria-label="Nutrient position and application inputs">
      <div className={styles.dashboardHeader}>
        <div>
          <p className={styles.eyebrow}>Nutrient Position</p>
          <h2>Lab results against agronomic baselines</h2>
          <p>{selected.sampleType === 'tissue'
            ? 'Bermudagrass tissue is compared with published sufficiency ranges.'
            : 'Soil is compared with the reporting lab’s calibrated rating; numeric soil ranges vary by extraction method.'}</p>
        </div>
        <label>Sample
          <select value={selected.id} onChange={event => onSelect(event.target.value)}>
            {samples.map(sample => <option key={sample.id} value={sample.id}>{formatDate(sample.sampleDate)} · {sample.location} · {sample.sampleType}</option>)}
          </select>
        </label>
      </div>

      <div className={styles.dashboardGrid}>
        <div className={styles.analysisPanel}>
          <div className={styles.panelTitle}><div><strong>{selected.location}</strong><span>{formatDate(selected.sampleDate)} · {selected.labName || 'Lab sample'}</span></div><span className={styles.typeBadge}>{selected.sampleType}</span></div>
          {selected.sampleType === 'tissue' ? (
            <div className={styles.benchmarkList}>
              {tissueRows.map(({ result, benchmark }) => (
                <div className={styles.benchmarkRow} key={result.nutrient}>
                  <div className={styles.benchmarkLabel}><strong>{nutrientLabel(result.nutrient)}</strong><span className={styles[benchmark.status]}>{benchmark.status}</span></div>
                  <div className={styles.benchmarkTrack}>
                    <span className={styles.targetBand} style={{ left: `${benchmark.rangeStartPct}%`, width: `${benchmark.rangeWidthPct}%` }} />
                    <span className={styles.valueMarker} style={{ left: `${benchmark.valuePct}%` }} />
                  </div>
                  <div className={styles.benchmarkValues}><b>{formatNumber(benchmark.value)} {benchmark.unit}</b><span>target {benchmark.min}–{benchmark.max} {benchmark.unit}</span></div>
                </div>
              ))}
              {tissueRows.length === 0 && <p className={styles.emptyRows}>No tissue results use units supported by this baseline.</p>}
            </div>
          ) : (
            <div className={styles.soilGrid}>
              {soilRows.map(result => <div key={result.nutrient}><strong>{result.nutrient}</strong><b>{formatNumber(result.value)} {result.unit}</b><span className={styles[result.rating] || ''}>{result.rating || 'not rated'}</span></div>)}
            </div>
          )}
          <div className={styles.baselineNote}>
            {selected.sampleType === 'tissue' ? <><span>Baseline:</span> {tissueBaselineUrl ? <a href={tissueBaselineUrl} target="_blank" rel="noreferrer">{tissueProfile.source.title}</a> : tissueProfile.source.title}</> : <><span>Baseline:</span> laboratory rating stored with this soil report · <a href={SOIL_INTERPRETATION_SOURCE.url} target="_blank" rel="noreferrer">why method matters</a>.</>}
          </div>
        </div>

        <div className={styles.inputPanel}>
          <div className={styles.panelTitle}><div><strong>Linked application inputs</strong><span>{nextSample ? `${formatDate(selected.sampleDate)} through before the next sample on ${formatDate(nextSample.sampleDate)}` : `Applications saved from this sample since ${formatDate(selected.sampleDate)}`}</span></div><b>{inputs.applications.length}</b></div>
          {totalEntries.length > 0 ? <div className={styles.inputBars}>{totalEntries.map(([nutrient, pounds]) => <div key={nutrient}><span>{nutrient}</span><div><i style={{ width: `${(pounds / maxInput) * 100}%` }} /></div><b>{formatNumber(pounds, 2)} lb</b></div>)}</div> : <p className={styles.emptyRows}>No completed applications are linked to this sample yet.</p>}
          {inputs.unquantifiedProducts > 0 && <p className={styles.dataCaveat}>{inputs.unquantifiedProducts} liquid nutrient product entr{inputs.unquantifiedProducts === 1 ? 'y was' : 'ies were'} not totaled because a mass conversion or density is unavailable.</p>}
          {inputs.unlinkedApplications > 0 && <p className={styles.dataCaveat}>{inputs.unlinkedApplications} older completed application{inputs.unlinkedApplications === 1 ? '' : 's'} after this sample {inputs.unlinkedApplications === 1 ? 'is' : 'are'} not included because no lab sample was linked when saved.</p>}
          <div className={styles.applicationList}>
            {inputs.applications.slice(0, 6).map(application => (
              <div key={application.id}><span><b>{formatDate(application.date)}</b>{application.area}</span><strong>{Object.entries(application.nutrients).map(([nutrient, pounds]) => `${nutrient} ${formatNumber(pounds, 2)} lb`).join(' · ') || 'Unquantified liquid nutrients'}</strong></div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.tifEagleGuidance}>
        <div className={styles.tifEagleHeader}>
          <div>
            <p className={styles.eyebrow}>TifEagle Greens Nutrient Check</p>
            <h3>Use small, measured inputs and let growth response set the pace</h3>
            <p>Planning guardrails for actively growing ultradwarf greens, not automatic application prescriptions.</p>
          </div>
          <span>TifEagle</span>
        </div>
        <div className={styles.tifEagleMetrics}>
          {TIFEAGLE_NUTRIENT_GUIDANCE.map(item => <div key={item.key}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </div>)}
        </div>
        <p className={styles.sampleFinding}><strong>Selected sample:</strong> {sampleFinding}</p>
        <div className={styles.guidanceSources}>
          <span>References:</span>
          {TIFEAGLE_GUIDANCE_SOURCES.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}
        </div>
      </div>

      <div className={styles.recommendationPanel}>
        <div className={styles.recommendationHeader}>
          <div>
            <p className={styles.eyebrow}>Recommendation Progress</p>
            <h3>Lab targets against completed applications</h3>
            <p>Rates are calculated from nutrient pounds and treated acreage for applications linked to this sample.</p>
          </div>
          <span>{recommendationProgress.rows.length} target{recommendationProgress.rows.length === 1 ? '' : 's'}</span>
        </div>

        {recommendationProgress.rows.length > 0 ? <div className={styles.recommendationList}>
          {recommendationProgress.rows.map(row => <div className={styles.recommendationProgressRow} data-status={row.status} key={row.nutrient}>
            <div className={styles.recommendationIdentity}>
              <strong>{nutrientLabel(row.nutrient)}</strong>
              <span>{row.applicationCount} completed application{row.applicationCount === 1 ? '' : 's'}{row.notes.length ? ` / ${row.notes.join(' / ')}` : ''}</span>
            </div>
            <div className={styles.recommendationMetric}><span>Target</span><b>{formatNumber(row.targetRate)} lb / 1,000</b></div>
            <div className={styles.recommendationMetric}><span>Applied</span><b>{formatNumber(row.appliedRate)} lb / 1,000</b></div>
            <div className={styles.recommendationMetric}><span>{row.overRate > 0 ? 'Over by' : 'Remaining'}</span><b>{formatNumber(row.overRate > 0 ? row.overRate : row.remainingRate)} lb / 1,000</b></div>
            <span className={`${styles.recommendationStatus} ${styles[`recommendation${row.status.replace('-', '').replace(/^./, value => value.toUpperCase())}`]}`}>{progressStatusLabel(row.status)}</span>
            <div className={styles.recommendationTrack} role="progressbar" aria-label={`${nutrientLabel(row.nutrient)} recommendation progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(100, Math.round(row.progressPercent))}>
              <i style={{ width: `${Math.min(100, row.progressPercent)}%` }} />
            </div>
          </div>)}
        </div> : <p className={styles.recommendationEmpty}>Add lab recommendations to this sample to track application progress.</p>}

        {(recommendationProgress.additionalInputs.length > 0 || recommendationProgress.unmeasuredApplications > 0) && <div className={styles.recommendationCaveats}>
          {recommendationProgress.additionalInputs.length > 0 && <p><strong>Other nutrient inputs:</strong> {recommendationProgress.additionalInputs.map(row => `${row.nutrient} ${formatNumber(row.appliedRate)} lb / 1,000`).join(' / ')}</p>}
          {recommendationProgress.unmeasuredApplications > 0 && <p>{recommendationProgress.unmeasuredApplications} linked application{recommendationProgress.unmeasuredApplications === 1 ? '' : 's'} could not be compared because treated acreage is missing.</p>}
        </div>}
      </div>

      <div className={styles.trendPanel}>
        <div className={styles.trendHeader}>
          <div>
            <p className={styles.eyebrow}>Follow-Up</p>
            <h3>Response since previous sample</h3>
            <p>{previousSample
              ? `${formatDate(previousSample.sampleDate)} to ${formatDate(selected.sampleDate)} at ${selected.location}`
              : 'Link a follow-up sample to compare lab results and the applications made between tests.'}</p>
          </div>
          {previousSample && <span>{intervalInputs?.applications.length ?? 0} linked application{intervalInputs?.applications.length === 1 ? '' : 's'}</span>}
        </div>

        {!previousSample ? <p className={styles.trendEmpty}>This is the first sample in its follow-up chain.</p> : <>
          {inferredPrevious && <p className={styles.trendNotice}>Matched to the prior {previousSample.sampleType} sample at this location. Edit this sample to save the direct follow-up link.</p>}
          {comparisonRows.length > 0 ? <div className={styles.trendTable}>
            <div className={styles.trendTableHead}><span>Analyte</span><span>Previous</span><span>Current</span><span>Change</span><span>Rating</span></div>
            {comparisonRows.map(row => <div className={styles.trendRow} key={`${row.nutrient}-${row.unit}`}>
              <strong>{nutrientLabel(row.nutrient)}</strong>
              <span>{formatNumber(row.previousValue)} {row.unit}</span>
              <span>{formatNumber(row.currentValue)} {row.unit}</span>
              <b className={styles[`trend${row.direction[0].toUpperCase()}${row.direction.slice(1)}`]}>{formatChange(row)}</b>
              <span>{row.previousRating || 'Not rated'} to {row.currentRating || 'Not rated'}</span>
            </div>)}
          </div> : <p className={styles.trendEmpty}>The two samples do not share any analytes with matching units yet.</p>}

          <div className={styles.trendInputs}>
            <strong>Applications between tests</strong>
            {intervalTotalEntries.length > 0
              ? intervalTotalEntries.map(([nutrient, pounds]) => <span key={nutrient}>{nutrient} {formatNumber(pounds, 2)} lb</span>)
              : <span>No quantified nutrient inputs</span>}
            {intervalInputs?.unquantifiedProducts > 0 && <small>{intervalInputs.unquantifiedProducts} liquid nutrient product entr{intervalInputs.unquantifiedProducts === 1 ? 'y' : 'ies'} could not be converted to pounds.</small>}
          </div>
        </>}
      </div>
    </section>
  )
}
