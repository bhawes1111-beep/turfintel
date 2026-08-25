export const TRAINING_BRIEF_STATUSES = new Set([
  'draft',
  'needs_review',
  'ready_for_training',
  'reviewed',
  'archived',
])

export const TRAINING_SOURCE_TYPES = new Set([
  'upload',
  'planned_spray',
  'wizard_draft',
  'spray_record',
])

export const TRAINING_UPLOAD_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

export const TRAINING_UPLOAD_MAX_BYTES = 8 * 1024 * 1024

const PESTICIDE_CATEGORIES = new Set([
  'fungicide', 'herbicide', 'insecticide', 'nematicide', 'pgr',
])

export const DEFAULT_TRAINING_CHECKLISTS = {
  beforeMixing: [
    'Confirm the application, treatment area, products, and amounts with the manager.',
    'Inspect required PPE and confirm it is clean and serviceable.',
    'Verify the application equipment is calibrated and free of leaks.',
  ],
  duringMixing: [
    'Match every container to the approved product list before adding it.',
    'Measure each approved amount and maintain agitation when the brief requires it.',
    'Stop and consult the manager and current label if any product or instruction does not match.',
  ],
  beforeSpraying: [
    'Confirm the correct treatment area, route, weather, and application limitations.',
    'Inspect nozzle pattern and application equipment before entering the treatment area.',
  ],
  duringApplication: [
    'Watch the application pattern, agitation, leaks, drift, and changing field conditions.',
    'Stop when conditions no longer match the approved brief or product label.',
  ],
  afterApplication: [
    'Record actual conditions, products, amounts, treated area, and observations.',
    'Clean equipment using the approved instructions and store remaining products securely.',
    'Monitor the turf response and report warning signs listed in this brief.',
  ],
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberOrNull(value) {
  if (value === '' || value == null) return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

export function sanitizeTrainingFileName(value, fallback = 'spray-document') {
  const printable = Array.from(String(value ?? ''))
    .filter(character => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
  const cleaned = printable
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || fallback
}

export function validateTrainingUpload(file) {
  if (!file || typeof file === 'string') return 'A spray document is required'
  if (!TRAINING_UPLOAD_TYPES.has(file.type)) return 'Use a PDF, JPG, PNG, WEBP, HEIC, or HEIF file'
  if (Number(file.size) > TRAINING_UPLOAD_MAX_BYTES) return 'File exceeds the 8 MB limit'
  return null
}

export function normalizeProductSnapshot(product = {}) {
  const category = text(product.category || product.type).toLowerCase()
  return {
    inventoryItemId: text(product.inventoryItemId) || null,
    productCatalogId: text(product.productCatalogId) || null,
    name: text(product.name || product.productName),
    category: category || null,
    activeIngredient: text(product.activeIngredient || product.activeIngredientsSnapshot),
    rate: text(product.rate),
    rateUnit: text(product.rateUnit || product.unit),
    totalAmount: text(product.totalAmount || product.quantityUsed),
    totalUnit: text(product.totalUnit || product.unit),
    purpose: text(product.purpose),
    inclusionReason: text(product.inclusionReason),
    fracGroup: text(product.fracGroup),
    hracGroup: text(product.hracGroup),
    iracGroup: text(product.iracGroup),
    labelUrl: text(product.labelUrl),
    source: text(product.source),
    verificationStatus: text(product.verificationStatus || 'unverified').toLowerCase(),
    ppe: text(product.ppe),
    signalWord: text(product.signalWord),
    reiHours: numberOrNull(product.reiHours),
    phiHours: numberOrNull(product.phiHours),
    restrictions: text(product.restrictions),
    restrictedUse: product.restrictedUse === true,
    emergencyLink: text(product.emergencyLink || product.labelUrl),
  }
}

export function normalizeApplicationSnapshot(value = {}) {
  const areas = Array.isArray(value.areas)
    ? value.areas.map(area => ({
        name: text(area?.name || area?.area),
        acreage: numberOrNull(area?.acreage ?? area?.acres),
      })).filter(area => area.name)
    : []
  return {
    name: text(value.name || value.applicationName),
    applicationType: text(value.applicationType),
    plannedDate: text(value.plannedDate || value.date),
    startTime: text(value.startTime),
    endTime: text(value.endTime),
    areas,
    acreage: numberOrNull(value.acreage ?? value.acres),
    target: text(value.target),
    equipment: text(value.equipment),
    gpa: numberOrNull(value.gpa),
    tankVolume: numberOrNull(value.tankVolume),
    loads: numberOrNull(value.loads),
    operator: text(value.operator),
    weather: text(value.weather),
    limitations: text(value.limitations),
    objective: text(value.objective),
    overallExplanation: text(value.overallExplanation),
    expectedResponse: text(value.expectedResponse),
    successLooksLike: text(value.successLooksLike),
    warningSigns: text(value.warningSigns),
    managerNotes: text(value.managerNotes),
  }
}

export function normalizeInstructionsSnapshot(value = {}) {
  return {
    sprayer: text(value.sprayer),
    waterVolume: text(value.waterVolume),
    speed: text(value.speed),
    pressure: text(value.pressure),
    nozzle: text(value.nozzle),
    agitation: text(value.agitation),
    applicationOrder: text(value.applicationOrder),
    route: text(value.route),
    waterIn: text(value.waterIn),
    rainfast: text(value.rainfast),
    observations: text(value.observations),
    cleanup: text(value.cleanup),
  }
}

export function normalizeChecklists(value = {}) {
  const result = {}
  for (const [key, defaults] of Object.entries(DEFAULT_TRAINING_CHECKLISTS)) {
    const supplied = value?.[key]
    result[key] = Array.isArray(supplied)
      ? supplied.map(text).filter(Boolean)
      : [...defaults]
  }
  return result
}

export function findCriticalSafetyGaps(application, products) {
  const gaps = []
  if (!text(application?.name)) gaps.push('Application name')
  if (!text(application?.plannedDate)) gaps.push('Planned date')
  if (!Array.isArray(application?.areas) || application.areas.length === 0) gaps.push('Treatment area')
  if (!Array.isArray(products) || products.length === 0) gaps.push('At least one product')

  for (const [index, raw] of (products ?? []).entries()) {
    const product = normalizeProductSnapshot(raw)
    const label = product.name || `Product ${index + 1}`
    if (!product.name) gaps.push(`${label}: product name`)
    if (!product.labelUrl) gaps.push(`${label}: current label link`)
    if (!product.source) gaps.push(`${label}: source`)
    if (product.verificationStatus !== 'verified') gaps.push(`${label}: manager verification`)
    if (PESTICIDE_CATEGORIES.has(product.category)) {
      if (!product.ppe) gaps.push(`${label}: required PPE`)
      if (!product.signalWord) gaps.push(`${label}: signal word`)
      if (product.reiHours == null) gaps.push(`${label}: REI`)
    }
  }
  return [...new Set(gaps)]
}

export function buildTrainingNarrative(application, products) {
  const objective = text(application?.objective || application?.target)
  const support = (products ?? [])
    .map(product => {
      const item = normalizeProductSnapshot(product)
      if (!item.name || (!item.purpose && !item.inclusionReason)) return ''
      return `${item.name}: ${item.inclusionReason || item.purpose}`
    })
    .filter(Boolean)
  return {
    objective: objective || 'Not verified - manager must describe the agronomic objective.',
    explanation: support.length
      ? support.join(' ')
      : 'Not verified - manager must explain why the products are included together.',
  }
}

export function buildKnowledgeCheck(application, products) {
  const normalizedProducts = (products ?? []).map(normalizeProductSnapshot)
  const areas = (application?.areas ?? []).map(area => area.name).filter(Boolean).join(', ')
  const ppe = [...new Set(normalizedProducts.map(product => product.ppe).filter(Boolean))].join('; ')
  const rei = normalizedProducts
    .map(product => product.reiHours)
    .filter(value => value != null)
  const maxRei = rei.length ? Math.max(...rei) : null
  return [
    { id: 'purpose', prompt: 'What is the main purpose of this application?', answer: text(application?.objective || application?.target) },
    { id: 'areas', prompt: 'Which areas are being treated?', answer: areas },
    { id: 'ppe', prompt: 'What PPE is required?', answer: ppe },
    { id: 'rei', prompt: 'What is the longest REI in this application?', answer: maxRei == null ? '' : `${maxRei} hours` },
    { id: 'monitor', prompt: 'What should be monitored afterward?', answer: text(application?.warningSigns || application?.successLooksLike) },
  ]
}

function normalizedAnswer(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim()
}

export function scoreKnowledgeResponses(questions, responses) {
  const responseMap = new Map((responses ?? []).map(item => [String(item?.questionId ?? ''), text(item?.answer)]))
  let score = 0
  const graded = (questions ?? []).map(question => {
    const response = responseMap.get(String(question.id)) ?? ''
    const expected = normalizedAnswer(question.answer)
    const actual = normalizedAnswer(response)
    const correct = Boolean(expected && actual && (actual === expected || actual.includes(expected) || expected.includes(actual)))
    if (correct) score += 1
    return { questionId: question.id, answer: response, correct }
  })
  return { score, total: (questions ?? []).length, responses: graded }
}

export function buildApprovedSnapshot(brief) {
  const snapshot = {
    id: brief.id,
    courseId: brief.courseId,
    title: brief.title,
    sourceType: brief.sourceType,
    sourceRecordId: brief.sourceRecordId,
    application: brief.application,
    products: brief.products,
    instructions: brief.instructions,
    checklists: brief.checklists,
    knowledgeCheck: brief.knowledgeCheck,
    extractionStatus: brief.extractionStatus,
    extractionNote: brief.extractionNote,
    approvedAt: brief.approvedAt,
    approvedByName: brief.approvedByName,
  }
  return JSON.parse(JSON.stringify(snapshot))
}
