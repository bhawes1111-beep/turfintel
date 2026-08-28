import {
  NUTRIENTS,
  normalizeNutrientSources,
  nutrientFormLabel,
  nutrientLabel,
} from '../inventory/nutrientForms'
import { SQFT_PER_ACRE_K } from './rateMath'

export function parseAnalysisNPK(analysis) {
  if (!analysis) return null
  const match = String(analysis).match(/(\d+(?:\.\d+)?)[-\s]+(\d+(?:\.\d+)?)[-\s]+(\d+(?:\.\d+)?)/)
  if (!match) return null
  return {
    n: Number(match[1]),
    p: Number(match[2]),
    k: Number(match[3]),
  }
}

export function nutrientPercentFromAnalysis(npk, nutrient) {
  if (!npk) return 0
  if (nutrient === 'N') return npk.n
  if (nutrient === 'P') return npk.p
  if (nutrient === 'K') return npk.k
  return 0
}

function nutrientSourcePercentForMath(source, sources, npk) {
  const percent = Number(source?.percent) || 0
  if (percent <= 0) return 0

  const guaranteed = nutrientPercentFromAnalysis(npk, source.nutrient)
  if (guaranteed <= 0) return percent

  const sourceTotal = sources
    .filter(other => other.nutrient === source.nutrient)
    .reduce((sum, other) => sum + (Number(other.percent) || 0), 0)
  return sourceTotal > 0 ? percent * (guaranteed / sourceTotal) : percent
}

function emptyReleaseBucket() {
  return { quick: 0, slow: 0, unclassified: 0 }
}

function emptyNutrientReleaseTotals() {
  return Object.fromEntries(NUTRIENTS.map(nutrient => [nutrient.value, emptyReleaseBucket()]))
}

function emptyNutrientReleaseForms() {
  return Object.fromEntries(NUTRIENTS.map(nutrient => [nutrient.value, new Set()]))
}

function emptyNutrientUnsupported() {
  return Object.fromEntries(NUTRIENTS.map(nutrient => [nutrient.value, false]))
}

export function nutrientReleaseTotal(bucket) {
  return (bucket?.quick || 0) + (bucket?.slow || 0) + (bucket?.unclassified || 0)
}

export function productQtyToPounds(qty, unit) {
  const rawUnit = String(unit ?? '').trim().toLowerCase()
  const amount = Number(qty) || 0
  if (amount <= 0) return null
  if (['lb', 'lbs', 'pound', 'pounds'].includes(rawUnit)) return amount
  if (['oz', 'ounce', 'ounces'].includes(rawUnit)) return amount / 16
  return null
}

function formatNumber(value, digits = 3) {
  return Number(value).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

export function formatNutrientReleaseBucket(bucket, acres) {
  const areaK = (Number(acres) || 0) * SQFT_PER_ACRE_K
  if (areaK <= 0) return ''

  const total = nutrientReleaseTotal(bucket)
  if (total <= 0) return ''

  const parts = []
  if (bucket.quick > 0) parts.push(`${formatNumber(bucket.quick / areaK)} quick`)
  if (bucket.slow > 0) parts.push(`${formatNumber(bucket.slow / areaK)} slow`)
  if (bucket.unclassified > 0) parts.push(`${formatNumber(bucket.unclassified / areaK)} unclassified`)
  return `${formatNumber(total / areaK)} lb/1,000 (${parts.join(' / ')})`
}

export function buildNutrientReleaseSummary(rows) {
  const totals = emptyNutrientReleaseTotals()
  const forms = emptyNutrientReleaseForms()
  const unsupported = emptyNutrientUnsupported()
  let sourceCount = 0
  let unsupportedCount = 0

  for (const row of rows ?? []) {
    const sources = normalizeNutrientSources(row.inv?.nutrientSources)
      .filter(source => Number(source.percent) > 0)
    const npk = parseAnalysisNPK(row.inv?.analysis)
    const productLb = productQtyToPounds(row.qtyNeeded, row.qtyUnit)

    if (productLb == null) {
      if ((Number(row.qtyNeeded) || 0) > 0 && (sources.length > 0 || npk)) unsupportedCount += 1
      if (sources.length > 0) {
        sourceCount += 1
        for (const source of sources) {
          const speed = source.release === 'slow' ? 'slow' : 'quick'
          forms[source.nutrient] ??= new Set()
          forms[source.nutrient].add(`${nutrientFormLabel(source.nutrient, source.form)} (${speed})`)
          unsupported[source.nutrient] = true
        }
      }
      continue
    }

    if (sources.length > 0) {
      sourceCount += 1
      for (const source of sources) {
        const amount = productLb * (nutrientSourcePercentForMath(source, sources, npk) / 100)
        const speed = source.release === 'slow' ? 'slow' : 'quick'
        totals[source.nutrient] ??= emptyReleaseBucket()
        forms[source.nutrient] ??= new Set()
        totals[source.nutrient][speed] += amount
        forms[source.nutrient].add(`${nutrientFormLabel(source.nutrient, source.form)} (${speed})`)
      }
      continue
    }

    if (!npk) continue
    sourceCount += 1
    totals.N.unclassified += (npk.n / 100) * productLb
    totals.P.unclassified += (npk.p / 100) * productLb
    totals.K.unclassified += (npk.k / 100) * productLb
  }

  return {
    sourceCount,
    totals,
    forms: Object.fromEntries(Object.entries(forms).map(([key, set]) => [key, Array.from(set)])),
    unsupported,
    unsupportedCount,
  }
}

export function buildNutrientTankRows(summary) {
  if (!summary || summary.nutrientSource <= 0) return []

  return NUTRIENTS
    .map(nutrient => {
      const bucket = summary.nutrientReleaseTotals?.[nutrient.value]
      const forms = summary.nutrientReleaseForms?.[nutrient.value] ?? []
      const unsupported = Boolean(summary.nutrientUnsupported?.[nutrient.value])
      const totalPounds = nutrientReleaseTotal(bucket)
      if (totalPounds <= 0 && !unsupported && forms.length === 0) return null

      return {
        key: nutrient.value,
        label: nutrientLabel(nutrient.value),
        value: totalPounds > 0
          ? formatNutrientReleaseBucket(bucket, summary.acres)
          : (unsupported ? 'Present; weight unavailable' : 'Present'),
        totalPounds,
        quickPounds: bucket?.quick || 0,
        slowPounds: bucket?.slow || 0,
        unclassifiedPounds: bucket?.unclassified || 0,
        forms,
      }
    })
    .filter(Boolean)
}
