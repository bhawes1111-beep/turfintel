import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useSpraysData } from '../../../utils/sprays/spraysStore'
import { useSprayPrograms } from '../../../utils/sprayPrograms/sprayProgramStore'
import {
  useTrainingBriefs,
  getTrainingBrief,
  createTrainingBrief,
  uploadTrainingBrief,
  updateTrainingBrief,
  approveTrainingBrief,
  regenerateTrainingBrief,
  archiveTrainingBrief,
  acknowledgeTrainingBrief,
} from '../../../utils/sprays/trainingBriefsStore'
import { DEVELOPMENT_TRAINING_BRIEF_SAMPLE } from '../../../utils/sprays/trainingBriefSample'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import styles from './SprayTrainingBriefs.module.css'

const STATUS_LABELS = {
  draft: 'Draft',
  needs_review: 'Needs Review',
  ready_for_training: 'Ready for Training',
  reviewed: 'Reviewed',
  archived: 'Archived',
}

const CHECKLIST_SECTIONS = [
  ['beforeMixing', 'Before mixing'],
  ['duringMixing', 'During mixing'],
  ['beforeSpraying', 'Before spraying'],
  ['duringApplication', 'During application'],
  ['afterApplication', 'After application'],
]

const PRODUCT_FIELDS = [
  ['name', 'Product name'],
  ['category', 'Category'],
  ['activeIngredient', 'Active ingredient'],
  ['rate', 'Rate'],
  ['rateUnit', 'Rate unit'],
  ['totalAmount', 'Total required'],
  ['totalUnit', 'Total unit'],
  ['purpose', 'Plain-language purpose'],
  ['inclusionReason', 'Why included here'],
  ['fracGroup', 'FRAC group'],
  ['hracGroup', 'HRAC group'],
  ['iracGroup', 'IRAC group'],
  ['labelUrl', 'Current label link'],
  ['source', 'Source'],
  ['ppe', 'Required PPE'],
  ['signalWord', 'Signal word'],
  ['reiHours', 'REI hours'],
  ['phiHours', 'PHI hours, when applicable'],
  ['restrictions', 'Major restrictions'],
  ['emergencyLink', 'Emergency / first-aid link'],
]

const INSTRUCTION_FIELDS = [
  ['sprayer', 'Sprayer'],
  ['waterVolume', 'Water volume'],
  ['speed', 'Speed'],
  ['pressure', 'Pressure'],
  ['nozzle', 'Nozzle'],
  ['agitation', 'Agitation'],
  ['applicationOrder', 'Application order'],
  ['route', 'Application route'],
  ['waterIn', 'Water-in instructions'],
  ['rainfast', 'Rainfast period'],
  ['observations', 'Post-application observations'],
  ['cleanup', 'Cleanup instructions'],
]

function blankProduct() {
  return {
    name: '', category: '', activeIngredient: '', rate: '', rateUnit: '',
    totalAmount: '', totalUnit: '', purpose: '', inclusionReason: '',
    fracGroup: '', hracGroup: '', iracGroup: '', labelUrl: '', source: '',
    verificationStatus: 'unverified', ppe: '', signalWord: '', reiHours: '',
    phiHours: '', restrictions: '', restrictedUse: false, emergencyLink: '',
  }
}

function editableFromBrief(brief) {
  return {
    title: brief?.title ?? '',
    application: {
      ...(brief?.application ?? {}),
      areas: Array.isArray(brief?.application?.areas) ? brief.application.areas : [],
    },
    products: Array.isArray(brief?.products) ? brief.products : [],
    instructions: brief?.instructions ?? {},
    checklists: brief?.checklists ?? {},
    knowledgeCheck: Array.isArray(brief?.knowledgeCheck) ? brief.knowledgeCheck : [],
  }
}

function displayValue(value, fallback = 'Not verified') {
  return value === 0 || value ? value : fallback
}

function statusClass(status) {
  return `${styles.status} ${styles[`status_${status}`] || ''}`
}

export default function SprayTrainingBriefs({ initialBriefId = null, onBriefSelected } = {}) {
  const { can } = useAuth()
  const canManage = can('canEditSprays')
  const { briefs, loading, error } = useTrainingBriefs()
  const { programs } = useSprayPrograms()
  const { records } = useSpraysData()
  const [selectedId, setSelectedId] = useState(initialBriefId)
  const [detail, setDetail] = useState(null)
  const [draft, setDraft] = useState(null)
  const [sourceMode, setSourceMode] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const fileRef = useRef(null)
  const activeSelectedId = selectedId || initialBriefId || briefs[0]?.id || null

  useEffect(() => {
    if (!activeSelectedId) return undefined
    let ignore = false
    getTrainingBrief(activeSelectedId)
      .then(value => {
        if (ignore) return
        setDetail(value)
        setDraft(editableFromBrief(value))
        onBriefSelected?.(activeSelectedId)
      })
      .catch(err => { if (!ignore) setMessage(err.message) })
    return () => { ignore = true }
  }, [activeSelectedId, onBriefSelected])

  const sourceOptions = sourceMode === 'planned_spray'
    ? programs.map(program => ({ id: program.id, label: program.name }))
    : records.map(record => ({
        id: record.id,
        label: `${record.date || 'No date'} - ${record.applicationName || record.area || 'Application'}`,
      }))

  const activeSnapshot = !canManage && detail?.approvedSnapshot
    ? detail.approvedSnapshot
    : detail

  async function run(action, successMessage) {
    setBusy(true)
    setMessage('')
    try {
      const result = await action()
      if (result?.id) {
        setSelectedId(result.id)
        const refreshed = await getTrainingBrief(result.id)
        setDetail(refreshed)
        setDraft(editableFromBrief(refreshed))
      }
      if (successMessage) setMessage(successMessage)
      return result
    } catch (err) {
      const missing = err.details?.missingFields
      setMessage(missing?.length ? `${err.message}: ${missing.join('; ')}` : err.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await run(() => uploadTrainingBrief(file), 'Upload saved as a draft. Review every extracted field before approval.')
  }

  async function handleSourceCreate() {
    if (!sourceMode || !sourceId) return
    const created = await run(
      () => createTrainingBrief({ sourceType: sourceMode, sourceId }),
      'Training brief draft created. Source data remains unchanged.',
    )
    if (created) { setSourceMode(''); setSourceId('') }
  }

  function patchApplication(key, value) {
    setDraft(current => ({ ...current, application: { ...current.application, [key]: value } }))
  }

  function patchProduct(index, key, value) {
    setDraft(current => ({
      ...current,
      products: current.products.map((product, productIndex) => productIndex === index
        ? { ...product, [key]: value }
        : product),
    }))
  }

  function patchInstruction(key, value) {
    setDraft(current => ({ ...current, instructions: { ...current.instructions, [key]: value } }))
  }

  function patchChecklist(key, value) {
    setDraft(current => ({
      ...current,
      checklists: { ...current.checklists, [key]: value.split('\n').map(item => item.trim()).filter(Boolean) },
    }))
  }

  function patchQuestion(index, key, value) {
    setDraft(current => ({
      ...current,
      knowledgeCheck: current.knowledgeCheck.map((question, questionIndex) => questionIndex === index
        ? { ...question, [key]: value }
        : question),
    }))
  }

  async function save(status = 'needs_review') {
    await run(() => updateTrainingBrief(detail.id, { ...draft, status }), 'Review changes saved.')
  }

  async function approve() {
    const saved = await run(() => updateTrainingBrief(detail.id, { ...draft, status: 'needs_review' }))
    if (!saved) return
    await run(() => approveTrainingBrief(detail.id), 'Brief approved and ready for training.')
  }

  return (
    <div className={styles.page}>
      <WorkspaceSection
        title="Spray Training Briefs"
        subtitle="Turn a planned or completed application into a manager-approved field training tool."
      >
        {canManage && (
          <div className={`${styles.createBar} ${styles.noPrint}`}>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
              className={styles.hiddenInput}
              onChange={handleUpload}
            />
            <button type="button" className={styles.primaryButton} onClick={() => fileRef.current?.click()} disabled={busy}>
              Upload Spray
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => { setSourceMode('planned_spray'); setSourceId('') }}>
              From Planned Spray
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => { setSourceMode('spray_record'); setSourceId('') }}>
              From Saved Record
            </button>
            {import.meta.env.DEV && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => run(() => createTrainingBrief(DEVELOPMENT_TRAINING_BRIEF_SAMPLE), 'Development sample created.')}
              >
                Load Test Sample
              </button>
            )}
          </div>
        )}

        {sourceMode && canManage && (
          <div className={`${styles.sourcePicker} ${styles.noPrint}`}>
            <label>
              <span>{sourceMode === 'planned_spray' ? 'Planned spray program' : 'Saved spray record'}</span>
              <select value={sourceId} onChange={event => setSourceId(event.target.value)}>
                <option value="">Select one</option>
                {sourceOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <button type="button" className={styles.primaryButton} disabled={!sourceId || busy} onClick={handleSourceCreate}>Create Draft</button>
            <button type="button" className={styles.secondaryButton} onClick={() => setSourceMode('')}>Cancel</button>
          </div>
        )}

        {message && <div className={styles.message} role="status">{message}</div>}
        {error && <div className={styles.warning} role="alert">{error}</div>}

        <div className={styles.workspace}>
          <aside className={`${styles.briefList} ${styles.noPrint}`} aria-label="Training briefs">
            <div className={styles.listHeader}>{briefs.length} brief{briefs.length === 1 ? '' : 's'}</div>
            {loading && briefs.length === 0 && <p className={styles.muted}>Loading briefs...</p>}
            {!loading && briefs.length === 0 && <p className={styles.muted}>No training briefs yet.</p>}
            {briefs.map(brief => (
              <button
                key={brief.id}
                type="button"
                className={`${styles.briefListItem} ${activeSelectedId === brief.id ? styles.selected : ''}`}
                onClick={() => setSelectedId(brief.id)}
              >
                <strong>{brief.title}</strong>
                <span>{brief.application?.plannedDate || 'Date not set'}</span>
                <span className={statusClass(brief.status)}>{STATUS_LABELS[brief.status] || brief.status}</span>
              </button>
            ))}
          </aside>

          <main className={styles.detail}>
            {!detail && (
              <EmptyState
                compact
                title="Select a training brief"
                description="Managers can upload a spray document or start from an existing TurfIntel application."
              />
            )}
            {detail && canManage && draft && (
              <ManagerEditor
                detail={detail}
                draft={draft}
                busy={busy}
                setDraft={setDraft}
                patchApplication={patchApplication}
                patchProduct={patchProduct}
                patchInstruction={patchInstruction}
                patchChecklist={patchChecklist}
                patchQuestion={patchQuestion}
                onSave={() => save('needs_review')}
                onApprove={approve}
                onRegenerate={() => run(() => regenerateTrainingBrief(detail.id), 'Narrative and questions regenerated from reviewed brief data.')}
                onArchive={() => run(async () => {
                  await archiveTrainingBrief(detail.id)
                  setSelectedId(null)
                  setDetail(null)
                  return null
                }, 'Brief archived.')}
              />
            )}
            {detail && !canManage && activeSnapshot && (
              <AssistantBrief
                key={detail.id}
                brief={detail}
                snapshot={activeSnapshot}
                busy={busy}
                onSubmit={(responses) => run(
                  () => acknowledgeTrainingBrief(detail.id, responses),
                  'Knowledge check and acknowledgment saved.',
                )}
              />
            )}
          </main>
        </div>
      </WorkspaceSection>
    </div>
  )
}

function ManagerEditor({
  detail, draft, busy, setDraft, patchApplication, patchProduct,
  patchInstruction, patchChecklist, patchQuestion, onSave, onApprove,
  onRegenerate, onArchive,
}) {
  const area = draft.application.areas?.[0] ?? { name: '', acreage: '' }
  return (
    <div className={styles.editor}>
      <div className={`${styles.editorHeader} ${styles.noPrint}`}>
        <div>
          <span className={statusClass(detail.status)}>{STATUS_LABELS[detail.status] || detail.status}</span>
          <h2>{draft.title || 'Spray Training Brief'}</h2>
          <p>Review and edit are required. Extracted fields are not verified automatically.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => window.print()}>Print Preview</button>
          <button type="button" className={styles.secondaryButton} onClick={onRegenerate} disabled={busy}>Regenerate</button>
          <button type="button" className={styles.secondaryButton} onClick={onSave} disabled={busy}>Save Review</button>
          <button type="button" className={styles.primaryButton} onClick={onApprove} disabled={busy}>Approve & Ready</button>
          <button type="button" className={styles.dangerButton} onClick={onArchive} disabled={busy}>Archive</button>
        </div>
      </div>

      {detail.extractionNote && <div className={styles.extractionNote}><strong>Extraction:</strong> {detail.extractionNote}</div>}
      {detail.missingFields?.length > 0 && (
        <div className={styles.warning} role="alert">
          <strong>Not ready for training.</strong>
          <span>Resolve: {detail.missingFields.join('; ')}</span>
        </div>
      )}

      <div className={styles.editForm}>
        <section className={styles.section}>
          <SectionHeading title="Application overview" />
          <div className={styles.formGrid}>
            <Field label="Application name" wide><input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></Field>
            <Field label="Planned date"><input type="date" value={draft.application.plannedDate || ''} onChange={event => patchApplication('plannedDate', event.target.value)} /></Field>
            <Field label="Start time"><input type="time" value={draft.application.startTime || ''} onChange={event => patchApplication('startTime', event.target.value)} /></Field>
            <Field label="End time"><input type="time" value={draft.application.endTime || ''} onChange={event => patchApplication('endTime', event.target.value)} /></Field>
            <Field label="Treatment area"><input value={area.name || ''} onChange={event => patchApplication('areas', [{ ...area, name: event.target.value }])} /></Field>
            <Field label="Acres"><input type="number" step="0.01" value={area.acreage ?? draft.application.acreage ?? ''} onChange={event => {
              patchApplication('acreage', event.target.value)
              patchApplication('areas', [{ ...area, acreage: event.target.value }])
            }} /></Field>
            <Field label="Target / objective" wide><textarea value={draft.application.target || ''} onChange={event => patchApplication('target', event.target.value)} /></Field>
            <Field label="Equipment"><input value={draft.application.equipment || ''} onChange={event => patchApplication('equipment', event.target.value)} /></Field>
            <Field label="GPA"><input type="number" step="0.1" value={draft.application.gpa ?? ''} onChange={event => patchApplication('gpa', event.target.value)} /></Field>
            <Field label="Tank volume"><input type="number" step="0.1" value={draft.application.tankVolume ?? ''} onChange={event => patchApplication('tankVolume', event.target.value)} /></Field>
            <Field label="Loads"><input type="number" step="1" value={draft.application.loads ?? ''} onChange={event => patchApplication('loads', event.target.value)} /></Field>
            <Field label="Operator / assistant"><input value={draft.application.operator || ''} onChange={event => patchApplication('operator', event.target.value)} /></Field>
            <Field label="Expected weather" wide><textarea value={draft.application.weather || ''} onChange={event => patchApplication('weather', event.target.value)} /></Field>
            <Field label="Application limitations" wide><textarea value={draft.application.limitations || ''} onChange={event => patchApplication('limitations', event.target.value)} /></Field>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeadingRow}>
            <SectionHeading title="What we are applying" />
            <button type="button" className={`${styles.secondaryButton} ${styles.noPrint}`} onClick={() => setDraft(current => ({ ...current, products: [...current.products, blankProduct()] }))}>Add Product</button>
          </div>
          {draft.products.map((product, index) => (
            <div className={styles.productEditor} key={`${product.name}-${index}`}>
              <div className={styles.productEditorHeader}>
                <strong>{product.name || `Product ${index + 1}`}</strong>
                <button type="button" className={`${styles.dangerButton} ${styles.noPrint}`} onClick={() => setDraft(current => ({ ...current, products: current.products.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button>
              </div>
              <div className={styles.formGrid}>
                {PRODUCT_FIELDS.map(([key, label]) => (
                  <Field key={key} label={label} wide={key === 'purpose' || key === 'inclusionReason' || key === 'restrictions'}>
                    {(key === 'purpose' || key === 'inclusionReason' || key === 'restrictions')
                      ? <textarea value={product[key] ?? ''} onChange={event => patchProduct(index, key, event.target.value)} />
                      : <input type={key === 'reiHours' || key === 'phiHours' ? 'number' : 'text'} value={product[key] ?? ''} onChange={event => patchProduct(index, key, event.target.value)} />}
                  </Field>
                ))}
                <Field label="Verification status">
                  <select value={product.verificationStatus || 'unverified'} onChange={event => patchProduct(index, 'verificationStatus', event.target.value)}>
                    <option value="unverified">Unverified</option>
                    <option value="verified">Manager verified</option>
                  </select>
                </Field>
                <label className={styles.checkboxField}>
                  <input type="checkbox" checked={product.restrictedUse === true} onChange={event => patchProduct(index, 'restrictedUse', event.target.checked)} />
                  Restricted-use product
                </label>
              </div>
            </div>
          ))}
        </section>

        <section className={styles.section}>
          <SectionHeading title="Why we are making this application" />
          <div className={styles.formGrid}>
            <Field label="Primary agronomic objective" wide><textarea value={draft.application.objective || ''} onChange={event => patchApplication('objective', event.target.value)} /></Field>
            <Field label="How the products support the objective" wide><textarea value={draft.application.overallExplanation || ''} onChange={event => patchApplication('overallExplanation', event.target.value)} /></Field>
            <Field label="Expected turf response" wide><textarea value={draft.application.expectedResponse || ''} onChange={event => patchApplication('expectedResponse', event.target.value)} /></Field>
            <Field label="What success should look like" wide><textarea value={draft.application.successLooksLike || ''} onChange={event => patchApplication('successLooksLike', event.target.value)} /></Field>
            <Field label="Warning signs to monitor" wide><textarea value={draft.application.warningSigns || ''} onChange={event => patchApplication('warningSigns', event.target.value)} /></Field>
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading title="Approved application instructions" />
          <p className={styles.sectionHint}>Leave a field blank when it is not present in approved data, the product label, or manager-entered notes.</p>
          <div className={styles.formGrid}>
            {INSTRUCTION_FIELDS.map(([key, label]) => (
              <Field key={key} label={label} wide={key === 'applicationOrder' || key === 'route' || key === 'observations' || key === 'cleanup'}>
                <textarea value={draft.instructions[key] || ''} onChange={event => patchInstruction(key, event.target.value)} />
              </Field>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading title="Training checklist" />
          <p className={styles.sectionHint}>These are manager-approved operating checks. They are not product-label requirements unless the approved source says so.</p>
          <div className={styles.checklistGrid}>
            {CHECKLIST_SECTIONS.map(([key, label]) => (
              <Field key={key} label={label}>
                <textarea rows="6" value={(draft.checklists[key] || []).join('\n')} onChange={event => patchChecklist(key, event.target.value)} />
              </Field>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <SectionHeading title="Five-question knowledge check" />
          {draft.knowledgeCheck.map((question, index) => (
            <div className={styles.questionEditor} key={question.id || index}>
              <strong>{index + 1}</strong>
              <input aria-label={`Question ${index + 1}`} value={question.prompt || ''} onChange={event => patchQuestion(index, 'prompt', event.target.value)} />
              <input aria-label={`Approved answer ${index + 1}`} value={question.answer || ''} onChange={event => patchQuestion(index, 'answer', event.target.value)} placeholder="Approved answer" />
            </div>
          ))}
        </section>

      </div>
      <div className={styles.printSheet}>
        <BriefReadView snapshot={{ ...draft, approvedByName: detail.approvedByName, approvedAt: detail.approvedAt }} />
      </div>
    </div>
  )
}

function AssistantBrief({ brief, snapshot, busy, onSubmit }) {
  const [answers, setAnswers] = useState(() => (snapshot.knowledgeCheck ?? []).map(question => ({ questionId: question.id, answer: '' })))
  const prior = brief.acknowledgments?.[0]
  function patchAnswer(index, value) {
    setAnswers(current => current.map((answer, answerIndex) => answerIndex === index ? { ...answer, answer: value } : answer))
  }
  return (
    <div className={styles.assistantView}>
      <div className={`${styles.assistantActions} ${styles.noPrint}`}>
        <span className={statusClass(brief.status)}>{STATUS_LABELS[brief.status]}</span>
        <button type="button" className={styles.secondaryButton} onClick={() => window.print()}>Print</button>
      </div>
      <div className={styles.printSheet}>
        <BriefReadView snapshot={snapshot} />
      </div>
      <section className={`${styles.section} ${styles.noPrint}`}>
        <SectionHeading title="Knowledge check and acknowledgment" />
        {snapshot.knowledgeCheck?.map((question, index) => (
          <Field key={question.id} label={`${index + 1}. ${question.prompt}`} wide>
            <input value={answers[index]?.answer || ''} onChange={event => patchAnswer(index, event.target.value)} />
          </Field>
        ))}
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busy || answers.some(answer => !answer.answer.trim())}
          onClick={() => onSubmit(answers)}
        >
          Submit & Acknowledge Review
        </button>
        {prior && <p className={styles.completion}>Previously reviewed: {prior.score}/{prior.totalQuestions} correct on {prior.completedAt}</p>}
      </section>
    </div>
  )
}

function BriefReadView({ snapshot }) {
  const application = snapshot.application ?? {}
  const products = snapshot.products ?? []
  const instructions = snapshot.instructions ?? {}
  const checklists = snapshot.checklists ?? {}
  return (
    <article className={styles.handout}>
      <header className={styles.handoutHeader}>
        <div>
          <span>Spray Training Brief</span>
          <h1>{snapshot.title || application.name}</h1>
          <p>{application.plannedDate || 'Date not verified'} {application.startTime ? `at ${application.startTime}` : ''}</p>
        </div>
        <div className={styles.handoutApproval}>
          <strong>{snapshot.approvedByName ? 'Manager approved' : 'Draft preview'}</strong>
          <span>{snapshot.approvedByName || 'Not approved'}</span>
          <span>{snapshot.approvedAt || ''}</span>
        </div>
      </header>

      <section className={styles.readSection}>
        <h2>Application overview</h2>
        <div className={styles.factGrid}>
          <Fact label="Where" value={(application.areas ?? []).map(area => `${area.name}${area.acreage ? ` (${area.acreage} ac)` : ''}`).join(', ')} />
          <Fact label="Target" value={application.target} />
          <Fact label="Equipment" value={application.equipment} />
          <Fact label="GPA / tank / loads" value={[application.gpa ? `${application.gpa} GPA` : '', application.tankVolume ? `${application.tankVolume} gal tank` : '', application.loads ? `${application.loads} load(s)` : ''].filter(Boolean).join(' | ')} />
          <Fact label="Operator" value={application.operator} />
          <Fact label="Expected weather" value={application.weather} />
          {application.limitations && <Fact label="Limitations" value={application.limitations} warning />}
        </div>
      </section>

      <section className={styles.readSection}>
        <h2>Why we are making this application</h2>
        <p><strong>Objective:</strong> {displayValue(application.objective || application.target)}</p>
        <p>{displayValue(application.overallExplanation)}</p>
        <div className={styles.factGrid}>
          <Fact label="Expected response" value={application.expectedResponse} />
          <Fact label="Success looks like" value={application.successLooksLike} />
          <Fact label="Watch for" value={application.warningSigns} warning />
        </div>
      </section>

      <section className={styles.readSection}>
        <h2>What we are applying</h2>
        <div className={styles.productReadList}>
          {products.map((product, index) => (
            <div className={styles.productRead} key={`${product.name}-${index}`}>
              <div className={styles.productReadTitle}>
                <strong>{displayValue(product.name)}</strong>
                <span>{displayValue(product.category, 'Category not verified')}</span>
                <span className={product.verificationStatus === 'verified' ? styles.verified : styles.unverified}>
                  {product.verificationStatus === 'verified' ? 'Verified' : 'Not verified'}
                </span>
              </div>
              <div className={styles.factGrid}>
                <Fact label="Active ingredient" value={product.activeIngredient} />
                <Fact label="Rate" value={[product.rate, product.rateUnit].filter(Boolean).join(' ')} />
                <Fact label="Total" value={[product.totalAmount, product.totalUnit].filter(Boolean).join(' ')} />
                <Fact label="Purpose" value={product.purpose} />
                <Fact label="Why included" value={product.inclusionReason} />
                <Fact label="Resistance group" value={[
                  product.fracGroup && `FRAC ${product.fracGroup}`,
                  product.hracGroup && `HRAC ${product.hracGroup}`,
                  product.iracGroup && `IRAC ${product.iracGroup}`,
                ].filter(Boolean).join(' | ')} />
              </div>
              <div className={styles.safetyBlock}>
                <strong>Safety and compliance</strong>
                <div className={styles.factGrid}>
                  <Fact label="PPE" value={product.ppe} warning={!product.ppe} />
                  <Fact label="Signal word" value={product.signalWord} warning={!product.signalWord} />
                  <Fact label="REI" value={product.reiHours == null ? '' : `${product.reiHours} hours`} warning={product.reiHours == null} />
                  <Fact label="PHI" value={product.phiHours == null ? 'Not applicable or not provided' : `${product.phiHours} hours`} />
                  <Fact label="Restrictions" value={product.restrictions} />
                  <Fact label="Restricted use" value={product.restrictedUse ? 'Yes' : 'No / not listed'} />
                </div>
                <p className={styles.labelControl}>The current product label is the controlling source.</p>
                {product.labelUrl
                  ? <a href={product.labelUrl} target="_blank" rel="noreferrer">Open current label and first-aid information</a>
                  : <strong className={styles.criticalText}>Not verified - consult the current product label before mixing or applying.</strong>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.readSection}>
        <h2>Application instructions</h2>
        <div className={styles.factGrid}>
          {INSTRUCTION_FIELDS.map(([key, label]) => <Fact key={key} label={label} value={instructions[key]} />)}
        </div>
      </section>

      <section className={styles.readSection}>
        <h2>Training checklist</h2>
        <div className={styles.checklistPrintGrid}>
          {CHECKLIST_SECTIONS.map(([key, label]) => (
            <div key={key}>
              <h3>{label}</h3>
              <ul>{(checklists[key] ?? []).map((item, index) => <li key={`${key}-${index}`}>{item}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>
    </article>
  )
}

function SectionHeading({ title }) {
  return <h3 className={styles.sectionTitle}>{title}</h3>
}

function Field({ label, children, wide = false }) {
  return <label className={`${styles.field} ${wide ? styles.wide : ''}`}><span>{label}</span>{children}</label>
}

function Fact({ label, value, warning = false }) {
  return (
    <div className={`${styles.fact} ${warning ? styles.factWarning : ''}`}>
      <span>{label}</span>
      <strong>{displayValue(value)}</strong>
    </div>
  )
}
