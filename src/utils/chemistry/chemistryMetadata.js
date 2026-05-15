// Phase 22A — Chemistry Intelligence: metadata layer.
//
// Static, hand-curated lookup tables for the FRAC / HRAC / IRAC group codes
// that show up on the chemical labels common to North-American turf
// management. The downstream warning layer reads from these tables to
// translate the raw codes parsed off labels (Phase 21 normalizer) into
// agronomic meaning: mode of action, resistance risk, and short notes the
// superintendent can act on.
//
// Conservative by design — only codes we can describe confidently are
// listed. Unknown codes resolve to `{ name: null, riskLevel: 'unknown' }`
// via lookupGroup() so the UI can render "FRAC 49 — unrecognized" instead
// of inventing a description.
//
// Pure data. No side effects, no React. Safe to import from any layer.

// ── Risk levels ─────────────────────────────────────────────────────────
// These mirror the severity vocabulary in src/utils/intelligence/severity.js
// at the conceptual level but stay scoped to RESISTANCE risk specifically:
//   low      — multi-site / non-specific MOA, resistance development slow
//   medium   — single-site MOA but with documented stewardship paths
//   high     — single-site MOA with field-documented resistance pressure
//   unknown  — code recognized but risk profile not curated, OR code not
//              in this table at all (returned by lookupGroup)

export const RESISTANCE_RISK = {
  LOW:     'low',
  MEDIUM:  'medium',
  HIGH:    'high',
  UNKNOWN: 'unknown',
}

// ── FRAC (fungicides) ─────────────────────────────────────────────────────
// Group codes follow the FRAC Code List. We cover the groups that appear
// on the chemicals most commonly applied to greens/tees/fairways. Codes
// are stored uppercase, matching the output of normalizeGroupCodes().

export const FRAC_GROUPS = {
  '1':  {
    code: '1',  type: 'FRAC',
    name: 'MBC fungicides (benzimidazoles)',
    moa:  'Inhibits beta-tubulin assembly in mitosis (cell-division disruption).',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Widespread resistance documented in dollar spot. Rotate aggressively or pair with multi-site partner.',
  },
  '3':  {
    code: '3',  type: 'FRAC',
    name: 'DMI fungicides (sterol-biosynthesis inhibitors)',
    moa:  'Inhibits C14-demethylase in sterol biosynthesis; disrupts membrane integrity.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Shifting sensitivity reported in dollar spot. Limit consecutive applications; rotate with non-DMI MOA.',
  },
  '7':  {
    code: '7',  type: 'FRAC',
    name: 'SDHI fungicides (succinate dehydrogenase inhibitors)',
    moa:  'Inhibits succinate dehydrogenase in mitochondrial complex II (respiration).',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Cross-resistance risk within group. Do not exceed labeled sequential applications.',
  },
  '11': {
    code: '11', type: 'FRAC',
    name: 'QoI fungicides (strobilurins)',
    moa:  'Inhibits mitochondrial respiration at cytochrome bc1 complex (Qo site).',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Single-site MOA, high resistance risk in pythium and anthracnose. Limit to 2 consecutive applications.',
  },
  '12': {
    code: '12', type: 'FRAC',
    name: 'PP-fungicides (phenylpyrroles)',
    moa:  'MAP-kinase signal-transduction disruption (osmotic stress response).',
    riskLevel: RESISTANCE_RISK.LOW,
    notes: 'Fludioxonil — limited documented resistance in turf pathogens.',
  },
  '19': {
    code: '19', type: 'FRAC',
    name: 'Polyoxins',
    moa:  'Inhibits chitin synthase (cell-wall biosynthesis).',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Polyoxin D — useful rotation partner for snow mold and brown patch programs.',
  },
  '21': {
    code: '21', type: 'FRAC',
    name: 'QiI fungicides',
    moa:  'Inhibits mitochondrial respiration at cytochrome bc1 complex (Qi site).',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Cyazofamid — Pythium-active. Cross-resistance with QoI not documented.',
  },
  '29': {
    code: '29', type: 'FRAC',
    name: 'Oxidative phosphorylation uncouplers',
    moa:  'Disrupts proton gradient across mitochondrial membrane.',
    riskLevel: RESISTANCE_RISK.LOW,
    notes: 'Fluazinam — multi-site biochemistry; low resistance risk.',
  },
  '40': {
    code: '40', type: 'FRAC',
    name: 'CAA fungicides (carboxylic-acid amides)',
    moa:  'Inhibits cellulose synthase in oomycete cell-wall biosynthesis.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Mandipropamid / dimethomorph — Pythium and Phytophthora.',
  },
  '43': {
    code: '43', type: 'FRAC',
    name: 'Benzamides (fluopicolide)',
    moa:  'Disrupts spectrin-like proteins in oomycete cell structure.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Pythium-specific. Rotate with FRAC 4 or 21 to preserve sensitivity.',
  },
  '4':  {
    code: '4',  type: 'FRAC',
    name: 'Phenylamides (PA)',
    moa:  'Inhibits RNA polymerase I in oomycetes.',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Mefenoxam — Pythium resistance documented; always tank-mix or rotate with non-PA MOA.',
  },
  'M3': {
    code: 'M3', type: 'FRAC',
    name: 'Dithiocarbamates (multi-site contact)',
    moa:  'Multi-site contact activity inhibiting enzymes containing thiol groups.',
    riskLevel: RESISTANCE_RISK.LOW,
    notes: 'Mancozeb / thiram — long-standing rotation partners; very low resistance risk.',
  },
  'M5': {
    code: 'M5', type: 'FRAC',
    name: 'Chloronitriles (multi-site contact)',
    moa:  'Multi-site contact activity binding to thiol-containing proteins.',
    riskLevel: RESISTANCE_RISK.LOW,
    notes: 'Chlorothalonil — workhorse multi-site partner for dollar spot and brown patch programs.',
  },
  'P1': {
    code: 'P1', type: 'FRAC',
    name: 'Host-plant defense inducers (SAR)',
    moa:  'Induces systemic acquired resistance via salicylic-acid pathway analogs.',
    riskLevel: RESISTANCE_RISK.LOW,
    notes: 'Acibenzolar-S-methyl — preventive only; not curative.',
  },
  'U6': {
    code: 'U6', type: 'FRAC',
    name: 'Unknown / uncategorized (phenylacetamides)',
    moa:  'Mode of action not yet classified by FRAC.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Cyflufenamid — used in powdery mildew programs.',
  },
}

// ── HRAC (herbicides) ─────────────────────────────────────────────────────
// HRAC moved to numeric codes (2020 revision) — we accept both the modern
// numeric codes and the legacy letter codes ("B", "C1") since many product
// labels still print the letter form.

export const HRAC_GROUPS = {
  '1':  {
    code: '1',  type: 'HRAC',
    name: 'ACCase inhibitors',
    moa:  'Inhibits acetyl-CoA carboxylase in fatty-acid biosynthesis.',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Sethoxydim / fluazifop — grass-specific. High resistance pressure in goosegrass.',
  },
  '2':  {
    code: '2',  type: 'HRAC',
    name: 'ALS inhibitors',
    moa:  'Inhibits acetolactate synthase (branched-chain amino-acid synthesis).',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Foramsulfuron / trifloxysulfuron — widespread resistance in annual bluegrass.',
  },
  '3':  {
    code: '3',  type: 'HRAC',
    name: 'Microtubule inhibitors',
    moa:  'Inhibits microtubule assembly (cell-division disruption).',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Prodiamine / pendimethalin — preemergent. Resistance reported in goosegrass populations.',
  },
  '4':  {
    code: '4',  type: 'HRAC',
    name: 'Synthetic auxins',
    moa:  'Mimics indole-acetic acid; deregulates plant growth.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: '2,4-D / dicamba / triclopyr — broadleaf control. Resistance slow but documented.',
  },
  '5':  {
    code: '5',  type: 'HRAC',
    name: 'PSII inhibitors (serine 264 binders)',
    moa:  'Inhibits photosystem II electron transport at the D1 protein.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Atrazine / simazine — limited turf use.',
  },
  '9':  {
    code: '9',  type: 'HRAC',
    name: 'EPSP synthase inhibitors',
    moa:  'Inhibits 5-enolpyruvylshikimate-3-phosphate synthase (aromatic amino-acid synthesis).',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Glyphosate — non-selective. Resistance widespread in weedy annuals.',
  },
  '14': {
    code: '14', type: 'HRAC',
    name: 'PPO inhibitors',
    moa:  'Inhibits protoporphyrinogen oxidase (chlorophyll biosynthesis).',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Sulfentrazone / flumioxazin — preemergent + postemergent.',
  },
  '15': {
    code: '15', type: 'HRAC',
    name: 'Very-long-chain fatty-acid (VLCFA) inhibitors',
    moa:  'Inhibits VLCFA elongases.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Dimethenamid / pyroxasulfone — preemergent grass control.',
  },
  '27': {
    code: '27', type: 'HRAC',
    name: 'HPPD inhibitors',
    moa:  'Inhibits 4-hydroxyphenylpyruvate dioxygenase (carotenoid biosynthesis).',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Mesotrione / topramezone — bleaching herbicides used in turf renovation.',
  },
  // Legacy letter codes — duplicated entries keyed by the letter form so a
  // label that prints "Group B" resolves the same way as one printing "2".
  'B':  {
    code: 'B',  type: 'HRAC',
    name: 'ALS inhibitors (legacy code "B")',
    moa:  'Inhibits acetolactate synthase (branched-chain amino-acid synthesis).',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Legacy code for HRAC Group 2.',
  },
  'C1': {
    code: 'C1', type: 'HRAC',
    name: 'PSII inhibitors (legacy code "C1")',
    moa:  'Inhibits photosystem II electron transport.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Legacy code for HRAC Group 5.',
  },
  'O':  {
    code: 'O',  type: 'HRAC',
    name: 'Synthetic auxins (legacy code "O")',
    moa:  'Mimics indole-acetic acid; deregulates plant growth.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Legacy code for HRAC Group 4.',
  },
}

// ── IRAC (insecticides) ───────────────────────────────────────────────────

export const IRAC_GROUPS = {
  '1A': {
    code: '1A', type: 'IRAC',
    name: 'Carbamates (AChE inhibitors)',
    moa:  'Acetylcholinesterase inhibition — nerve and muscle.',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Carbaryl — broad-spectrum. Cross-resistance risk with Group 1B.',
  },
  '1B': {
    code: '1B', type: 'IRAC',
    name: 'Organophosphates (AChE inhibitors)',
    moa:  'Acetylcholinesterase inhibition — nerve and muscle.',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Trichlorfon / chlorpyrifos — broad-spectrum. Cross-resistance risk with Group 1A.',
  },
  '3A': {
    code: '3A', type: 'IRAC',
    name: 'Pyrethroids',
    moa:  'Sodium-channel modulator — nerve action.',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Bifenthrin / cyfluthrin / lambda-cyhalothrin — surface-feeding insects.',
  },
  '4A': {
    code: '4A', type: 'IRAC',
    name: 'Neonicotinoids',
    moa:  'Nicotinic acetylcholine receptor competitive modulator.',
    riskLevel: RESISTANCE_RISK.HIGH,
    notes: 'Imidacloprid / clothianidin — white grub control. Pollinator-protection requirements apply.',
  },
  '5':  {
    code: '5',  type: 'IRAC',
    name: 'Spinosyns',
    moa:  'Nicotinic acetylcholine receptor allosteric modulator.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Spinosad — caterpillar control. Lower mammalian toxicity profile.',
  },
  '6':  {
    code: '6',  type: 'IRAC',
    name: 'Avermectins',
    moa:  'Glutamate-gated chloride channel allosteric modulator.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Abamectin — limited turf use.',
  },
  '11': {
    code: '11', type: 'IRAC',
    name: 'Microbial disruptors (Bt)',
    moa:  'Microbial disruptor of insect midgut membranes.',
    riskLevel: RESISTANCE_RISK.LOW,
    notes: 'Bacillus thuringiensis — caterpillar control. Very low resistance risk on turf timescales.',
  },
  '22A': {
    code: '22A', type: 'IRAC',
    name: 'Voltage-dependent sodium channel blockers',
    moa:  'Voltage-dependent sodium channel blocker — nerve action.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Indoxacarb — caterpillar control.',
  },
  '28': {
    code: '28', type: 'IRAC',
    name: 'Ryanodine receptor modulators (diamides)',
    moa:  'Ryanodine receptor modulator — muscle contraction.',
    riskLevel: RESISTANCE_RISK.MEDIUM,
    notes: 'Chlorantraniliprole — long residual on white grub and caterpillar pests.',
  },
}

// ── Unified lookup ────────────────────────────────────────────────────────
// Single entry point for the UI layer: given a code and a type
// (FRAC/HRAC/IRAC), return the metadata record, or a stable "unknown"
// shape if the code isn't curated. Type is required because the same
// code string (e.g. "3") means different things across the three systems.

const TABLES = {
  FRAC: FRAC_GROUPS,
  HRAC: HRAC_GROUPS,
  IRAC: IRAC_GROUPS,
}

/**
 * Look up a single group code within one of the three classification systems.
 *
 *   lookupGroup('FRAC', '11')   →  { code: '11', type: 'FRAC', name: '...',
 *                                    moa: '...', riskLevel: 'high', notes: '...' }
 *   lookupGroup('FRAC', '999')  →  { code: '999', type: 'FRAC', name: null,
 *                                    moa: null,   riskLevel: 'unknown',
 *                                    notes: null, recognized: false }
 *
 * The `recognized` flag lets callers distinguish "we have nothing to say"
 * from "this is a real group we just haven't characterized yet" — but
 * conservative UIs can simply key off riskLevel === 'unknown'.
 */
export function lookupGroup(type, code) {
  if (!type || typeof code !== 'string' || !code.trim()) {
    return { code: code ?? null, type: type ?? null, name: null, moa: null, riskLevel: RESISTANCE_RISK.UNKNOWN, notes: null, recognized: false }
  }
  const table = TABLES[type]
  if (!table) {
    return { code, type, name: null, moa: null, riskLevel: RESISTANCE_RISK.UNKNOWN, notes: null, recognized: false }
  }
  const key = code.trim().toUpperCase()
  const hit = table[key]
  if (!hit) {
    return { code: key, type, name: null, moa: null, riskLevel: RESISTANCE_RISK.UNKNOWN, notes: null, recognized: false }
  }
  return { ...hit, recognized: true }
}

/**
 * Bulk-resolve an array of codes for a single classification type.
 * Stable order matches the input. Each entry is the same shape returned
 * by lookupGroup().
 */
export function lookupGroups(type, codes) {
  if (!Array.isArray(codes)) return []
  return codes.map(c => lookupGroup(type, c))
}
