import { normalizeNutrientSources } from '../inventory/nutrientForms.js'
import { convertInventoryWeight } from '../inventory/containerSize.js'

// Southern Cooperative reference ranges for fresh Tifgreen/Tifton-328 clippings.
// Soil results intentionally use the reporting lab's rating because extraction
// methods and regional calibrations are not interchangeable.
export const BERMUDAGRASS_TISSUE_BASELINES = {
  N:  { min: 3, max: 4, unit: '%' },
  P:  { min: 0.2, max: 0.4, unit: '%' },
  K:  { min: 1.8, max: 2.25, unit: '%' },
  Ca: { min: 0.25, max: 0.5, unit: '%' },
  Mg: { min: 0.15, max: 0.3, unit: '%' },
  S:  { min: 0.15, max: 0.65, unit: '%' },
  Fe: { min: 50, max: 250, unit: 'ppm' },
  Mn: { min: 20, max: 300, unit: 'ppm' },
  Zn: { min: 15, max: 70, unit: 'ppm' },
  Cu: { min: 5, max: 20, unit: 'ppm' },
  B:  { min: 5, max: 60, unit: 'ppm' },
  Mo: { min: 0.1, max: 2, unit: 'ppm' },
}

export const BASELINE_SOURCE = {
  title: 'Southern Cooperative Tifgreen/Tifton-328 tissue ranges',
  url: 'https://www.clemson.edu/public/regulatory/ag-srvc-lab/plant-tissue/ranges.pdf',
}

// AgSource printed these Bermudagrass Turf normal ranges on the Crosswinds
// tissue report. Keeping them with the sample prevents a different cultivar's
// reference from changing the lab's interpretation.
export const AGSOURCE_BERMUDAGRASS_TISSUE_BASELINES = {
  N:  { min: 2.5, max: 3.5, unit: '%' },
  P:  { min: 0.15, max: 0.5, unit: '%' },
  K:  { min: 1, max: 3, unit: '%' },
  Ca: { min: 0.5, max: 1, unit: '%' },
  Mg: { min: 0.2, max: 0.5, unit: '%' },
  S:  { min: 0.2, max: 0.5, unit: '%' },
  Fe: { min: 50, max: 250, unit: 'ppm' },
  Mn: { min: 25, max: 100, unit: 'ppm' },
  Zn: { min: 20, max: 125, unit: 'ppm' },
  Cu: { min: 5, max: 30, unit: 'ppm' },
  B:  { min: 5, max: 20, unit: 'ppm' },
}

export const AGSOURCE_BASELINE_SOURCE = {
  title: 'AgSource Bermudagrass Turf ranges printed on this lab report',
  url: '',
}

export const TIFEAGLE_NUTRIENT_GUIDANCE = [
  {
    key: 'spoon-feed-n',
    label: 'Spoon-feed N',
    value: '0.10-0.30 lb / 1,000',
    detail: 'Every 1-2 weeks while actively growing',
  },
  {
    key: 'active-month-n',
    label: 'Active-month N',
    value: '0.5-1.5 lb / 1,000',
    detail: 'Adjust to growth, recovery, and clipping yield',
  },
  {
    key: 'annual-n',
    label: 'Typical annual N',
    value: '4.0-6.5 lb / 1,000',
    detail: 'USGA ultradwarf range; site needs can vary',
  },
  {
    key: 'potassium',
    label: 'Potassium program',
    value: 'At least 1:1 with N',
    detail: 'Annual K to N under putting-green stress',
  },
  {
    key: 'phosphorus',
    label: 'Phosphorus',
    value: 'Soil-test only',
    detail: 'Do not apply when the calibrated test is high',
  },
]

export const TIFEAGLE_GUIDANCE_SOURCES = [
  {
    title: 'Official TifEagle management guide',
    url: 'https://tifeagle.com/NO-TILL%20TE%20BOOKLET2.pdf',
  },
  {
    title: 'USGA ultradwarf putting-green guidance',
    url: 'https://www.usga.org/content/usga/home-page/course-care/green-section-record/60/08/the-ins-and-outs-of-managing-ultradwarf-putting-greens.html',
  },
  {
    title: 'UF/IFAS Florida golf-green fertilization guidance',
    url: 'https://edis.ifas.ufl.edu/publication/SS404/pdf',
  },
]

export const SOIL_INTERPRETATION_SOURCE = {
  title: 'Penn State guidance on soil-test methods and interpretation',
  url: 'https://extension.psu.edu/interpreting-your-soil-test-reports',
}

export function tissueBaselineProfile(sample = null) {
  const labName = String(sample?.labName ?? '').trim().toLowerCase()
  if (labName.includes('agsource')) {
    return {
      key: 'agsource-bermudagrass',
      baselines: AGSOURCE_BERMUDAGRASS_TISSUE_BASELINES,
      source: AGSOURCE_BASELINE_SOURCE,
    }
  }
  return {
    key: 'southern-cooperative-reference',
    baselines: BERMUDAGRASS_TISSUE_BASELINES,
    source: BASELINE_SOURCE,
  }
}

export function benchmarkTissueResult(result, sample = null) {
  const profile = tissueBaselineProfile(sample)
  const baseline = profile.baselines[result?.nutrient]
  const value = Number(result?.value)
  if (!baseline || !Number.isFinite(value) || result?.unit !== baseline.unit) return null
  const calculatedStatus = value < baseline.min ? 'low' : value > baseline.max ? 'high' : 'adequate'
  const labRating = ['low', 'adequate', 'high', 'excessive'].includes(String(result?.rating ?? '').toLowerCase())
    ? String(result.rating).toLowerCase()
    : ''
  const status = profile.key === 'agsource-bermudagrass' && labRating ? labRating : calculatedStatus
  const chartMax = Math.max(baseline.max * 1.35, value * 1.08)
  return {
    ...baseline,
    value,
    status,
    calculatedStatus,
    statusSource: profile.key === 'agsource-bermudagrass' && labRating ? 'lab' : 'reference',
    profileKey: profile.key,
    valuePct: Math.min(100, (value / chartMax) * 100),
    rangeStartPct: (baseline.min / chartMax) * 100,
    rangeWidthPct: ((baseline.max - baseline.min) / chartMax) * 100,
  }
}

function isCompleted(record) {
  return ['completed', 'complete', 'done'].includes(String(record?.status ?? '').trim().toLowerCase())
}

function quantityInPounds(product) {
  const direct = convertInventoryWeight(product?.quantityUsed, product?.unit, 'lb')
  return direct == null ? null : direct
}

function normalizedLocation(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function findPreviousNutrientSample(samples = [], selected = null) {
  if (!selected) return null
  if (selected.previousSampleId) {
    const linked = samples.find(sample => String(sample.id) === String(selected.previousSampleId))
    if (linked) return linked
  }
  return samples
    .filter(sample => (
      sample.id !== selected.id
      && sample.sampleType === selected.sampleType
      && normalizedLocation(sample.location) === normalizedLocation(selected.location)
      && String(sample.sampleDate ?? '') < String(selected.sampleDate ?? '')
    ))
    .sort((a, b) => String(b.sampleDate ?? '').localeCompare(String(a.sampleDate ?? '')))[0] ?? null
}

export function findNextNutrientSample(samples = [], selected = null) {
  if (!selected) return null
  const later = samples
    .filter(sample => sample.id !== selected.id && String(sample.sampleDate ?? '') > String(selected.sampleDate ?? ''))
    .sort((a, b) => String(a.sampleDate ?? '').localeCompare(String(b.sampleDate ?? '')))
  return later.find(sample => String(sample.previousSampleId ?? '') === String(selected.id))
    ?? later.find(sample => (
      !sample.previousSampleId
      && sample.sampleType === selected.sampleType
      && normalizedLocation(sample.location) === normalizedLocation(selected.location)
    ))
    ?? null
}

export function buildSampleResultComparison(previous, current) {
  if (!previous || !current) return []
  const previousByKey = new Map(
    (previous.results ?? []).map(result => [`${result.nutrient}|${result.unit}`, result]),
  )
  return (current.results ?? []).flatMap(result => {
    const prior = previousByKey.get(`${result.nutrient}|${result.unit}`)
    const currentValue = Number(result.value)
    const previousValue = Number(prior?.value)
    if (!prior || !Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return []
    const change = currentValue - previousValue
    return [{
      nutrient: result.nutrient,
      unit: result.unit,
      previousValue,
      currentValue,
      change,
      percentChange: previousValue === 0 ? null : (change / Math.abs(previousValue)) * 100,
      direction: Math.abs(change) < 1e-9 ? 'steady' : change > 0 ? 'up' : 'down',
      previousRating: prior.rating ?? '',
      currentRating: result.rating ?? '',
    }]
  })
}

export function buildApplicationNutrientInputs(records = [], inventoryItems = [], startDate = '', sampleId = '', endDateExclusive = '') {
  const inventoryById = new Map(inventoryItems.map(item => [String(item.id), item]))
  const totals = {}
  const applications = []
  let unquantifiedProducts = 0
  let unlinkedApplications = 0

  for (const record of records) {
    const recordDate = String(record.date ?? '')
    if (
      !isCompleted(record)
      || (startDate && recordDate < startDate)
      || (endDateExclusive && recordDate >= endDateExclusive)
    ) continue
    if (sampleId && !record.nutrientSampleId) {
      unlinkedApplications += 1
      continue
    }
    if (sampleId && String(record.nutrientSampleId) !== String(sampleId)) continue
    const nutrients = {}
    const unsupported = []

    for (const product of record.products ?? []) {
      const inventory = inventoryById.get(String(product.inventoryItemId ?? ''))
      const sources = normalizeNutrientSources(inventory?.nutrientSources)
        .filter(source => Number(source.percent) > 0)
      if (sources.length === 0) continue
      const productLb = quantityInPounds(product)
      if (productLb == null) {
        unsupported.push(product.name)
        unquantifiedProducts += 1
        continue
      }
      for (const source of sources) {
        const pounds = productLb * Number(source.percent) / 100
        nutrients[source.nutrient] = (nutrients[source.nutrient] ?? 0) + pounds
        totals[source.nutrient] = (totals[source.nutrient] ?? 0) + pounds
      }
    }

    if (Object.keys(nutrients).length > 0 || unsupported.length > 0) {
      applications.push({
        id: record.id,
        date: record.date,
        area: record.area ?? record.applicationName ?? 'Application',
        acreage: (record.areas ?? []).reduce((sum, area) => sum + (Number(area.acreage) || 0), 0),
        nutrients,
        unsupported,
      })
    }
  }

  applications.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return { totals, applications, unquantifiedProducts, unlinkedApplications }
}

const THOUSAND_SQ_FT_PER_ACRE = 43.56

export function buildRecommendationProgress(recommendations = [], applications = []) {
  const targets = new Map()
  for (const recommendation of recommendations) {
    const nutrient = String(recommendation?.nutrient ?? '').trim()
    const rate = Number(recommendation?.rateLbPer1000)
    if (!nutrient || !Number.isFinite(rate) || rate < 0) continue
    const current = targets.get(nutrient) ?? { targetRate: 0, notes: [] }
    current.targetRate += rate
    const note = String(recommendation?.note ?? '').trim()
    if (note && !current.notes.includes(note)) current.notes.push(note)
    targets.set(nutrient, current)
  }

  const appliedRates = {}
  const applicationCounts = {}
  let unmeasuredApplications = 0
  for (const application of applications) {
    const acreage = Number(application?.acreage)
    const nutrients = application?.nutrients ?? {}
    if (!(acreage > 0)) {
      if (Object.keys(nutrients).length > 0) unmeasuredApplications += 1
      continue
    }
    const treatedThousands = acreage * THOUSAND_SQ_FT_PER_ACRE
    for (const [nutrient, poundsValue] of Object.entries(nutrients)) {
      const pounds = Number(poundsValue)
      if (!Number.isFinite(pounds) || pounds < 0) continue
      appliedRates[nutrient] = (appliedRates[nutrient] ?? 0) + (pounds / treatedThousands)
      applicationCounts[nutrient] = (applicationCounts[nutrient] ?? 0) + 1
    }
  }

  const rows = [...targets.entries()].map(([nutrient, target]) => {
    const appliedRate = appliedRates[nutrient] ?? 0
    const tolerance = Math.max(target.targetRate * 0.02, 0.001)
    let status = 'in-progress'
    if (appliedRate <= tolerance && target.targetRate > tolerance) status = 'not-started'
    else if (appliedRate > target.targetRate + tolerance) status = 'over'
    else if (appliedRate >= target.targetRate - tolerance) status = 'met'
    return {
      nutrient,
      targetRate: target.targetRate,
      appliedRate,
      remainingRate: Math.max(0, target.targetRate - appliedRate),
      overRate: Math.max(0, appliedRate - target.targetRate),
      progressPercent: target.targetRate > 0 ? (appliedRate / target.targetRate) * 100 : (appliedRate > tolerance ? 100 : 0),
      status,
      applicationCount: applicationCounts[nutrient] ?? 0,
      notes: target.notes,
    }
  })

  const additionalInputs = Object.entries(appliedRates)
    .filter(([nutrient]) => !targets.has(nutrient))
    .map(([nutrient, appliedRate]) => ({ nutrient, appliedRate, applicationCount: applicationCounts[nutrient] ?? 0 }))
    .sort((a, b) => b.appliedRate - a.appliedRate)

  return { rows, additionalInputs, unmeasuredApplications }
}

function dateDistanceDays(fromDate, toDate) {
  const start = Date.parse(`${fromDate}T00:00:00Z`)
  const end = Date.parse(`${toDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.round((end - start) / 86400000)
}

export function buildNutrientActionQueue(samples = [], records = [], inventoryItems = [], referenceDate = '') {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
    ? referenceDate
    : new Date().toISOString().slice(0, 10)
  const latestByLocation = new Map()
  for (const sample of [...samples].sort((a, b) => String(b.sampleDate ?? '').localeCompare(String(a.sampleDate ?? '')))) {
    const key = `${sample.sampleType}|${normalizedLocation(sample.location)}`
    if (!latestByLocation.has(key)) latestByLocation.set(key, sample)
  }

  const actions = []
  for (const sample of latestByLocation.values()) {
    const nextSample = findNextNutrientSample(samples, sample)
    if (nextSample) continue
    const inputs = buildApplicationNutrientInputs(records, inventoryItems, sample.sampleDate, sample.id)
    const progress = buildRecommendationProgress(sample.recommendations, inputs.applications)
    const incompleteApplicationData = progress.unmeasuredApplications > 0 || inputs.unquantifiedProducts > 0

    if (sample.nextSampleDate) {
      const daysUntil = dateDistanceDays(today, sample.nextSampleDate)
      if (daysUntil != null && daysUntil <= 30) {
        actions.push({
          id: `${sample.id}:retest`,
          sampleId: sample.id,
          kind: 'retest',
          priority: daysUntil <= 0 ? 'urgent' : 'upcoming',
          title: daysUntil < 0 ? 'Retest overdue' : daysUntil === 0 ? 'Retest due today' : 'Retest coming up',
          detail: daysUntil < 0
            ? `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} overdue`
            : daysUntil === 0 ? 'Scheduled for today' : `Due in ${daysUntil} days`,
          dueDate: sample.nextSampleDate,
          sampleDate: sample.sampleDate,
          location: sample.location,
          sampleType: sample.sampleType,
        })
      }
    } else {
      actions.push({
        id: `${sample.id}:schedule`,
        sampleId: sample.id,
        kind: 'retest',
        priority: 'setup',
        title: 'Schedule the next test',
        detail: 'No follow-up date is set',
        dueDate: '',
        sampleDate: sample.sampleDate,
        location: sample.location,
        sampleType: sample.sampleType,
      })
    }

    if (incompleteApplicationData) {
      actions.push({
        id: `${sample.id}:application-data`,
        sampleId: sample.id,
        kind: 'review',
        priority: 'attention',
        title: 'Application totals need review',
        detail: progress.unmeasuredApplications > 0
          ? `${progress.unmeasuredApplications} linked application${progress.unmeasuredApplications === 1 ? ' is' : 's are'} missing treated acreage`
          : `${inputs.unquantifiedProducts} nutrient product entr${inputs.unquantifiedProducts === 1 ? 'y needs' : 'ies need'} a weight conversion`,
        sampleDate: sample.sampleDate,
        location: sample.location,
        sampleType: sample.sampleType,
      })
    } else {
      for (const row of progress.rows) {
        if (row.status === 'met') continue
        actions.push({
          id: `${sample.id}:recommendation:${row.nutrient}`,
          sampleId: sample.id,
          nutrient: row.nutrient,
          kind: row.status === 'over' ? 'review' : 'application',
          priority: row.status === 'over' ? 'attention' : 'plan',
          title: row.status === 'over' ? 'Nutrient target exceeded' : 'Nutrient recommendation remaining',
          detail: row.status === 'over'
            ? `${row.overRate.toFixed(3)} lb / 1,000 sq ft over target`
            : `${row.remainingRate.toFixed(3)} lb / 1,000 sq ft remaining`,
          targetRate: row.targetRate,
          appliedRate: row.appliedRate,
          remainingRate: row.remainingRate,
          sampleDate: sample.sampleDate,
          location: sample.location,
          sampleType: sample.sampleType,
        })
      }
    }

    const recommendedNutrients = new Set((sample.recommendations ?? []).map(row => row.nutrient))
    for (const result of sample.results ?? []) {
      if (recommendedNutrients.has(result.nutrient)) continue
      const rating = String(result.rating ?? '').toLowerCase()
      if (!['low', 'high', 'excessive'].includes(rating)) continue
      actions.push({
        id: `${sample.id}:result:${result.nutrient}`,
        sampleId: sample.id,
        nutrient: result.nutrient,
        kind: 'review',
        priority: rating === 'excessive' ? 'urgent' : 'attention',
        title: `${rating === 'low' ? 'Low' : rating === 'high' ? 'High' : 'Excessive'} lab result needs review`,
        detail: `${result.value} ${result.unit}${result.rating ? ` / ${result.rating}` : ''}`,
        sampleDate: sample.sampleDate,
        location: sample.location,
        sampleType: sample.sampleType,
      })
    }
  }

  const priorityOrder = { urgent: 0, attention: 1, plan: 2, upcoming: 3, setup: 4 }
  return actions.sort((a, b) => (
    (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
    || String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? ''))
    || String(b.sampleDate ?? '').localeCompare(String(a.sampleDate ?? ''))
    || String(a.location ?? '').localeCompare(String(b.location ?? ''))
  ))
}
