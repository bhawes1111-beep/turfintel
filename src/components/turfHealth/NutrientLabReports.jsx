import { useMemo, useRef, useState } from 'react'
import { NUTRIENTS, nutrientLabel } from '../../utils/inventory/nutrientForms'
import {
  approveNutrientReport,
  deleteNutrientReport,
  uploadNutrientReport,
  useNutrientReportImportsData,
} from '../../utils/turfHealth/nutrientReportImportsStore'
import {
  LAB_ANALYTES,
  RATINGS,
  RESULT_UNITS,
  blankLabRecommendation,
  blankLabResult,
} from '../../utils/turfHealth/nutrientSampleOptions'
import { useToast } from '../../utils/feedback/toastContext'
import styles from './NutrientSamples.module.css'

function dateLabel(value) {
  if (!value) return 'Needs review'
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function editableDraft(report) {
  const draft = report?.draft ?? {}
  return {
    sampleType: report?.sampleType || draft.sampleType || 'soil',
    sampleDate: draft.sampleDate || '',
    location: draft.location || '',
    areaType: draft.areaType || '',
    labName: draft.labName || '',
    labSampleId: draft.labSampleId || '',
    depthInches: draft.depthInches ?? '',
    results: draft.results?.length ? draft.results.map(row => ({ ...row })) : [blankLabResult()],
    recommendations: draft.recommendations?.map(row => ({ ...row })) ?? [],
    notes: draft.notes || '',
  }
}

export default function NutrientLabReports({ canEdit, onApproved }) {
  const toast = useToast()
  const fileInput = useRef(null)
  const { imports, loading, error } = useNutrientReportImportsData()
  const [sampleType, setSampleType] = useState('soil')
  const [uploading, setUploading] = useState(false)
  const [reviewing, setReviewing] = useState(null)
  const pending = useMemo(() => imports.filter(item => item.status === 'pending'), [imports])
  const approved = useMemo(() => imports.filter(item => item.status === 'approved'), [imports])

  async function chooseFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf') {
      toast.info('Choose a PDF lab report')
      return
    }
    setUploading(true)
    try {
      const saved = await uploadNutrientReport(file, sampleType)
      toast.success('Lab report uploaded for review')
      setReviewing(saved)
    } catch (uploadError) {
      toast.error(uploadError.message)
    } finally {
      setUploading(false)
    }
  }

  async function remove(report) {
    if (!window.confirm(`Delete the pending report ${report.fileName || ''}?`)) return
    try {
      await deleteNutrientReport(report.id)
      toast.success('Pending report deleted')
    } catch (deleteError) {
      toast.error(deleteError.message)
    }
  }

  return (
    <section className={styles.importPanel} aria-labelledby="lab-report-heading">
      <div className={styles.importHeader}>
        <div>
          <span className={styles.eyebrow}>Lab report inbox</span>
          <h2 id="lab-report-heading">Soil &amp; Tissue PDFs</h2>
          <p>Upload a report, verify the extracted values, then approve it for nutrient planning.</p>
        </div>
        <div className={styles.importCounts} aria-label="Lab report totals">
          <span><b>{pending.length}</b> pending</span>
          <span><b>{approved.length}</b> approved</span>
        </div>
      </div>

      {canEdit && (
        <div className={styles.uploadBar}>
          <div className={styles.segmented} aria-label="Uploaded sample type">
            {['soil', 'tissue'].map(value => (
              <button key={value} type="button" className={sampleType === value ? styles.active : ''} onClick={() => setSampleType(value)}>
                {value === 'soil' ? 'Soil report' : 'Tissue report'}
              </button>
            ))}
          </div>
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={chooseFile} />
          <button type="button" className={styles.primary} disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? 'Uploading...' : 'Upload PDF'}
          </button>
        </div>
      )}

      {error && <p className={styles.error}>Unable to load lab reports: {error}</p>}
      {loading && imports.length === 0 && <p className={styles.emptyRows}>Loading lab reports...</p>}
      {!loading && imports.length === 0 && <p className={styles.importEmpty}>No lab reports uploaded yet.</p>}
      {imports.length > 0 && (
        <div className={styles.importList}>
          {imports.map(report => (
            <article key={report.id} className={styles.importRow}>
              <span className={`${styles.importStatus} ${report.status === 'approved' ? styles.importApproved : styles.importPending}`}>
                {report.status}
              </span>
              <span className={styles.importIdentity}>
                <strong>{report.fileName || 'Lab report PDF'}</strong>
                <small>{report.sampleType} / {dateLabel(report.draft?.sampleDate)}{report.draft?.location ? ` / ${report.draft.location}` : ''}</small>
              </span>
              <span className={styles.importResultCount}>{report.draft?.results?.length ?? 0} values</span>
              <div className={styles.importActions}>
                <a href={report.pdfUrl} target="_blank" rel="noreferrer">View PDF</a>
                {report.status === 'pending' && canEdit && <button type="button" onClick={() => setReviewing(report)}>Review</button>}
                {report.status === 'pending' && canEdit && <button type="button" className={styles.remove} onClick={() => remove(report)}>Delete</button>}
                {report.status === 'approved' && report.approvedSampleId && (
                  <button type="button" onClick={() => onApproved?.(report.approvedSampleId)}>Show analysis</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {reviewing && (
        <LabReportReview
          report={reviewing}
          onClose={() => setReviewing(null)}
          onApproved={sampleId => {
            setReviewing(null)
            onApproved?.(sampleId)
          }}
        />
      )}
    </section>
  )
}

function LabReportReview({ report, onClose, onApproved }) {
  const toast = useToast()
  const [form, setForm] = useState(() => editableDraft(report))
  const [saving, setSaving] = useState(false)
  const patch = values => setForm(current => ({ ...current, ...values }))
  const patchRow = (field, index, values) => patch({
    [field]: form[field].map((row, rowIndex) => rowIndex === index ? { ...row, ...values } : row),
  })
  const removeRow = (field, index) => patch({
    [field]: form[field].filter((_, rowIndex) => rowIndex !== index),
  })

  async function approve() {
    if (!form.sampleDate) { toast.info('Sample date is required'); return }
    if (!form.location.trim()) { toast.info('Location is required'); return }
    if (!form.results.some(row => row.value !== '')) { toast.info('Add at least one measured lab value'); return }
    setSaving(true)
    try {
      const result = await approveNutrientReport(report.id, {
        ...form,
        results: form.results.filter(row => row.value !== ''),
        recommendations: form.recommendations.filter(row => row.rateLbPer1000 !== ''),
      })
      toast.success('Lab report approved and added to nutrient samples')
      onApproved(result.sampleId)
    } catch (approvalError) {
      toast.error(approvalError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div className={`${styles.modal} ${styles.importModal}`} role="dialog" aria-modal="true" aria-label="Review nutrient lab report">
        <header>
          <div>
            <h2>Review Lab Report</h2>
            <p>{report.fileName || 'Uploaded PDF'} / verify all values before approval.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">x</button>
        </header>
        <div className={styles.modalBody}>
          <div className={styles.extractionNotice}>
            <div><strong>Extraction check</strong><p>{report.extractionNote || 'Review the imported values against the original report.'}</p></div>
            <a href={report.pdfUrl} target="_blank" rel="noreferrer">Open source PDF</a>
          </div>

          <fieldset>
            <legend>Sample</legend>
            <div className={styles.grid}>
              <label>Type<select value={form.sampleType} onChange={event => patch({ sampleType: event.target.value })}><option value="soil">Soil</option><option value="tissue">Tissue</option></select></label>
              <label>Date<input type="date" value={form.sampleDate} onChange={event => patch({ sampleDate: event.target.value })} /></label>
              <label className={styles.wide}>Location<input value={form.location} onChange={event => patch({ location: event.target.value })} placeholder="Green 4, Fairways, Practice Green..." /></label>
              <label>Area type<input value={form.areaType} onChange={event => patch({ areaType: event.target.value })} placeholder="Green, tee, fairway..." /></label>
              {form.sampleType === 'soil' && <label>Depth (inches)<input type="number" min="0" step="0.25" value={form.depthInches} onChange={event => patch({ depthInches: event.target.value })} /></label>}
              <label>Lab<input value={form.labName} onChange={event => patch({ labName: event.target.value })} /></label>
              <label>Lab sample ID<input value={form.labSampleId} onChange={event => patch({ labSampleId: event.target.value })} /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Measured Results <button type="button" onClick={() => patch({ results: [...form.results, blankLabResult()] })}>+ Result</button></legend>
            <p className={styles.help}>Compare every extracted value and unit with the PDF. Blank or scanned reports can be entered manually.</p>
            {form.results.map((row, index) => (
              <LabResultRow key={index} row={row} onChange={values => patchRow('results', index, values)} onRemove={() => removeRow('results', index)} />
            ))}
          </fieldset>

          <fieldset>
            <legend>Lab Recommendations <button type="button" onClick={() => patch({ recommendations: [...form.recommendations, blankLabRecommendation()] })}>+ Recommendation</button></legend>
            <p className={styles.help}>Approved nutrient rates become selectable in the Applications builder.</p>
            {form.recommendations.length === 0 && <p className={styles.emptyRows}>No application recommendations entered.</p>}
            {form.recommendations.map((row, index) => (
              <LabRecommendationRow key={index} row={row} onChange={values => patchRow('recommendations', index, values)} onRemove={() => removeRow('recommendations', index)} />
            ))}
          </fieldset>

          <fieldset><legend>Notes</legend><textarea rows="4" value={form.notes} onChange={event => patch({ notes: event.target.value })} placeholder="Lab comments, sampling conditions, follow-up..." /></fieldset>
        </div>
        <footer>
          <a className={styles.footerLink} href={report.pdfUrl} target="_blank" rel="noreferrer">View PDF</a>
          <span />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primary} disabled={saving} onClick={approve}>{saving ? 'Approving...' : 'Approve Sample'}</button>
        </footer>
      </div>
    </div>
  )
}

function LabResultRow({ row, onChange, onRemove }) {
  return (
    <div className={styles.dataRow}>
      <label>Measurement<select value={row.nutrient} onChange={event => onChange({ nutrient: event.target.value })}>{LAB_ANALYTES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Value<input type="number" step="any" value={row.value} onChange={event => onChange({ value: event.target.value })} /></label>
      <label>Unit<select value={row.unit} onChange={event => onChange({ unit: event.target.value })}>{RESULT_UNITS.map(unit => <option key={unit}>{unit}</option>)}</select></label>
      <label>Rating<select value={row.rating} onChange={event => onChange({ rating: event.target.value })}>{RATINGS.map(value => <option key={value} value={value}>{value ? `${value[0].toUpperCase()}${value.slice(1)}` : 'Not rated'}</option>)}</select></label>
      <button type="button" className={styles.remove} onClick={onRemove}>Remove</button>
    </div>
  )
}

function LabRecommendationRow({ row, onChange, onRemove }) {
  return (
    <div className={`${styles.dataRow} ${styles.recommendationRow}`}>
      <label>Nutrient<select value={row.nutrient} onChange={event => onChange({ nutrient: event.target.value })}>{NUTRIENTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Rate (lb nutrient / 1,000 sq ft)<input type="number" min="0" step="0.001" value={row.rateLbPer1000} onChange={event => onChange({ rateLbPer1000: event.target.value })} /></label>
      <label className={styles.note}>Lab note<input value={row.note || ''} onChange={event => onChange({ note: event.target.value })} placeholder={`${nutrientLabel(row.nutrient)} recommendation`} /></label>
      <button type="button" className={styles.remove} onClick={onRemove}>Remove</button>
    </div>
  )
}
