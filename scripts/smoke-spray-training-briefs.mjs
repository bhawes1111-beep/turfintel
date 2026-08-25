import fs from 'node:fs'
import {
  buildApprovedSnapshot,
  buildKnowledgeCheck,
  buildTrainingNarrative,
  findCriticalSafetyGaps,
  sanitizeTrainingFileName,
  scoreKnowledgeResponses,
  validateTrainingUpload,
} from '../worker/lib/sprayTrainingBriefs.js'
import { DEVELOPMENT_TRAINING_BRIEF_SAMPLE } from '../src/utils/sprays/trainingBriefSample.js'

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    passed += 1
    console.log(`  OK ${label}`)
  } else {
    failed += 1
    console.error(`  NO ${label}`)
  }
}

function includes(source, needle, label) {
  assert(source.includes(needle), label)
}

function excludes(source, needle, label) {
  assert(!source.includes(needle), label)
}

const application = DEVELOPMENT_TRAINING_BRIEF_SAMPLE.sourceSnapshot.application
const products = DEVELOPMENT_TRAINING_BRIEF_SAMPLE.sourceSnapshot.products

console.log('\nSpray Training Brief domain behavior')
assert(validateTrainingUpload({ type: 'application/pdf', size: 1024 }) === null, 'accepts supported PDF uploads')
assert(Boolean(validateTrainingUpload({ type: 'text/plain', size: 1024 })), 'rejects unsupported upload types')
assert(Boolean(validateTrainingUpload({ type: 'image/jpeg', size: 9 * 1024 * 1024 })), 'rejects uploads over 8 MB')
assert(sanitizeTrainingFileName('../unsafe\\name.pdf') === '..-unsafe-name.pdf', 'sanitizes upload filenames')

const gaps = findCriticalSafetyGaps(application, products)
assert(gaps.some(gap => gap.includes('Sample Wetting Agent B: current label link')), 'missing label data blocks approval')
assert(gaps.some(gap => gap.includes('Sample Wetting Agent B: manager verification')), 'unverified products block approval')
const narrative = buildTrainingNarrative(application, products)
assert(narrative.objective === application.objective, 'narrative uses approved objective only')
assert(narrative.explanation.includes('Sample Fungicide A'), 'narrative explains product contribution')

const questions = buildKnowledgeCheck(application, products)
assert(questions.length === 5, 'generates exactly five knowledge questions')
const answers = questions.map(question => ({ questionId: question.id, answer: question.answer }))
const result = scoreKnowledgeResponses(questions, answers)
assert(result.score === 5 && result.total === 5, 'scores persisted knowledge responses')

const sourceBrief = {
  id: 'brief-1', courseId: 'course-1', title: 'Approved brief', sourceType: 'wizard_draft',
  sourceRecordId: null, application, products, instructions: {}, checklists: {},
  knowledgeCheck: questions, extractionStatus: 'manual_review', extractionNote: '',
  approvedAt: '2026-08-25T12:00:00Z', approvedByName: 'Manager',
}
const snapshot = buildApprovedSnapshot(sourceBrief)
sourceBrief.application.name = 'Changed later'
sourceBrief.products[0].name = 'Changed product later'
assert(snapshot.application.name !== sourceBrief.application.name, 'approved application snapshot is immutable')
assert(snapshot.products[0].name !== sourceBrief.products[0].name, 'approved product snapshot is immutable')

console.log('\nPersistence, access, and side-effect boundaries')
const api = fs.readFileSync('worker/api/sprayTrainingBriefs.js', 'utf8')
const migration = fs.readFileSync('worker/migrations/0096_spray_training_briefs.sql', 'utf8')
const workerIndex = fs.readFileSync('worker/index.js', 'utf8')
const courseScope = fs.readFileSync('worker/lib/courseScope.js', 'utf8')
const permissions = fs.readFileSync('worker/lib/mutationPermissions.js', 'utf8')
includes(migration, 'course_id', 'briefs, revisions, and acknowledgments are course scoped')
includes(migration, 'approved_snapshot_json', 'approved historical snapshot is persisted')
includes(migration, 'brief_snapshot_json', 'acknowledgment preserves reviewed snapshot')
includes(api, "actorCanAccessCourse(actor, row.course_id)", 'API enforces source course access')
includes(api, "actorHasPermission(actor, 'canEditSprays')", 'manager mutations require spray edit permission')
includes(api, "actorHasPermission(actor, 'canAccessDisplayBoard')", 'crew acknowledgment uses existing crew permission')
includes(permissions, '/acknowledgments', 'central mutation gate permits the acknowledgment action')
includes(courseScope, '/api/spray-training-briefs', 'central course scope covers training routes')
includes(workerIndex, '/api/spray-training-briefs/upload', 'authenticated upload route is wired')
includes(api, "status = 'ready_for_training'", 'approval explicitly transitions to Ready for Training')
includes(api, 'findCriticalSafetyGaps', 'approval checks critical safety gaps')
includes(api, 'operational_attachments', 'uploaded source document uses the existing attachment record pattern')
excludes(api, 'recordInventoryUsage', 'brief API cannot deduct inventory')
excludes(api, 'reverseInventory', 'brief API cannot reverse inventory')
excludes(api, 'UPDATE spray_programs', 'brief API cannot complete or alter a planned spray')
excludes(api, 'UPDATE spray_records', 'brief API cannot alter a saved spray record')

console.log('\nUI, print, and source entry points')
const workspace = fs.readFileSync('src/pages/Spray/tabs/SprayTrainingBriefs.jsx', 'utf8')
const css = fs.readFileSync('src/pages/Spray/tabs/SprayTrainingBriefs.module.css', 'utf8')
const sprayPage = fs.readFileSync('src/pages/Spray/Spray.jsx', 'utf8')
const builder = fs.readFileSync('src/pages/Spray/tabs/BuildSpraySheet.jsx', 'utf8')
const planner = fs.readFileSync('src/pages/Spray/tabs/SprayProgramPlanner.jsx', 'utf8')
const records = fs.readFileSync('src/pages/Spray/tabs/SprayRecords.jsx', 'utf8')
includes(sprayPage, "'Training Briefs'", 'Spray Programs includes the Training Briefs section')
includes(workspace, 'Upload Spray', 'workspace provides upload entry point')
includes(builder, 'Create Training Brief', 'wizard review provides training entry point')
includes(planner, "sourceType: 'planned_spray'", 'planned spray provides training entry point')
includes(records, "sourceType: 'spray_record'", 'saved records provide training entry point')
includes(workspace, 'Not verified - consult the current product label before mixing or applying.', 'critical unverified warning is prominent')
includes(workspace, 'The current product label is the controlling source.', 'label remains controlling source')
includes(css, '@media (max-width: 520px)', 'phone layout has a compact breakpoint')
includes(css, 'min-height: 44px', 'field controls have glove-friendly touch targets')
includes(css, '@media print', 'print-specific layout is defined')
includes(css, '@page', 'landscape print page is defined')
includes(css, 'overflow-wrap: anywhere', 'long safety and label data cannot clip')

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
