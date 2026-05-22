// Plant Nutrition — Applications tab.
//
// The real, D1-backed nutrient-tracking surface. Merges standalone nutrition
// records with fertilizer-spray-derived nutrients (live, deduped, source-
// tagged), shows seasonal totals + a log-application quick entry. Real data
// only; explainable totals via computeNutritionTotals.

import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  useNutritionData,
  createNutritionApplication,
  deleteNutritionApplication,
} from '../../../utils/nutrition/nutritionStore'
import { useSpraysData } from '../../../utils/sprays/spraysStore'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import {
  computeNutritionTotals,
  computeNpkLbs,
} from '../../../utils/nutrition/nutritionTotals'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from './NutritionApplications.module.css'

const todayIso = () => new Date().toISOString().slice(0, 10)
const seasonStart = () => `${new Date().getFullYear()}-01-01`

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Log Application modal ─────────────────────────────────────────────────
function LogModal({ onClose, inventory }) {
  const [form, setForm] = useState({
    applicationDate: todayIso(), area: '', productName: '', analysis: '',
    rate: '', unit: 'lb/1000sqft', areaAcres: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const toast = useToast()
  const ref = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Fertilizer products from inventory, for autofill of name + analysis.
  const fertProducts = useMemo(
    () => (inventory ?? []).filter(i => i.kind === 'fertilizer'),
    [inventory],
  )
  function pickProduct(id) {
    const p = fertProducts.find(x => x.id === id)
    if (p) setForm(f => ({ ...f, productName: p.name, analysis: p.analysis ?? '', productId: p.id }))
  }

  // Live N/P/K preview from the explainable calc.
  const preview = useMemo(
    () => computeNpkLbs({ analysis: form.analysis, rate: form.rate, unit: form.unit, acres: form.areaAcres, productName: form.productName || 'product' }),
    [form.analysis, form.rate, form.unit, form.areaAcres, form.productName],
  )

  async function handleSave() {
    if (!form.productName.trim()) { setError('Product is required.'); return }
    setSaving(true)
    setError(null)
    try {
      await createNutritionApplication({
        applicationDate: form.applicationDate,
        area:        form.area.trim() || null,
        productId:   form.productId ?? null,
        productName: form.productName.trim(),
        analysis:    form.analysis.trim() || null,
        rate:        form.rate !== '' ? Number(form.rate) : null,
        unit:        form.unit,
        areaAcres:   form.areaAcres !== '' ? Number(form.areaAcres) : null,
        nLb: preview.unknown ? null : preview.nLb,
        pLb: preview.unknown ? null : preview.pLb,
        kLb: preview.unknown ? null : preview.kLb,
        source: 'manual',
        notes: form.notes.trim() || null,
      })
      toast?.success?.('Nutrition application logged')
      onClose()
    } catch (err) {
      setError(err.message || 'Save failed')
      setSaving(false)
    }
  }

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Log nutrition application">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.mHeader}>
          <span className={styles.mTitle}>Log Nutrition Application</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className={styles.mBody}>
          {fertProducts.length > 0 && (
            <>
              <p className={styles.lbl}>Product (from inventory)</p>
              <select ref={ref} className={styles.input} onChange={e => pickProduct(e.target.value)} defaultValue="">
                <option value="">— pick or type below —</option>
                {fertProducts.map(p => <option key={p.id} value={p.id}>{p.name}{p.analysis ? ` (${p.analysis})` : ''}</option>)}
              </select>
            </>
          )}
          <p className={styles.lbl}>Product name</p>
          <input className={styles.input} value={form.productName} onChange={e => set('productName', e.target.value)} placeholder="e.g. Anderson 18-3-18" />

          <div className={styles.row2}>
            <div><p className={styles.lbl}>Analysis (N-P-K)</p><input className={styles.input} value={form.analysis} onChange={e => set('analysis', e.target.value)} placeholder="18-3-18" /></div>
            <div><p className={styles.lbl}>Date</p><input type="date" max={todayIso()} className={styles.input} value={form.applicationDate} onChange={e => set('applicationDate', e.target.value)} /></div>
          </div>
          <div className={styles.row3}>
            <div><p className={styles.lbl}>Rate</p><input type="number" step="0.01" inputMode="decimal" className={styles.input} value={form.rate} onChange={e => set('rate', e.target.value)} /></div>
            <div><p className={styles.lbl}>Unit</p>
              <select className={styles.input} value={form.unit} onChange={e => set('unit', e.target.value)}>
                <option>lb/1000sqft</option><option>oz/1000sqft</option><option>lb/acre</option><option>oz/acre</option>
              </select>
            </div>
            <div><p className={styles.lbl}>Acres</p><input type="number" step="0.1" inputMode="decimal" className={styles.input} value={form.areaAcres} onChange={e => set('areaAcres', e.target.value)} /></div>
          </div>
          <p className={styles.lbl}>Area</p>
          <input className={styles.input} value={form.area} onChange={e => set('area', e.target.value)} placeholder="e.g. Greens" />

          <div className={styles.preview}>
            {preview.unknown
              ? <span className={styles.previewMuted}>N/P/K total: needs analysis + rate + acres</span>
              : <span className={styles.previewVal}>Computes to: {preview.nLb} lb N · {preview.pLb} lb P · {preview.kLb} lb K</span>}
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </div>
        <div className={styles.mFooter}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Tab ────────────────────────────────────────────────────────────────────
export default function NutritionApplications() {
  const { applications: standalone, loading } = useNutritionData()
  const { records: sprays } = useSpraysData()
  const { items: inventory } = useInventoryData()
  const [logOpen, setLogOpen] = useState(false)
  const toast = useToast()

  const inventoryById = useMemo(() => {
    const m = {}
    for (const i of inventory ?? []) m[i.id] = i
    return m
  }, [inventory])

  const result = useMemo(
    () => computeNutritionTotals({ standalone, sprays, inventoryById, from: seasonStart(), to: todayIso() }),
    [standalone, sprays, inventoryById],
  )

  function handleDelete(id) {
    deleteNutritionApplication(id).then(() => toast?.success?.('Deleted')).catch(() => {})
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <span className={styles.headTitle}>Nutrient Applications · {new Date().getFullYear()} season</span>
        <button type="button" className={styles.logBtn} onClick={() => setLogOpen(true)}>+ Log Application</button>
      </div>

      {/* Seasonal totals */}
      <div className={styles.totalsRow}>
        <div className={styles.totalCard}><span className={styles.totalVal}>{result.totals.n}</span><span className={styles.totalLbl}>lb N</span></div>
        <div className={styles.totalCard}><span className={styles.totalVal}>{result.totals.p}</span><span className={styles.totalLbl}>lb P</span></div>
        <div className={styles.totalCard}><span className={styles.totalVal}>{result.totals.k}</span><span className={styles.totalLbl}>lb K</span></div>
        <div className={styles.totalCard}><span className={styles.totalVal}>{result.applications.length}</span><span className={styles.totalLbl}>applications</span></div>
      </div>

      {loading && standalone.length === 0 ? (
        <p className={styles.empty}>Loading nutrition applications…</p>
      ) : !result.hasData ? (
        <p className={styles.empty}>
          No nutrient applications yet this season. Tap <strong>Log Application</strong> for a granular/foliar
          feed, or apply a fertilizer via Spray Records — fertilizer sprays appear here automatically with
          a source link. Seasonal N-P-K totals build from real applications only.
        </p>
      ) : (
        <>
          <ul className={styles.list}>
            {result.applications.map(a => (
              <li key={a.id} className={styles.appRow}>
                <div className={styles.appMain}>
                  <span className={styles.appTop}>
                    <span className={styles.appProduct}>{a.productName}</span>
                    <span className={styles.appSource} data-source={a.source}>{a.source === 'spray' ? 'from spray' : 'manual'}</span>
                  </span>
                  <span className={styles.appMeta}>
                    {fmtDate(a.date)}{a.area ? ` · ${a.area}` : ''}{a.analysis ? ` · ${a.analysis}` : ''}
                  </span>
                  <span className={styles.appNpk}>{a.nLb} N · {a.pLb} P · {a.kLb} K (lb)</span>
                </div>
                {a.source === 'manual' && (
                  <button type="button" className={styles.delBtn} onClick={() => handleDelete(a.id)} aria-label="Delete">✕</button>
                )}
              </li>
            ))}
          </ul>
          {result.unknowns.length > 0 && (
            <p className={styles.unknownNote}>
              {result.unknowns.length} fertilizer application{result.unknowns.length !== 1 ? 's' : ''} couldn't be
              totaled (missing analysis, rate, or acreage) — not counted.
            </p>
          )}
        </>
      )}

      {logOpen && <LogModal onClose={() => setLogOpen(false)} inventory={inventory} />}
    </div>
  )
}
