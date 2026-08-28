export const NUTRIENTS = [
  { value: 'N', label: 'Nitrogen (N)' },
  { value: 'P', label: 'Phosphorus (P)' },
  { value: 'K', label: 'Potassium (K)' },
  { value: 'Ca', label: 'Calcium (Ca)' },
  { value: 'Mg', label: 'Magnesium (Mg)' },
  { value: 'S', label: 'Sulfur (S)' },
  { value: 'Fe', label: 'Iron (Fe)' },
  { value: 'Mn', label: 'Manganese (Mn)' },
  { value: 'Zn', label: 'Zinc (Zn)' },
  { value: 'Cu', label: 'Copper (Cu)' },
  { value: 'B', label: 'Boron (B)' },
  { value: 'Mo', label: 'Molybdenum (Mo)' },
  { value: 'Cl', label: 'Chlorine (Cl)' },
  { value: 'Ni', label: 'Nickel (Ni)' },
]

export const RELEASE_SPEED_OPTIONS = [
  { value: 'quick', label: 'Quick' },
  { value: 'slow', label: 'Slow' },
]

export const NUTRIENT_FORM_OPTIONS = {
  N: [
    { value: 'urea_n', label: 'Urea nitrogen', release: 'quick' },
    { value: 'ammoniacal_n', label: 'Ammoniacal nitrogen', release: 'quick' },
    { value: 'nitrate_n', label: 'Nitrate nitrogen', release: 'quick' },
    { value: 'ammonium_sulfate_n', label: 'Ammonium sulfate', release: 'quick' },
    { value: 'ammonium_nitrate_n', label: 'Ammonium nitrate', release: 'quick' },
    { value: 'calcium_nitrate_n', label: 'Calcium nitrate', release: 'quick' },
    { value: 'potassium_nitrate_n', label: 'Potassium nitrate', release: 'quick' },
    { value: 'uan_solution_n', label: 'UAN solution', release: 'quick' },
    { value: 'slowly_available_wsn_n', label: 'Slowly available WSN nitrogen', release: 'slow' },
    { value: 'win_n', label: 'Water-insoluble nitrogen (WIN)', release: 'slow' },
    { value: 'methylene_urea_n', label: 'Methylene urea', release: 'slow' },
    { value: 'urea_formaldehyde_n', label: 'Urea formaldehyde / ureaform', release: 'slow' },
    { value: 'ibdu_n', label: 'IBDU', release: 'slow' },
    { value: 'sulfur_coated_urea_n', label: 'Sulfur-coated urea', release: 'slow' },
    { value: 'polymer_coated_urea_n', label: 'Polymer-coated urea', release: 'slow' },
    { value: 'polymer_sulfur_coated_urea_n', label: 'Polymer sulfur-coated urea', release: 'slow' },
    { value: 'triazone_n', label: 'Triazone / SRN solution', release: 'slow' },
    { value: 'natural_organic_n', label: 'Natural organic nitrogen', release: 'slow' },
    { value: 'biosolids_n', label: 'Biosolids / sewage sludge nitrogen', release: 'slow' },
    { value: 'feather_meal_n', label: 'Feather meal nitrogen', release: 'slow' },
    { value: 'sugar_cane_molasses_n', label: 'Sugar cane molasses', release: 'slow' },
  ],
  P: [
    { value: 'available_phosphate_p', label: 'Available phosphate (P2O5)', release: 'quick' },
    { value: 'orthophosphate_p', label: 'Orthophosphate', release: 'quick' },
    { value: 'monoammonium_phosphate_p', label: 'Monoammonium phosphate (MAP)', release: 'quick' },
    { value: 'diammonium_phosphate_p', label: 'Diammonium phosphate (DAP)', release: 'quick' },
    { value: 'monopotassium_phosphate_p', label: 'Monopotassium phosphate (MKP)', release: 'quick' },
    { value: 'phosphoric_acid_p', label: 'Phosphoric acid', release: 'quick' },
    { value: 'potassium_phosphite_p', label: 'Potassium phosphite / phosphorous acid', release: 'quick' },
    { value: 'bone_meal_p', label: 'Bone meal / natural organic phosphorus', release: 'slow' },
    { value: 'controlled_release_phosphate_p', label: 'Controlled-release phosphate', release: 'slow' },
    { value: 'rock_phosphate_p', label: 'Rock phosphate / mineral phosphorus', release: 'slow' },
  ],
  K: [
    { value: 'soluble_potash_k', label: 'Soluble potash (K2O)', release: 'quick' },
    { value: 'potassium_chloride_k', label: 'Muriate of potash / potassium chloride', release: 'quick' },
    { value: 'potassium_sulfate_k', label: 'Sulfate of potash / potassium sulfate', release: 'quick' },
    { value: 'potassium_nitrate_k', label: 'Potassium nitrate', release: 'quick' },
    { value: 'potassium_thiosulfate_k', label: 'Potassium thiosulfate', release: 'quick' },
    { value: 'monopotassium_phosphate_k', label: 'Monopotassium phosphate (MKP)', release: 'quick' },
    { value: 'potassium_carbonate_k', label: 'Potassium carbonate', release: 'quick' },
    { value: 'potassium_acetate_k', label: 'Potassium acetate', release: 'quick' },
    { value: 'potassium_citrate_k', label: 'Potassium citrate', release: 'quick' },
    { value: 'potassium_phosphite_k', label: 'Potassium phosphite', release: 'quick' },
    { value: 'controlled_release_potash_k', label: 'Controlled-release / coated potash', release: 'slow' },
    { value: 'natural_organic_k', label: 'Natural organic potassium', release: 'slow' },
  ],
  Ca: [
    { value: 'calcium_ca', label: 'Calcium', release: 'quick' },
    { value: 'calcium_carbonate_ca', label: 'Calcium carbonate / lime', release: 'slow' },
    { value: 'calcium_sulfate_ca', label: 'Calcium sulfate / gypsum', release: 'quick' },
    { value: 'calcium_nitrate_ca', label: 'Calcium nitrate', release: 'quick' },
    { value: 'calcium_chloride_ca', label: 'Calcium chloride', release: 'quick' },
    { value: 'chelated_calcium_ca', label: 'Chelated calcium', release: 'quick' },
  ],
  Mg: [
    { value: 'magnesium_mg', label: 'Magnesium', release: 'quick' },
    { value: 'magnesium_sulfate_mg', label: 'Magnesium sulfate / Epsom salt', release: 'quick' },
    { value: 'magnesium_oxide_mg', label: 'Magnesium oxide', release: 'slow' },
    { value: 'dolomitic_lime_mg', label: 'Dolomitic lime magnesium', release: 'slow' },
    { value: 'chelated_magnesium_mg', label: 'Chelated magnesium', release: 'quick' },
  ],
  S: [
    { value: 'sulfate_s', label: 'Sulfate sulfur', release: 'quick' },
    { value: 'elemental_s', label: 'Elemental sulfur', release: 'slow' },
    { value: 'ammonium_sulfate_s', label: 'Ammonium sulfate sulfur', release: 'quick' },
    { value: 'potassium_sulfate_s', label: 'Potassium sulfate sulfur', release: 'quick' },
    { value: 'magnesium_sulfate_s', label: 'Magnesium sulfate sulfur', release: 'quick' },
    { value: 'calcium_sulfate_s', label: 'Calcium sulfate sulfur', release: 'quick' },
    { value: 'thiosulfate_s', label: 'Thiosulfate sulfur', release: 'quick' },
  ],
  Fe: [
    { value: 'iron_fe', label: 'Iron', release: 'quick' },
    { value: 'ferrous_sulfate_fe', label: 'Ferrous sulfate', release: 'quick' },
    { value: 'iron_oxide_fe', label: 'Iron oxide', release: 'slow' },
    { value: 'chelated_iron_fe', label: 'Chelated iron', release: 'quick' },
    { value: 'iron_sucrate_fe', label: 'Iron sucrate / complexed iron', release: 'quick' },
  ],
  Mn: [
    { value: 'manganese_mn', label: 'Manganese', release: 'quick' },
    { value: 'manganese_sulfate_mn', label: 'Manganese sulfate', release: 'quick' },
    { value: 'manganese_oxide_mn', label: 'Manganese oxide', release: 'slow' },
    { value: 'chelated_manganese_mn', label: 'Chelated manganese', release: 'quick' },
  ],
  Zn: [
    { value: 'zinc_zn', label: 'Zinc', release: 'quick' },
    { value: 'zinc_sulfate_zn', label: 'Zinc sulfate', release: 'quick' },
    { value: 'zinc_oxide_zn', label: 'Zinc oxide', release: 'slow' },
    { value: 'chelated_zinc_zn', label: 'Chelated zinc', release: 'quick' },
  ],
  Cu: [
    { value: 'copper_cu', label: 'Copper', release: 'quick' },
    { value: 'copper_sulfate_cu', label: 'Copper sulfate', release: 'quick' },
    { value: 'copper_oxide_cu', label: 'Copper oxide', release: 'slow' },
    { value: 'chelated_copper_cu', label: 'Chelated copper', release: 'quick' },
  ],
  B: [
    { value: 'boron_b', label: 'Boron', release: 'quick' },
    { value: 'boric_acid_b', label: 'Boric acid', release: 'quick' },
    { value: 'borate_b', label: 'Borate', release: 'quick' },
    { value: 'solubor_b', label: 'Solubor', release: 'quick' },
  ],
  Mo: [
    { value: 'molybdenum_mo', label: 'Molybdenum', release: 'quick' },
    { value: 'sodium_molybdate_mo', label: 'Sodium molybdate', release: 'quick' },
    { value: 'ammonium_molybdate_mo', label: 'Ammonium molybdate', release: 'quick' },
  ],
  Cl: [
    { value: 'chloride_cl', label: 'Chloride', release: 'quick' },
    { value: 'potassium_chloride_cl', label: 'Potassium chloride', release: 'quick' },
    { value: 'calcium_chloride_cl', label: 'Calcium chloride', release: 'quick' },
  ],
  Ni: [
    { value: 'nickel_ni', label: 'Nickel', release: 'quick' },
    { value: 'nickel_sulfate_ni', label: 'Nickel sulfate', release: 'quick' },
    { value: 'chelated_nickel_ni', label: 'Chelated nickel', release: 'quick' },
  ],
}

const NUTRIENT_VALUES = new Set(NUTRIENTS.map(n => n.value))

function uid() {
  return `nutrient-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function nutrientFormOptionsFor(nutrient) {
  return NUTRIENT_FORM_OPTIONS[nutrient] ?? NUTRIENT_FORM_OPTIONS.N
}

export function defaultNutrientForm(nutrient = 'N') {
  return nutrientFormOptionsFor(nutrient)[0]
}

export function nutrientReleaseForForm(nutrient, form) {
  const option = nutrientFormOptionsFor(nutrient).find(o => o.value === form)
  return option?.release ?? 'quick'
}

export function nutrientFormLabel(nutrient, form) {
  const option = nutrientFormOptionsFor(nutrient).find(o => o.value === form)
  return option?.label ?? form ?? ''
}

export function nutrientLabel(nutrient) {
  return NUTRIENTS.find(n => n.value === nutrient)?.label ?? nutrient
}

export function makeNutrientSource(nutrient = 'N') {
  const option = defaultNutrientForm(nutrient)
  return {
    id: uid(),
    nutrient,
    form: option.value,
    percent: '',
    release: option.release,
  }
}

export function normalizeNutrientSources(value) {
  let rows = value
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows) } catch { rows = [] }
  }
  if (!Array.isArray(rows)) return []

  return rows
    .map(row => {
      const nutrient = NUTRIENT_VALUES.has(row?.nutrient) ? row.nutrient : 'N'
      const fallback = defaultNutrientForm(nutrient)
      const form = nutrientFormOptionsFor(nutrient).some(o => o.value === row?.form)
        ? row.form
        : fallback.value
      const release = nutrientReleaseForForm(nutrient, form)
      const rawPercent = row?.percent
      const percent = rawPercent === '' || rawPercent == null ? '' : String(rawPercent)
      return {
        id: row?.id || uid(),
        nutrient,
        form,
        percent,
        release,
      }
    })
    .filter(row => row.form)
}

export function formatNutrientSourceSummary(value) {
  const rows = normalizeNutrientSources(value)
  if (rows.length === 0) return ''

  const parts = []
  for (const nutrient of NUTRIENTS.map(n => n.value)) {
    for (const release of ['quick', 'slow']) {
      const total = rows
        .filter(row => row.nutrient === nutrient && row.release === release)
        .reduce((sum, row) => sum + (Number(row.percent) || 0), 0)
      if (total > 0) parts.push(`${nutrient} ${release} ${Number(total.toFixed(2))}%`)
    }
  }
  return parts.join(', ')
}
