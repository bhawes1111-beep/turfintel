export const NEMATODE_CONTROL_TYPES = [
  { value: 'preventive', label: 'Preventive' },
  { value: 'curative', label: 'Curative' },
  { value: 'preventive_curative', label: 'Preventive + curative' },
  { value: 'suppression', label: 'Suppression' },
]

export const TURF_NEMATODE_OPTIONS = [
  { value: 'sting', label: 'Sting nematode' },
  { value: 'lance', label: 'Lance nematode' },
  { value: 'root_knot', label: 'Root-knot nematode' },
  { value: 'stubby_root', label: 'Stubby-root nematode' },
  { value: 'ring', label: 'Ring nematode' },
  { value: 'spiral', label: 'Spiral nematode' },
  { value: 'lesion', label: 'Lesion nematode' },
  { value: 'sheath', label: 'Sheath nematode' },
  { value: 'dagger', label: 'Dagger nematode' },
  { value: 'needle', label: 'Needle nematode' },
  { value: 'stunt', label: 'Stunt nematode' },
  { value: 'cyst', label: 'Cyst nematode' },
  { value: 'pin', label: 'Pin nematode' },
  { value: 'seed_leaf_gall', label: 'Seed and leaf gall nematode' },
  { value: 'awl', label: 'Awl nematode' },
  { value: 'sheathoid', label: 'Sheathoid nematode' },
]

const NEMATODE_VALUES = new Set(TURF_NEMATODE_OPTIONS.map(option => option.value))
const CONTROL_VALUES = new Set(NEMATODE_CONTROL_TYPES.map(option => option.value))

function makeId() {
  return `nematode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function nematodeLabel(value) {
  return TURF_NEMATODE_OPTIONS.find(option => option.value === value)?.label ?? value
}

export function nematodeControlTypeLabel(value) {
  return NEMATODE_CONTROL_TYPES.find(option => option.value === value)?.label ?? value
}

export function makeNematodeTarget() {
  return {
    id: makeId(),
    nematode: TURF_NEMATODE_OPTIONS[0].value,
    controlType: 'preventive',
  }
}

export function normalizeNematodeTargets(value) {
  const raw = Array.isArray(value) ? value : []
  return raw
    .map(row => {
      const nematode = NEMATODE_VALUES.has(row?.nematode) ? row.nematode : TURF_NEMATODE_OPTIONS[0].value
      const controlType = CONTROL_VALUES.has(row?.controlType) ? row.controlType : 'preventive'
      return {
        id: row?.id || makeId(),
        nematode,
        controlType,
      }
    })
    .filter(row => row.nematode)
}

export function formatNematodeTargetSummary(value) {
  const rows = normalizeNematodeTargets(value)
  if (rows.length === 0) return ''
  return rows
    .map(row => `${nematodeLabel(row.nematode)} (${nematodeControlTypeLabel(row.controlType).toLowerCase()})`)
    .join(', ')
}
