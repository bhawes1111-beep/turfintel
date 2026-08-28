export const FERTILIZER_COATING_TYPES = [
  { value: 'none', label: 'Not coated / unknown' },
  { value: 'sulfur_coated_urea', label: 'Sulfur-coated urea (SCU)' },
  { value: 'polymer_coated_urea', label: 'Polymer-coated urea (PCU)' },
  { value: 'polymer_sulfur_coated_urea', label: 'Polymer-coated sulfur-coated urea' },
  { value: 'coated_nitrogen_blend', label: 'Coated nitrogen blend' },
  { value: 'resin_coated_fertilizer', label: 'Resin-coated fertilizer' },
  { value: 'controlled_release_coated_fertilizer', label: 'Controlled-release coated fertilizer' },
  { value: 'custom', label: 'Custom coating' },
]

export const COATED_NUTRIENT_OPTIONS = [
  { value: 'N', label: 'Nitrogen (N)' },
  { value: 'P', label: 'Phosphorus (P)' },
  { value: 'K', label: 'Potassium (K)' },
  { value: 'blend', label: 'N-P-K blend' },
]

const COATING_VALUES = new Set(FERTILIZER_COATING_TYPES.map(option => option.value))
const COATED_NUTRIENT_VALUES = new Set(COATED_NUTRIENT_OPTIONS.map(option => option.value))

function text(value) {
  return String(value ?? '').trim()
}

export function normalizeFertilizerCoating(value) {
  let row = value
  if (typeof row === 'string') {
    try { row = JSON.parse(row) } catch { row = null }
  }
  if (!row || typeof row !== 'object') {
    return {
      coatingType: 'none',
      coatedNutrient: 'N',
      coatedPercent: '',
      releaseDays: '',
      notes: '',
    }
  }

  const coatingType = COATING_VALUES.has(row.coatingType) ? row.coatingType : 'none'
  return {
    coatingType,
    coatedNutrient: COATED_NUTRIENT_VALUES.has(row.coatedNutrient) ? row.coatedNutrient : 'N',
    coatedPercent: text(row.coatedPercent),
    releaseDays: text(row.releaseDays),
    notes: text(row.notes),
  }
}

export function fertilizerCoatingLabel(value) {
  return FERTILIZER_COATING_TYPES.find(option => option.value === value)?.label ?? value
}

export function coatedNutrientLabel(value) {
  return COATED_NUTRIENT_OPTIONS.find(option => option.value === value)?.label ?? value
}

export function formatFertilizerCoatingSummary(value) {
  const coating = normalizeFertilizerCoating(value)
  if (!coating.coatingType || coating.coatingType === 'none') return ''

  const details = []
  if (coating.coatedPercent) details.push(`${coating.coatedPercent}% ${coatedNutrientLabel(coating.coatedNutrient)}`)
  if (coating.releaseDays) details.push(`${coating.releaseDays} day release`)
  if (coating.notes) details.push(coating.notes)

  return [fertilizerCoatingLabel(coating.coatingType), ...details].join(' - ')
}
