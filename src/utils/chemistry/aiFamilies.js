// Phase 22C — Chemistry Intelligence: active-ingredient family metadata.
//
// Hand-curated lookup that maps individual active-ingredient molecules to
// the agronomic family they belong to. Lets the warning layer flag
// rotation issues at a higher abstraction than single actives:
//
//   "Two QoI-family actives in the same tank" — even when one product
//   uses azoxystrobin and another uses pyraclostrobin.
//
// Family codes are intentionally aligned with the FRAC/HRAC/IRAC group
// metadata in chemistryMetadata.js: a QoI family maps to FRAC 11, DMI
// to FRAC 3, etc. The crossover is informational — labels can carry the
// group code, the active list, or both, and we want to read either.
//
// Conservative — molecules we can identify with confidence only. Unknown
// actives resolve to `null` via lookupActiveFamily() and never trigger
// family-level warnings.
//
// Pure data. No side effects, no React.

import { normalizeActiveName } from './chemistryStructures.js'

// ── Family codes ─────────────────────────────────────────────────────────
// Codes are deliberately short, stable, and uppercase to read well as
// inline chips: "QOI" / "DMI" / "MULTI".

export const AI_FAMILIES = {
  QOI: {
    code: 'QOI',
    name: 'Strobilurins (QoI)',
    fungicideClass: 'fungicide',
    fracGroup: '11',
    notes: 'Single-site MOA, high resistance risk. Cap consecutive applications per FRAC guidance.',
  },
  DMI: {
    code: 'DMI',
    name: 'DMI (sterol-biosynthesis inhibitors)',
    fungicideClass: 'fungicide',
    fracGroup: '3',
    notes: 'Triazole family. Shifting sensitivity reported in dollar spot.',
  },
  SDHI: {
    code: 'SDHI',
    name: 'SDHI (succinate dehydrogenase inhibitors)',
    fungicideClass: 'fungicide',
    fracGroup: '7',
    notes: 'Cross-resistance risk within group.',
  },
  PA: {
    code: 'PA',
    name: 'Phenylamides (PA)',
    fungicideClass: 'fungicide',
    fracGroup: '4',
    notes: 'Mefenoxam-class; oomycete-targeted. Always pair with non-PA partner.',
  },
  PP: {
    code: 'PP',
    name: 'Phenylpyrroles',
    fungicideClass: 'fungicide',
    fracGroup: '12',
    notes: 'Fludioxonil — limited documented resistance.',
  },
  CAA: {
    code: 'CAA',
    name: 'Carboxylic-acid amides',
    fungicideClass: 'fungicide',
    fracGroup: '40',
    notes: 'Pythium/Phytophthora-targeted.',
  },
  QII: {
    code: 'QII',
    name: 'QiI fungicides',
    fungicideClass: 'fungicide',
    fracGroup: '21',
    notes: 'Pythium-active; no documented cross-resistance with QoI.',
  },
  MULTI: {
    code: 'MULTI',
    name: 'Multi-site contacts',
    fungicideClass: 'fungicide',
    fracGroup: 'M5',
    notes: 'Chlorothalonil/mancozeb/thiram — workhorse rotation partners; low resistance risk.',
  },
  POLYOXIN: {
    code: 'POLYOXIN',
    name: 'Polyoxins',
    fungicideClass: 'fungicide',
    fracGroup: '19',
    notes: 'Cell-wall biosynthesis. Useful rotation partner.',
  },
  // Herbicide families
  ALS: {
    code: 'ALS',
    name: 'ALS inhibitors',
    fungicideClass: 'herbicide',
    fracGroup: null,
    hracGroup: '2',
    notes: 'Sulfonylureas / triazolopyrimidines. Widespread resistance in Poa annua.',
  },
  AUXIN: {
    code: 'AUXIN',
    name: 'Synthetic auxins',
    fungicideClass: 'herbicide',
    fracGroup: null,
    hracGroup: '4',
    notes: 'Phenoxy + benzoic-acid broadleaf herbicides.',
  },
  EPSPS: {
    code: 'EPSPS',
    name: 'EPSP synthase inhibitors',
    fungicideClass: 'herbicide',
    fracGroup: null,
    hracGroup: '9',
    notes: 'Glyphosate family.',
  },
  DNA_MITOSIS: {
    code: 'DNA_MITOSIS',
    name: 'Mitosis inhibitors (DNA)',
    fungicideClass: 'herbicide',
    fracGroup: null,
    hracGroup: '3',
    notes: 'Prodiamine / pendimethalin — preemergent.',
  },
  // Insecticide families
  NEONIC: {
    code: 'NEONIC',
    name: 'Neonicotinoids',
    fungicideClass: 'insecticide',
    iracGroup: '4A',
    notes: 'Imidacloprid / clothianidin — pollinator-protection requirements apply.',
  },
  PYRETHROID: {
    code: 'PYRETHROID',
    name: 'Pyrethroids',
    fungicideClass: 'insecticide',
    iracGroup: '3A',
    notes: 'Surface-feeding insects.',
  },
  DIAMIDE: {
    code: 'DIAMIDE',
    name: 'Ryanodine-receptor diamides',
    fungicideClass: 'insecticide',
    iracGroup: '28',
    notes: 'Chlorantraniliprole — long residual.',
  },
}

// ── Active → family lookup table ────────────────────────────────────────
// Keys are the OUTPUT of normalizeActiveName() so a label that prints
// "Azoxystrobin", "azoxystrobin", or "Azoxystrobin (technical)" all
// resolve to the same family code. Add new actives by appending; existing
// entries should not change family without a deliberate decision (would
// silently shift past warnings).

const ACTIVE_TO_FAMILY = {
  // QoI (FRAC 11)
  azoxystrobin:        'QOI',
  pyraclostrobin:      'QOI',
  fluoxastrobin:       'QOI',
  trifloxystrobin:     'QOI',
  picoxystrobin:       'QOI',
  kresoxim_methyl:     'QOI',
  'kresoxim-methyl':   'QOI',
  // DMI (FRAC 3)
  tebuconazole:        'DMI',
  propiconazole:       'DMI',
  triadimefon:         'DMI',
  myclobutanil:        'DMI',
  metconazole:         'DMI',
  triticonazole:       'DMI',
  difenoconazole:      'DMI',
  fluxapyroxad:        'SDHI',   // overrides — fluxapyroxad is SDHI not DMI
  // SDHI (FRAC 7)
  boscalid:            'SDHI',
  penthiopyrad:        'SDHI',
  isofetamid:          'SDHI',
  fluopyram:           'SDHI',
  pydiflumetofen:      'SDHI',
  // Phenylamide (FRAC 4)
  mefenoxam:           'PA',
  metalaxyl:           'PA',
  // Phenylpyrrole (FRAC 12)
  fludioxonil:         'PP',
  // CAA (FRAC 40)
  mandipropamid:       'CAA',
  dimethomorph:        'CAA',
  // QiI (FRAC 21)
  cyazofamid:          'QII',
  amisulbrom:          'QII',
  // Multi-site (FRAC M3 / M5 / 29)
  chlorothalonil:      'MULTI',
  mancozeb:            'MULTI',
  thiram:              'MULTI',
  fluazinam:           'MULTI',
  // Polyoxins (FRAC 19)
  'polyoxin d':        'POLYOXIN',
  polyoxin:            'POLYOXIN',
  // ALS herbicides (HRAC 2)
  foramsulfuron:       'ALS',
  trifloxysulfuron:    'ALS',
  halosulfuron:        'ALS',
  rimsulfuron:         'ALS',
  flazasulfuron:       'ALS',
  metsulfuron:         'ALS',
  metsulfuron_methyl:  'ALS',
  'metsulfuron-methyl': 'ALS',
  // Auxins (HRAC 4)
  '2,4-d':             'AUXIN',
  dicamba:             'AUXIN',
  triclopyr:           'AUXIN',
  mcpp:                'AUXIN',
  // EPSPS (HRAC 9)
  glyphosate:          'EPSPS',
  // Mitosis inhibitors (HRAC 3)
  prodiamine:          'DNA_MITOSIS',
  pendimethalin:       'DNA_MITOSIS',
  dithiopyr:           'DNA_MITOSIS',
  // Neonicotinoids (IRAC 4A)
  imidacloprid:        'NEONIC',
  clothianidin:        'NEONIC',
  thiamethoxam:        'NEONIC',
  dinotefuran:         'NEONIC',
  // Pyrethroids (IRAC 3A)
  bifenthrin:          'PYRETHROID',
  cyfluthrin:          'PYRETHROID',
  'lambda-cyhalothrin': 'PYRETHROID',
  permethrin:          'PYRETHROID',
  deltamethrin:        'PYRETHROID',
  // Diamides (IRAC 28)
  chlorantraniliprole: 'DIAMIDE',
  cyantraniliprole:    'DIAMIDE',
}

// ── Public lookup ────────────────────────────────────────────────────────

/**
 * Look up the family record for a single active-ingredient name.
 * Returns the family record or null if the active isn't curated.
 *
 *   lookupActiveFamily('Azoxystrobin')                    → AI_FAMILIES.QOI
 *   lookupActiveFamily('chlorothalonil (technical)')      → AI_FAMILIES.MULTI
 *   lookupActiveFamily('Mystery Molecule')                → null
 */
export function lookupActiveFamily(activeName) {
  if (typeof activeName !== 'string' || !activeName.trim()) return null
  const key = normalizeActiveName(activeName)
  const familyCode = ACTIVE_TO_FAMILY[key]
  if (!familyCode) return null
  return AI_FAMILIES[familyCode] ?? null
}

/**
 * Resolve the family code (string) for an active name, or null.
 * Convenience over lookupActiveFamily() when callers just need the code
 * for grouping/aggregation.
 */
export function familyCodeOf(activeName) {
  const fam = lookupActiveFamily(activeName)
  return fam ? fam.code : null
}
