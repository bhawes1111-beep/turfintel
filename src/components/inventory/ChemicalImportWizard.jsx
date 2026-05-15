import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../shared/icons'
import { useToast } from '../../utils/feedback/toastContext'
import {
  uploadLabelPdf,
  discardLabelPdf,
  extractLabel,
  saveImportedLabel,
  MAX_PDF_BYTES,
} from '../../utils/inventory/labelImportStore'
import styles from './ChemicalImportWizard.module.css'

// Wizard pre-generates the inventory item id so the label PDF can be
// uploaded keyed to it (attachment parentId) before the item exists.
function newItemId() {
  const uuid = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  return `inv-${uuid.slice(0, 8)}`
}

const STEPS = ['Upload PDF', 'Extract', 'Review & Save']
const SIGNAL_WORDS  = ['', 'Caution', 'Warning', 'Danger']
const CHEM_CATEGORIES = ['Fungicide', 'Herbicide', 'Insecticide', 'PGR']

function emptyForm() {
  return {
    name: '', kind: 'chemical', category: '', unit: '', quantity: '',
    reorderLevel: '', costPerUnit: '',
    manufacturer: '', epaNumber: '', expiryDate: '',
    activeIngredients: '', chemicalClass: '',
    signalWord: '', restrictedUse: false, reiHours: '', phi: '',
    fracGroup: '', hracGroup: '', iracGroup: '',
    applicationRatesText: '', targetsText: '', turfSites: '',
    safetyNotes: '', storageNotes: '', labelUrl: '',
    analysis: '', nitrogenSource: '',
    notes: '',
  }
}

// Seed the review form from an extraction draft (or the empty skeleton).
function formFromDraft(draft) {
  const f = emptyForm()
  if (!draft || typeof draft !== 'object') return f
  return {
    ...f,
    name:              draft.name ?? '',
    kind:              draft.kind ?? 'chemical',
    category:          draft.category ?? '',
    unit:              draft.unit ?? '',
    quantity:          draft.quantity != null ? String(draft.quantity) : '',
    manufacturer:      draft.manufacturer ?? '',
    epaNumber:         draft.epaNumber ?? '',
    activeIngredients: draft.activeIngredients ?? '',
    chemicalClass:     draft.chemicalClass ?? '',
    signalWord:        draft.signalWord ?? '',
    restrictedUse:     !!draft.restrictedUse,
    reiHours:          draft.reiHours ?? '',
    phi:               draft.phi ?? '',
    fracGroup:         draft.fracGroup ?? '',
    hracGroup:         draft.hracGroup ?? '',
    iracGroup:         draft.iracGroup ?? '',
    applicationRatesText: Array.isArray(draft.applicationRates) ? draft.applicationRates.join('\n') : '',
    targetsText:          Array.isArray(draft.targets) ? draft.targets.join('\n') : '',
    turfSites:         draft.turfSites ?? '',
    safetyNotes:       draft.safetyNotes ?? '',
    storageNotes:      draft.storageNotes ?? '',
    labelUrl:          draft.labelUrl ?? '',
    notes:             draft.notes ?? '',
  }
}

function linesToArray(text) {
  return (text || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function fmtTime(d) {
  if (!d) return ''
  try {
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

// Fields surfaced in the duplicate comparison card.
const DUP_FIELDS = [
  ['Category',     'category',     'category'],
  ['Unit',         'unit',         'unit'],
  ['Quantity',     'quantity',     'quantity'],
  ['Manufacturer', 'manufacturer', 'manufacturer'],
  ['EPA #',        'epaNumber',    'epaNumber'],
]

export default function ChemicalImportWizard({ onClose, onSaved }) {
  const toast = useToast()
  const itemIdRef = useRef(newItemId())
  const savedRef  = useRef(false)        // suppress PDF cleanup once committed

  const [step, setStep] = useState(0)

  // Step 1 — upload
  const [file, setFile]               = useState(null)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [attachment, setAttachment]   = useState(null)
  const [uploadedAt, setUploadedAt]   = useState(null)
  const [dragOver, setDragOver]       = useState(false)

  // Step 2 — extract
  const [extracting, setExtracting]       = useState(false)
  const [extractResult, setExtractResult] = useState(null)
  const [extractError, setExtractError]   = useState(null)

  // Step 3 — review / save
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [duplicate, setDuplicate] = useState(null)   // { existing, message }

  // Esc closes; cleans up an orphan PDF if the wizard never reached Save.
  const handleClose = useCallback(() => {
    if (attachment && !savedRef.current) discardLabelPdf(attachment.id)
    onClose()
  }, [attachment, onClose])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  // ── Step 1 — upload ──────────────────────────────────────────────────────
  function pickFile(f) {
    setUploadError(null)
    if (!f) return
    if (f.type !== 'application/pdf') {
      setUploadError('Only PDF files are accepted.')
      return
    }
    if (f.size > MAX_PDF_BYTES) {
      setUploadError(`File exceeds the ${MAX_PDF_BYTES / 1024 / 1024} MB limit.`)
      return
    }
    setFile(f)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const att = await uploadLabelPdf({ file, draftItemId: itemIdRef.current })
      setAttachment(att)
      setUploadedAt(new Date())
      setStep(1)
      runExtraction(att)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  // ── Step 2 — extract ─────────────────────────────────────────────────────
  async function runExtraction(att) {
    setExtracting(true)
    setExtractError(null)
    try {
      const result = await extractLabel(att.id)
      setExtractResult(result)
    } catch (err) {
      setExtractError(err.message)
    } finally {
      setExtracting(false)
    }
  }

  function goToReview() {
    setForm(formFromDraft(extractResult?.draft))
    setStep(2)
  }

  // ── Step 3 — review / save ───────────────────────────────────────────────
  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function buildPayload(dedupeMode) {
    const item = {
      id:             itemIdRef.current,
      name:           form.name.trim(),
      kind:           form.kind,
      category:       form.category.trim() || null,
      unit:           form.unit.trim() || null,
      quantity:       form.quantity === '' ? 0 : Number(form.quantity),
      reorderLevel:   form.reorderLevel === '' ? null : Number(form.reorderLevel),
      costPerUnit:    form.costPerUnit === '' ? null : Number(form.costPerUnit),
      manufacturer:   form.manufacturer.trim() || null,
      epaNumber:      form.epaNumber.trim() || null,
      expiryDate:     form.expiryDate.trim() || null,
      analysis:       form.kind === 'fertilizer' ? (form.analysis.trim() || null) : null,
      nitrogenSource: form.kind === 'fertilizer' ? (form.nitrogenSource.trim() || null) : null,
      notes:          form.notes.trim() || null,
    }
    const label = {
      productName:       form.name.trim(),
      manufacturer:      form.manufacturer.trim() || null,
      epaNumber:         form.epaNumber.trim() || null,
      activeIngredients: form.activeIngredients.trim() || null,
      chemicalClass:     form.chemicalClass.trim() || null,
      signalWord:        form.signalWord || null,
      restrictedUse:     form.restrictedUse,
      reiHours:          form.reiHours.trim() || null,
      phi:               form.phi.trim() || null,
      fracGroup:         form.fracGroup.trim() || null,
      hracGroup:         form.hracGroup.trim() || null,
      iracGroup:         form.iracGroup.trim() || null,
      applicationRates:  linesToArray(form.applicationRatesText),
      targets:           linesToArray(form.targetsText),
      turfSites:         form.turfSites.trim() || null,
      safetyNotes:       form.safetyNotes.trim() || null,
      storageNotes:      form.storageNotes.trim() || null,
      labelUrl:          form.labelUrl.trim() || null,
      rawExtraction:     { source: 'manual', extractResult, form },
    }
    return { item, label, pdfAttachmentId: attachment?.id ?? null, dedupeMode }
  }

  async function doSave(dedupeMode) {
    if (!form.name.trim()) {
      setSaveError('Product name is required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveImportedLabel(buildPayload(dedupeMode))
      savedRef.current = true
      toast.success(
        result.updated
          ? `Updated "${result.item.name}" in inventory.`
          : `Saved "${result.item.name}" to inventory.`,
      )
      onSaved?.(result)
      onClose()
    } catch (err) {
      if (err.status === 409 && err.body?.duplicate) {
        setDuplicate({ existing: err.body.existing, message: err.body.message })
      } else {
        setSaveError(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return createPortal(
    <div
      className={styles.backdrop}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Chemical Import Wizard"
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Chemical Import Wizard</h2>
            <p className={styles.subtitle}>Add a chemical from its label PDF.</p>
          </div>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Step progress */}
        <div className={styles.steps}>
          {STEPS.map((label, i) => (
            <Fragment key={label}>
              {i > 0 && (
                <span className={styles.connector} data-filled={i <= step ? 'yes' : 'no'} />
              )}
              <div
                className={styles.stepItem}
                data-state={i === step ? 'active' : i < step ? 'done' : 'todo'}
              >
                <span className={styles.stepDot}>
                  {i < step ? '✓' : i + 1}
                </span>
                <span className={styles.stepLabel}>{label}</span>
              </div>
            </Fragment>
          ))}
        </div>

        <div className={styles.body}>
          {/* ── Step 1 — Upload ── */}
          {step === 0 && (
            <div className={styles.stepPane}>
              <label
                className={styles.dropzone}
                data-drag={dragOver ? 'over' : 'idle'}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault()
                  setDragOver(false)
                  pickFile(e.dataTransfer.files?.[0])
                }}
              >
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className={styles.fileInput}
                  onChange={e => pickFile(e.target.files?.[0])}
                />
                <span className={styles.pdfGlyph}>
                  <svg viewBox="0 0 20 20" width="24" height="24" fill="currentColor" aria-hidden="true">
                    <path d="M5 1.5h7L16 5.5v12A1.5 1.5 0 0114.5 19h-9A1.5 1.5 0 014 17.5v-14A1.5 1.5 0 015.5 1.5z" />
                    <path d="M11.5 1.5V6h4.5" opacity="0.35" />
                  </svg>
                  <span className={styles.pdfGlyphTag}>PDF</span>
                </span>
                <span className={styles.dropText}>
                  {dragOver ? 'Drop to attach the label PDF' : 'Drop a label PDF here, or click to browse'}
                </span>
                <span className={styles.dropHint}>
                  PDF only · max {MAX_PDF_BYTES / 1024 / 1024} MB
                </span>
              </label>

              {file && (
                <div className={styles.fileRow}>
                  <Icon name="inventory" size={15} className={styles.fileRowIcon} />
                  <span className={styles.fileName} title={file.name}>{file.name}</span>
                  <span className={styles.fileSize}>{fmtBytes(file.size)}</span>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => { setFile(null); setUploadError(null) }}
                  >
                    Remove
                  </button>
                </div>
              )}

              {uploadError && <p className={styles.errorBanner}>{uploadError}</p>}

              <div className={styles.actions}>
                <button type="button" className={styles.btnGhost} onClick={handleClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={!file || uploading}
                  onClick={handleUpload}
                >
                  {uploading ? 'Uploading…' : 'Upload & Continue'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2 — Extract ── */}
          {step === 1 && (
            <div className={styles.stepPane}>
              {attachment && (
                <div className={styles.fileRow}>
                  <Icon name="inventory" size={15} className={styles.fileRowIcon} />
                  <span className={styles.fileCol}>
                    <span className={styles.fileName} title={attachment.fileName || 'Label PDF'}>
                      {attachment.fileName || 'Label PDF'}
                    </span>
                    {uploadedAt && (
                      <span className={styles.fileMeta}>Uploaded {fmtTime(uploadedAt)}</span>
                    )}
                  </span>
                  <a
                    className={styles.linkBtn}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View PDF ↗
                  </a>
                </div>
              )}

              {extracting && (
                <div className={styles.scanRow}>
                  <span className={styles.scanIcon} data-busy="yes">
                    <Icon name="scan" size={18} />
                  </span>
                  <span>Analyzing label PDF…</span>
                </div>
              )}

              {extractError && (
                <p className={styles.errorBanner}>Extraction request failed: {extractError}</p>
              )}

              {!extracting && extractResult && !extractResult.configured && (
                <div className={styles.notice}>
                  <span className={styles.noticeIcon}>
                    <Icon name="scan" size={18} />
                  </span>
                  <div>
                    <p className={styles.noticeTitle}>AI extraction not configured yet</p>
                    <p className={styles.noticeBody}>
                      {extractResult.message ||
                        'Automatic label reading is not available. You can enter the label details manually in the next step.'}
                    </p>
                  </div>
                </div>
              )}

              {!extracting && extractResult?.configured && (
                <div className={styles.notice} data-tone="ok">
                  <span className={styles.noticeIcon} data-tone="ok">
                    <Icon name="scan" size={18} />
                  </span>
                  <div>
                    <p className={styles.noticeTitle}>Draft extracted</p>
                    <p className={styles.noticeBody}>
                      Review every field on the next step — AI extraction may be incomplete.
                    </p>
                  </div>
                </div>
              )}

              {!extracting && (
                <p className={styles.warnBanner}>
                  <span className={styles.warnDot}>!</span>
                  Review label information before saving. AI extraction may be incomplete.
                </p>
              )}

              <div className={styles.actions}>
                <button type="button" className={styles.btnGhost} onClick={handleClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={extracting || (!extractResult && !extractError)}
                  onClick={goToReview}
                >
                  Continue to Review
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3 — Review & Save ── */}
          {step === 2 && (
            <div className={styles.stepPane}>
              <p className={styles.warnBanner}>
                <span className={styles.warnDot}>!</span>
                Review label information before saving. AI extraction may be incomplete —
                nothing is saved until you click Save.
              </p>

              <Section icon="chemical" title="Product Information">
                <Field label="Product Name *" wide>
                  <input
                    className={styles.input}
                    value={form.name}
                    onChange={e => setField('name', e.target.value)}
                    placeholder="e.g. Daconil Action"
                  />
                </Field>
                <Field label="Kind">
                  <select
                    className={styles.input}
                    value={form.kind}
                    onChange={e => setField('kind', e.target.value)}
                  >
                    <option value="chemical">Chemical</option>
                    <option value="fertilizer">Fertilizer</option>
                  </select>
                </Field>
                <Field
                  label="Category"
                  hint={form.kind === 'fertilizer' ? 'e.g. Granular, Liquid' : 'Fungicide, Herbicide, Insecticide, PGR'}
                >
                  <input
                    className={styles.input}
                    list="chem-category-list"
                    value={form.category}
                    onChange={e => setField('category', e.target.value)}
                    placeholder={form.kind === 'fertilizer' ? 'e.g. Granular' : 'e.g. Fungicide'}
                  />
                  <datalist id="chem-category-list">
                    {CHEM_CATEGORIES.map(c => <option key={c} value={c} />)}
                  </datalist>
                </Field>
                <Field label="Manufacturer">
                  <input
                    className={styles.input}
                    value={form.manufacturer}
                    onChange={e => setField('manufacturer', e.target.value)}
                    placeholder="e.g. Syngenta"
                  />
                </Field>
                <Field
                  label="Active Ingredients"
                  wide
                  hint="As listed on the label, e.g. Chlorothalonil 54%"
                >
                  <input
                    className={styles.input}
                    value={form.activeIngredients}
                    onChange={e => setField('activeIngredients', e.target.value)}
                    placeholder="e.g. Chlorothalonil 54%, Acibenzolar-S-methyl 0.5%"
                  />
                </Field>
                <Field label="Chemical Class">
                  <input
                    className={styles.input}
                    value={form.chemicalClass}
                    onChange={e => setField('chemicalClass', e.target.value)}
                    placeholder="e.g. Chloronitrile"
                  />
                </Field>
                {form.kind === 'fertilizer' && (
                  <>
                    <Field label="Analysis (N-P-K)">
                      <input
                        className={styles.input}
                        value={form.analysis}
                        onChange={e => setField('analysis', e.target.value)}
                        placeholder="e.g. 18-3-6"
                      />
                    </Field>
                    <Field label="Nitrogen Source">
                      <input
                        className={styles.input}
                        value={form.nitrogenSource}
                        onChange={e => setField('nitrogenSource', e.target.value)}
                        placeholder="e.g. Urea, SCU"
                      />
                    </Field>
                  </>
                )}
              </Section>

              <Section icon="disease" title="Regulatory Information">
                <Field label="EPA Registration #">
                  <input
                    className={styles.input}
                    value={form.epaNumber}
                    onChange={e => setField('epaNumber', e.target.value)}
                    placeholder="e.g. 100-1364"
                  />
                </Field>
                <Field label="Signal Word">
                  <select
                    className={styles.input}
                    value={form.signalWord}
                    onChange={e => setField('signalWord', e.target.value)}
                  >
                    {SIGNAL_WORDS.map(w => (
                      <option key={w} value={w}>{w || '—'}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Re-Entry Interval (REI)"
                  hint="Hours before re-entry is allowed"
                >
                  <input
                    className={styles.input}
                    value={form.reiHours}
                    onChange={e => setField('reiHours', e.target.value)}
                    placeholder="e.g. 12 hours"
                  />
                </Field>
                <Field label="PHI" hint="Pre-harvest interval, if listed">
                  <input
                    className={styles.input}
                    value={form.phi}
                    onChange={e => setField('phi', e.target.value)}
                    placeholder="e.g. 0 days"
                  />
                </Field>
                <Field label="Restricted Use" wide>
                  <label className={styles.checkRow}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={form.restrictedUse}
                      onChange={e => setField('restrictedUse', e.target.checked)}
                    />
                    <span>Restricted-use pesticide (RUP)</span>
                  </label>
                </Field>
              </Section>

              <Section icon="spray" title="Application Information">
                <Field
                  label="Application / Rate Notes"
                  wide
                  hint="One rate per line"
                >
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={form.applicationRatesText}
                    onChange={e => setField('applicationRatesText', e.target.value)}
                    placeholder={'e.g. 1.4 oz / 1000 sq ft\n3.6 oz / 1000 sq ft (curative)'}
                  />
                </Field>
                <Field
                  label="Target Pests / Diseases / Weeds"
                  wide
                  hint="One target per line"
                >
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={form.targetsText}
                    onChange={e => setField('targetsText', e.target.value)}
                    placeholder={'e.g. Dollar spot\nBrown patch\nPythium blight'}
                  />
                </Field>
                <Field label="Turf Sites" wide hint="Where the product is registered for use">
                  <input
                    className={styles.input}
                    value={form.turfSites}
                    onChange={e => setField('turfSites', e.target.value)}
                    placeholder="e.g. Greens, Tees, Fairways"
                  />
                </Field>
              </Section>

              <Section icon="inventory" title="Inventory Information">
                <Field label="Unit">
                  <input
                    className={styles.input}
                    value={form.unit}
                    onChange={e => setField('unit', e.target.value)}
                    placeholder="e.g. gal, lb, oz"
                  />
                </Field>
                <Field label="Quantity">
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    value={form.quantity}
                    onChange={e => setField('quantity', e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <Field label="Reorder Level">
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    value={form.reorderLevel}
                    onChange={e => setField('reorderLevel', e.target.value)}
                    placeholder="e.g. 2"
                  />
                </Field>
                <Field label="Cost / Unit">
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.costPerUnit}
                    onChange={e => setField('costPerUnit', e.target.value)}
                    placeholder="e.g. 89.50"
                  />
                </Field>
                <Field label="Expiry Date">
                  <input
                    className={styles.input}
                    value={form.expiryDate}
                    onChange={e => setField('expiryDate', e.target.value)}
                    placeholder="YYYY-MM-DD"
                  />
                </Field>
                <Field label="Notes" wide>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={form.notes}
                    onChange={e => setField('notes', e.target.value)}
                    placeholder="Operational notes — storage location, handling reminders…"
                  />
                </Field>
              </Section>

              <Section icon="settings" title="Optional Advanced Details">
                <Field label="FRAC Group" hint="Fungicide resistance code">
                  <input
                    className={styles.input}
                    value={form.fracGroup}
                    onChange={e => setField('fracGroup', e.target.value)}
                    placeholder="e.g. 3, 11, M5"
                  />
                </Field>
                <Field label="HRAC Group" hint="Herbicide resistance code">
                  <input
                    className={styles.input}
                    value={form.hracGroup}
                    onChange={e => setField('hracGroup', e.target.value)}
                    placeholder="e.g. 2, 4, 9"
                  />
                </Field>
                <Field label="IRAC Group" hint="Insecticide resistance code">
                  <input
                    className={styles.input}
                    value={form.iracGroup}
                    onChange={e => setField('iracGroup', e.target.value)}
                    placeholder="e.g. 1A, 4A"
                  />
                </Field>
                <Field label="Safety Notes" wide>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={form.safetyNotes}
                    onChange={e => setField('safetyNotes', e.target.value)}
                    placeholder="PPE, handling precautions…"
                  />
                </Field>
                <Field label="Storage / Disposal Notes" wide>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={form.storageNotes}
                    onChange={e => setField('storageNotes', e.target.value)}
                    placeholder="Temperature limits, container disposal…"
                  />
                </Field>
                <Field label="Label URL / Source" wide>
                  <input
                    className={styles.input}
                    value={form.labelUrl}
                    onChange={e => setField('labelUrl', e.target.value)}
                    placeholder="https://…"
                  />
                </Field>
              </Section>

              {saveError && <p className={styles.errorBanner}>{saveError}</p>}

              {/* Duplicate handling */}
              {duplicate && (
                <div className={styles.dupNotice}>
                  <div className={styles.dupHead}>
                    <span className={styles.dupBadge}>Possible duplicate</span>
                  </div>
                  <p className={styles.noticeBody}>{duplicate.message}</p>

                  <div className={styles.dupCard}>
                    <p className={styles.dupCardTitle}>
                      Existing item · {duplicate.existing?.name}
                    </p>
                    <div className={styles.dupRows}>
                      {DUP_FIELDS.map(([label, exKey, formKey]) => {
                        const exVal = duplicate.existing?.[exKey]
                        const newVal = form[formKey]
                        const exStr  = exVal == null || exVal === '' ? '—' : String(exVal)
                        const newStr = newVal == null || String(newVal).trim() === ''
                          ? '—' : String(newVal).trim()
                        const changed = exStr !== newStr
                        return (
                          <div key={label} className={styles.dupRow} data-changed={changed ? 'yes' : 'no'}>
                            <span className={styles.dupRowLabel}>{label}</span>
                            <span className={styles.dupRowOld}>{exStr}</span>
                            {changed && (
                              <>
                                <span className={styles.dupRowArrow}>→</span>
                                <span className={styles.dupRowNew}>{newStr}</span>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className={styles.dupActions}>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      disabled={saving}
                      onClick={() => setDuplicate(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      disabled={saving}
                      onClick={() => doSave('create')}
                    >
                      Save as Duplicate
                    </button>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={saving}
                      onClick={() => doSave('update')}
                    >
                      Update Existing
                    </button>
                  </div>
                </div>
              )}

              {!duplicate && (
                <div className={styles.actions}>
                  <button type="button" className={styles.btnGhost} onClick={handleClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={saving || !form.name.trim()}
                    onClick={() => doSave('check')}
                  >
                    {saving ? 'Saving…' : 'Save to Inventory'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Saving overlay */}
        {saving && (
          <div className={styles.savingOverlay}>
            <span className={styles.spinner} />
            <span className={styles.savingText}>Saving to inventory…</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Section({ icon, title, children }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <Icon name={icon} size={14} />
        </span>
        <span className={styles.sectionTitle}>{title}</span>
      </div>
      <div className={styles.grid}>{children}</div>
    </section>
  )
}

function Field({ label, wide, hint, children }) {
  return (
    <div className={wide ? styles.fieldWide : styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint && <span className={styles.fieldHint}>{hint}</span>}
    </div>
  )
}
