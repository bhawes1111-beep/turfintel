export const DISEASE_CONTROL_TYPES = [
  { value: 'preventive', label: 'Preventive' },
  { value: 'curative', label: 'Curative' },
  { value: 'preventive_curative', label: 'Preventive + curative' },
  { value: 'suppression', label: 'Suppression' },
]

export const TURF_DISEASE_OPTIONS = [
  { value: 'algae', label: 'Algae' },
  { value: 'anthracnose', label: 'Anthracnose' },
  { value: 'ascochyta_leaf_blight', label: 'Ascochyta leaf blight' },
  { value: 'bentgrass_dead_spot', label: 'Bentgrass dead spot' },
  { value: 'bermudagrass_decline', label: 'Bermudagrass decline' },
  { value: 'brown_patch', label: 'Brown patch' },
  { value: 'brown_ring_patch', label: 'Brown ring patch / Waitea patch' },
  { value: 'copper_spot', label: 'Copper spot' },
  { value: 'cream_leaf_blight', label: 'Cream leaf blight' },
  { value: 'damping_off', label: 'Damping off' },
  { value: 'dollar_spot', label: 'Dollar spot' },
  { value: 'fairy_ring', label: 'Fairy ring' },
  { value: 'gray_leaf_spot', label: 'Gray leaf spot' },
  { value: 'gray_snow_mold', label: 'Gray snow mold' },
  { value: 'large_patch', label: 'Large patch' },
  { value: 'leaf_and_sheath_spot', label: 'Leaf and sheath spot / Mini ring' },
  { value: 'leaf_spot_melting_out', label: 'Leaf spot / Melting out' },
  { value: 'microdochium_patch', label: 'Microdochium patch / Fusarium patch' },
  { value: 'necrotic_ring_spot', label: 'Necrotic ring spot' },
  { value: 'nematodes', label: 'Nematodes' },
  { value: 'nigrospora_blight', label: 'Nigrospora blight' },
  { value: 'pink_patch', label: 'Pink patch' },
  { value: 'pink_snow_mold', label: 'Pink snow mold' },
  { value: 'powdery_mildew', label: 'Powdery mildew' },
  { value: 'pythium_blight', label: 'Pythium blight' },
  { value: 'pythium_root_dysfunction', label: 'Pythium root dysfunction' },
  { value: 'pythium_root_rot', label: 'Pythium root rot' },
  { value: 'rapid_blight', label: 'Rapid blight' },
  { value: 'red_thread', label: 'Red thread' },
  { value: 'rhizoctonia_leaf_sheath_spot', label: 'Rhizoctonia leaf and sheath spot' },
  { value: 'rust', label: 'Rust' },
  { value: 'slime_mold', label: 'Slime mold' },
  { value: 'southern_blight', label: 'Southern blight' },
  { value: 'spring_dead_spot', label: 'Spring dead spot' },
  { value: 'stripe_smut', label: 'Stripe smut' },
  { value: 'summer_patch', label: 'Summer patch' },
  { value: 'take_all_patch', label: 'Take-all patch' },
  { value: 'take_all_root_rot', label: 'Take-all root rot' },
  { value: 'yellow_patch', label: 'Yellow patch' },
  { value: 'yellow_tuft', label: 'Yellow tuft' },
]

const DISEASE_VALUES = new Set(TURF_DISEASE_OPTIONS.map(option => option.value))
const CONTROL_VALUES = new Set(DISEASE_CONTROL_TYPES.map(option => option.value))

function makeId() {
  return `disease-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function diseaseLabel(value) {
  return TURF_DISEASE_OPTIONS.find(option => option.value === value)?.label ?? value
}

export function controlTypeLabel(value) {
  return DISEASE_CONTROL_TYPES.find(option => option.value === value)?.label ?? value
}

export function makeDiseaseTarget() {
  return {
    id: makeId(),
    disease: TURF_DISEASE_OPTIONS[0].value,
    controlType: 'preventive',
  }
}

export function normalizeDiseaseTargets(value) {
  const raw = Array.isArray(value) ? value : []
  return raw
    .map(row => {
      const disease = DISEASE_VALUES.has(row?.disease) ? row.disease : TURF_DISEASE_OPTIONS[0].value
      const controlType = CONTROL_VALUES.has(row?.controlType) ? row.controlType : 'preventive'
      return {
        id: row?.id || makeId(),
        disease,
        controlType,
      }
    })
    .filter(row => row.disease)
}

export function formatDiseaseTargetSummary(value) {
  const rows = normalizeDiseaseTargets(value)
  if (rows.length === 0) return ''
  return rows
    .map(row => `${diseaseLabel(row.disease)} (${controlTypeLabel(row.controlType).toLowerCase()})`)
    .join(', ')
}
