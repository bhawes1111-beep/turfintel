import { useMemo, useState } from 'react'
import { NUTRIENTS, nutrientLabel } from '../../utils/inventory/nutrientForms'
import {
  useNutrientSamplesData,
  createNutrientSample,
  updateNutrientSample,
  deleteNutrientSample,
} from '../../utils/turfHealth/nutrientSamplesStore'
import { useToast } from '../../utils/feedback/toastContext'
import {
  LAB_ANALYTES,
  RATINGS,
  RESULT_UNITS,
  blankLabRecommendation,
  blankLabResult,
} from '../../utils/turfHealth/nutrientSampleOptions'
import NutrientBaselineDashboard from './NutrientBaselineDashboard'
import NutrientActionQueue from './NutrientActionQueue'
import NutrientLabReports from './NutrientLabReports'
import styles from './NutrientSamples.module.css'

const today = () => new Date().toISOString().slice(0, 10)

function emptySample(type = 'soil') {
  return {
    sampleType: type, sampleDate: today(), location: '', areaType: '', labName: '',
    labSampleId: '', depthInches: '', previousSampleId: '', nextSampleDate: '', results: [blankLabResult()],
    recommendations: [], notes: '',
  }
}

function displayDate(value) {
  if (!value) return 'No date'
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizedLocation(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function findFollowUpSample(samples, sample) {
  const later = samples
    .filter(candidate => candidate.id !== sample.id && String(candidate.sampleDate ?? '') >= String(sample.sampleDate ?? ''))
    .sort((a, b) => String(a.sampleDate ?? '').localeCompare(String(b.sampleDate ?? '')))
  return later.find(candidate => String(candidate.previousSampleId ?? '') === String(sample.id))
    ?? later.find(candidate => (
      !candidate.previousSampleId
      && candidate.sampleType === sample.sampleType
      && normalizedLocation(candidate.location) === normalizedLocation(sample.location)
    ))
    ?? null
}

function followUpStatus(samples, sample) {
  const followUp = findFollowUpSample(samples, sample)
  if (followUp) return { label: `Retested ${displayDate(followUp.sampleDate)}`, tone: 'complete' }
  if (!sample.nextSampleDate) return null
  const currentDate = today()
  if (sample.nextSampleDate < currentDate) return { label: `Retest overdue ${displayDate(sample.nextSampleDate)}`, tone: 'overdue' }
  if (sample.nextSampleDate === currentDate) return { label: 'Retest due today', tone: 'due' }
  return { label: `Retest ${displayDate(sample.nextSampleDate)}`, tone: 'upcoming' }
}

export default function NutrientSamples({ canEdit, onStartApplication, initialSampleId = '' }) {
  const { samples, loading, error } = useNutrientSamplesData()
  const [type, setType] = useState('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [selectedSampleId, setSelectedSampleId] = useState(initialSampleId)
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase()
    return samples.filter(sample => {
      if (type !== 'all' && sample.sampleType !== type) return false
      if (!search) return true
      return [sample.location, sample.labName, sample.labSampleId, sample.notes]
        .filter(Boolean).join(' ').toLowerCase().includes(search)
    })
  }, [samples, type, query])
  const retestsDue = useMemo(() => samples.filter(sample => {
    const status = followUpStatus(samples, sample)
    return status?.tone === 'due' || status?.tone === 'overdue'
  }).length, [samples])

  function openSample(sample) {
    setSelectedSampleId(sample.id)
    setEditing(sample)
  }

  function startFollowUp(sample) {
    setSelectedSampleId(sample.id)
    setEditing({
      ...emptySample(sample.sampleType),
      previousSampleId: sample.id,
      location: sample.location,
      areaType: sample.areaType ?? '',
      labName: sample.labName ?? '',
      depthInches: sample.depthInches ?? '',
    })
  }

  return (
    <section className={styles.workspace}>
      <NutrientLabReports canEdit={canEdit} onApproved={setSelectedSampleId} />
      {samples.length > 0 && <NutrientActionQueue samples={samples} canEdit={canEdit} onOpenSample={openSample} onStartApplication={onStartApplication} />}
      {samples.length > 0 && <NutrientBaselineDashboard samples={samples} selectedId={selectedSampleId} onSelect={setSelectedSampleId} />}
      <div className={styles.toolbar}>
        <div className={styles.controls}>
          <div className={styles.segmented} aria-label="Sample type filter">
            {['all', 'soil', 'tissue'].map(value => (
              <button key={value} type="button" className={type === value ? styles.active : ''} onClick={() => setType(value)}>
                {value === 'all' ? 'All samples' : `${value[0].toUpperCase()}${value.slice(1)}`}
              </button>
            ))}
          </div>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search location, lab, or sample ID..." />
        </div>
        {canEdit && <button type="button" className={styles.primary} onClick={() => setEditing(emptySample(type === 'tissue' ? 'tissue' : 'soil'))}>+ New Sample</button>}
      </div>

      <div className={styles.summary}>
        <div><strong>{samples.filter(s => s.sampleType === 'soil').length}</strong><span>Soil samples</span></div>
        <div><strong>{samples.filter(s => s.sampleType === 'tissue').length}</strong><span>Tissue samples</span></div>
        <div><strong>{samples.reduce((sum, s) => sum + (s.recommendations?.length ?? 0), 0)}</strong><span>Lab recommendations</span></div>
        <div><strong>{retestsDue}</strong><span>Retests due</span></div>
      </div>

      {error && <p className={styles.error}>Unable to load samples: {error}</p>}
      {loading && samples.length === 0 && <p className={styles.empty}>Loading nutrient samples...</p>}
      {!loading && visible.length === 0 && <p className={styles.empty}>No matching soil or tissue samples yet.</p>}
      <div className={styles.list}>
        {visible.map(sample => {
          const status = followUpStatus(samples, sample)
          return <article key={sample.id} className={styles.card}>
            <div className={styles.cardTop}>
              <button type="button" className={styles.cardMain} onClick={() => openSample(sample)}>
                <span className={`${styles.typeBadge} ${styles[sample.sampleType]}`}>{sample.sampleType}</span>
                <span className={styles.identity}><strong>{sample.location}</strong><small>{displayDate(sample.sampleDate)}{sample.labName ? ` / ${sample.labName}` : ''}</small></span>
                <span className={styles.resultCount}>{sample.results?.length ?? 0} results</span>
                <span className={styles.recommendationCount}>{sample.recommendations?.length ?? 0} recommendations</span>
                {status && <span className={`${styles.followUpBadge} ${styles[`followUp${status.tone[0].toUpperCase()}${status.tone.slice(1)}`]}`}>{status.label}</span>}
              </button>
              <div className={styles.cardActions}>
                {canEdit && onStartApplication && <button type="button" className={styles.sourcePdf} onClick={() => onStartApplication(sample)}>Start Application</button>}
                {canEdit && <button type="button" className={styles.sourcePdf} onClick={() => startFollowUp(sample)}>Add Follow-Up</button>}
                {sample.sourcePdfUrl && <a className={styles.sourcePdf} href={sample.sourcePdfUrl} target="_blank" rel="noreferrer">View PDF</a>}
              </div>
            </div>
            <div className={styles.chips}>
              {(sample.results ?? []).slice(0, 6).map((result, index) => (
                <span key={`${result.nutrient}-${index}`}><b>{result.nutrient}</b> {result.value} {result.unit}{result.rating ? ` / ${result.rating}` : ''}</span>
              ))}
            </div>
          </article>
        })}
      </div>
      {editing && <SampleEditor sample={editing} samples={samples} canEdit={canEdit} onClose={() => setEditing(null)} />}
    </section>
  )
}

function SampleEditor({ sample, samples, canEdit, onClose }) {
  const toast = useToast()
  const [form, setForm] = useState(() => ({ ...emptySample(sample.sampleType), ...sample, results: sample.results?.length ? sample.results : [blankLabResult()], recommendations: sample.recommendations ?? [] }))
  const [saving, setSaving] = useState(false)
  const isExisting = Boolean(sample.id)
  const patch = values => setForm(current => ({ ...current, ...values }))
  const patchRow = (field, index, values) => patch({ [field]: form[field].map((row, rowIndex) => rowIndex === index ? { ...row, ...values } : row) })
  const removeRow = (field, index) => patch({ [field]: form[field].filter((_, rowIndex) => rowIndex !== index) })
  const previousOptions = useMemo(() => samples
    .filter(candidate => (
      candidate.id !== sample.id
      && candidate.sampleType === form.sampleType
      && String(candidate.sampleDate ?? '') < String(form.sampleDate ?? '')
    ))
    .sort((a, b) => String(b.sampleDate ?? '').localeCompare(String(a.sampleDate ?? ''))), [samples, sample.id, form.sampleType, form.sampleDate])

  async function save() {
    if (!form.location.trim()) { toast.info('Location is required'); return }
    if (!form.sampleDate) { toast.info('Sample date is required'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        results: form.results.filter(row => row.value !== ''),
        recommendations: form.recommendations.filter(row => row.rateLbPer1000 !== ''),
      }
      if (isExisting) await updateNutrientSample(sample.id, payload)
      else await createNutrientSample(payload)
      toast.success(isExisting ? 'Sample updated' : 'Sample saved')
      onClose()
    } catch (error) { toast.error(error.message) } finally { setSaving(false) }
  }

  async function remove() {
    if (!window.confirm(`Delete this ${form.sampleType} sample?`)) return
    try { await deleteNutrientSample(sample.id); toast.success('Sample deleted'); onClose() }
    catch (error) { toast.error(error.message) }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={`${isExisting ? 'Edit' : 'New'} nutrient sample`}>
        <header><div><h2>{isExisting ? 'Nutrient Sample' : 'New Nutrient Sample'}</h2><p>Record lab results and application-ready recommendations.</p></div><button type="button" onClick={onClose} aria-label="Close">x</button></header>
        <div className={styles.modalBody}>
          {sample.sourcePdfUrl && <div className={styles.extractionNotice}><div><strong>Original lab report</strong><p>This approved sample remains linked to its source PDF.</p></div><a href={sample.sourcePdfUrl} target="_blank" rel="noreferrer">View PDF</a></div>}
          <fieldset disabled={!canEdit}>
            <legend>Sample</legend>
            <div className={styles.grid}>
              <label>Type<select value={form.sampleType} onChange={e => patch({ sampleType: e.target.value })}><option value="soil">Soil</option><option value="tissue">Tissue</option></select></label>
              <label>Date<input type="date" value={form.sampleDate} onChange={e => patch({ sampleDate: e.target.value })} /></label>
              <label className={styles.wide}>Location<input value={form.location} onChange={e => patch({ location: e.target.value })} placeholder="Green 4, Fairways, Practice Green..." /></label>
              <label>Area type<input value={form.areaType ?? ''} onChange={e => patch({ areaType: e.target.value })} placeholder="Green, tee, fairway..." /></label>
              {form.sampleType === 'soil' && <label>Depth (inches)<input type="number" min="0" step="0.25" value={form.depthInches ?? ''} onChange={e => patch({ depthInches: e.target.value })} /></label>}
              <label>Lab<input value={form.labName ?? ''} onChange={e => patch({ labName: e.target.value })} /></label>
              <label>Lab sample ID<input value={form.labSampleId ?? ''} onChange={e => patch({ labSampleId: e.target.value })} /></label>
              <label>Follow-up to<select value={form.previousSampleId ?? ''} onChange={e => patch({ previousSampleId: e.target.value })}><option value="">Not a follow-up</option>{previousOptions.map(option => <option key={option.id} value={option.id}>{displayDate(option.sampleDate)} / {option.location}</option>)}</select></label>
              <label>Next test date<input type="date" min={form.sampleDate || undefined} value={form.nextSampleDate ?? ''} onChange={e => patch({ nextSampleDate: e.target.value })} /></label>
            </div>
          </fieldset>

          <fieldset disabled={!canEdit}>
            <legend>Measured Results <button type="button" onClick={() => patch({ results: [...form.results, blankLabResult()] })}>+ Result</button></legend>
            <p className={styles.help}>Enter values exactly as the laboratory reports them. These measurements do not directly set an application rate.</p>
            {form.results.map((row, index) => <ResultRow key={index} row={row} onChange={values => patchRow('results', index, values)} onRemove={() => removeRow('results', index)} />)}
          </fieldset>

          <fieldset disabled={!canEdit}>
            <legend>Lab Recommendations <button type="button" onClick={() => patch({ recommendations: [...form.recommendations, blankLabRecommendation()] })}>+ Recommendation</button></legend>
            <p className={styles.help}>Application rates entered here become selectable in the Applications builder.</p>
            {form.recommendations.length === 0 && <p className={styles.emptyRows}>No application recommendations entered.</p>}
            {form.recommendations.map((row, index) => <RecommendationRow key={index} row={row} onChange={values => patchRow('recommendations', index, values)} onRemove={() => removeRow('recommendations', index)} />)}
          </fieldset>

          <fieldset disabled={!canEdit}><legend>Notes</legend><textarea rows="4" value={form.notes ?? ''} onChange={e => patch({ notes: e.target.value })} placeholder="Sampling conditions, lab comments, follow-up..." /></fieldset>
        </div>
        <footer>{canEdit && isExisting && <button type="button" className={styles.danger} onClick={remove}>Delete</button>}<span /><button type="button" onClick={onClose}>{canEdit ? 'Cancel' : 'Close'}</button>{canEdit && <button type="button" className={styles.primary} disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Sample'}</button>}</footer>
      </div>
    </div>
  )
}

function NutrientSelect({ value, onChange }) {
  return <select value={value} onChange={onChange}>{NUTRIENTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
}

function LabAnalyteSelect({ value, onChange }) {
  return <select value={value} onChange={onChange}>{LAB_ANALYTES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
}

function ResultRow({ row, onChange, onRemove }) {
  return <div className={styles.dataRow}><label>Measurement<LabAnalyteSelect value={row.nutrient} onChange={e => onChange({ nutrient: e.target.value })} /></label><label>Value<input type="number" step="any" value={row.value} onChange={e => onChange({ value: e.target.value })} /></label><label>Unit<select value={row.unit} onChange={e => onChange({ unit: e.target.value })}>{RESULT_UNITS.map(unit => <option key={unit}>{unit}</option>)}</select></label><label>Rating<select value={row.rating} onChange={e => onChange({ rating: e.target.value })}>{RATINGS.map(value => <option key={value} value={value}>{value ? `${value[0].toUpperCase()}${value.slice(1)}` : 'Not rated'}</option>)}</select></label><button type="button" className={styles.remove} onClick={onRemove}>Remove</button></div>
}

function RecommendationRow({ row, onChange, onRemove }) {
  return <div className={`${styles.dataRow} ${styles.recommendationRow}`}><label>Nutrient<NutrientSelect value={row.nutrient} onChange={e => onChange({ nutrient: e.target.value })} /></label><label>Rate (lb nutrient / 1,000 sq ft)<input type="number" min="0" step="0.001" value={row.rateLbPer1000} onChange={e => onChange({ rateLbPer1000: e.target.value })} /></label><label className={styles.note}>Lab note<input value={row.note ?? ''} onChange={e => onChange({ note: e.target.value })} placeholder={`${nutrientLabel(row.nutrient)} recommendation`} /></label><button type="button" className={styles.remove} onClick={onRemove}>Remove</button></div>
}
