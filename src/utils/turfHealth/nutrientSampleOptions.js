import { NUTRIENTS } from '../inventory/nutrientForms'

export const RESULT_UNITS = ['ppm', '%', 'meq/100g', 'lb/acre', 'index', 'pH', 'dS/m']
export const RATINGS = ['', 'low', 'adequate', 'high', 'excessive']

export const LAB_ANALYTES = [
  ...NUTRIENTS,
  { value: 'Na', label: 'Sodium (Na)' },
  { value: 'Si', label: 'Silicon (Si)' },
  { value: 'pH', label: 'Soil pH' },
  { value: 'CEC', label: 'Cation exchange capacity (CEC)' },
  { value: 'OM', label: 'Organic matter (OM)' },
  { value: 'EC', label: 'Electrical conductivity (EC)' },
  { value: 'SAR', label: 'Sodium adsorption ratio (SAR)' },
]

export function blankLabResult() {
  return { nutrient: 'N', value: '', unit: 'ppm', rating: '' }
}

export function blankLabRecommendation() {
  return { nutrient: 'N', rateLbPer1000: '', note: '' }
}
