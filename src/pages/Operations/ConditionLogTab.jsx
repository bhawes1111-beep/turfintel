// Course Condition Log — superintendent's structured daily field log.
//
// Three parts: (1) a live CONTEXT panel (weather / water-balance / moisture
// — read from existing stores, not duplicated), (2) the day's structured
// editor (rating chips + section notes, upsert one-per-date), (3) historical
// review by date. Mobile-first; large tap targets; minimal typing.

import { useEffect, useMemo, useState } from 'react'
import {
  useConditionLogs,
  saveConditionLog,
  fetchConditionLogByDate,
} from '../../utils/conditionLog/conditionLogStore'
import { useWeather } from '../../utils/weather/useWeather'
import { useWaterBalance } from '../../utils/irrigation/waterBalanceStore'
import { useMoistureData } from '../../utils/moisture/moistureStore'
import { computeWaterBalance } from '../../utils/irrigation/waterBalance'
import { computeMoistureIntel } from '../../utils/moisture/moistureIntel'
import { useToast } from '../../utils/feedback/toastContext'
import { useAuth } from '../../context/AuthContext'
import styles from './ConditionLogTab.module.css'

const RATINGS = ['excellent', 'good', 'fair', 'poor', 'critical']
const RATING_COLOR = {
  excellent: '#4ade80', good: '#7dd3fc', fair: '#fbbf24', poor: '#fb923c', critical: '#ef4444',
}
const SECTIONS = [
  ['greensCondition',   'Greens'],
  ['teesCondition',     'Tees'],
  ['fairwaysCondition', 'Fairways'],
  ['bunkersCondition',  'Bunkers'],
  ['roughCondition',    'Rough'],
]
const TEXT_FIELDS = [
  ['moistureSummary',    'Moisture summary'],
  ['diseasePest',        'Disease / pest concerns'],
  ['irrigationConcerns', 'Irrigation concerns'],
  ['playabilityNotes',   'Playability notes'],
  ['followupNotes',      'Crew / assistant follow-up'],
  ['privateNotes',       'Private superintendent notes'],
]

const todayIso = () => new Date().toISOString().slice(0, 10)
const EMPTY = () => ({ overallRating: '', author: '' })

// The fields the editor owns — used to hydrate the form from a loaded log
// (everything else on the record — id, dates — is metadata we don't edit).
const EDITABLE_FIELDS = [
  'overallRating', 'author',
  ...SECTIONS.map(([k]) => k),
  ...TEXT_FIELDS.map(([k]) => k),
]

function inches(v, sign = false) {
  if (v == null || Number.isNaN(v)) return '—'
  const s = sign && v > 0 ? '+' : ''
  return `${s}${Number(v).toFixed(2)}"`
}

export default function ConditionLogTab() {
  const { logs } = useConditionLogs()
  const { current } = useWeather()
  const { balance } = useWaterBalance()
  const { observations } = useMoistureData()
  const toast = useToast()
  const { can } = useAuth()

  // Private superintendent notes are hidden from users without the
  // canViewPrivateNotes permission. The field is the only crew-unsafe one.
  const canViewPrivate = can('canViewPrivateNotes')
  const visibleTextFields = canViewPrivate
    ? TEXT_FIELDS
    : TEXT_FIELDS.filter(([key]) => key !== 'privateNotes')

  const [date, setDate]   = useState(todayIso)
  const [form, setForm]   = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [loadedDate, setLoadedDate] = useState(null)

  // Live context (read-only, from existing stores).
  const wb    = useMemo(() => computeWaterBalance(balance), [balance])
  const intel = useMemo(() => computeMoistureIntel(observations, wb), [observations, wb])
  const priorities = intel.byLocation.filter(l => l.priority === 'High Priority').slice(0, 4)

  // Load the log for the selected date (or blank if none).
  useEffect(() => {
    let cancelled = false
    fetchConditionLogByDate(date)
      .then(res => {
        if (cancelled) return
        if (res && !res.empty) {
          // Pull only the editable fields (skip id/courseId/logDate/timestamps).
          // Never hydrate privateNotes for a user who can't view it — it must
          // not enter client state for an unauthorized session.
          const next = EMPTY()
          for (const k of EDITABLE_FIELDS) {
            if (k === 'privateNotes' && !canViewPrivate) continue
            next[k] = res[k] ?? ''
          }
          setForm(next)
        } else {
          setForm(EMPTY())
        }
        setLoadedDate(date)
      })
      .catch(() => { if (!cancelled) { setForm(EMPTY()); setLoadedDate(date) } })
    return () => { cancelled = true }
  }, [date, canViewPrivate])

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    try {
      // Strip privateNotes from the payload for users who can't view it, so a
      // blank/absent field can never overwrite the stored superintendent note.
      const payload = { logDate: date, ...form }
      if (!canViewPrivate) delete payload.privateNotes
      await saveConditionLog(payload)
      toast?.success?.(`Condition log saved for ${date}`)
    } catch (err) {
      toast?.error?.(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const recentDates = useMemo(
    () => [...new Set(logs.map(l => l.logDate))].slice(0, 8),
    [logs],
  )

  return (
    <div className={styles.wrap}>
      {/* ── Live context (read-only) ───────────────────────────────────── */}
      <div className={styles.context}>
        <span className={styles.contextLabel}>Today's context</span>
        <div className={styles.contextRow}>
          <span className={styles.ctxItem}>
            {current?.currentTemp != null ? `${Math.round(current.currentTemp)}°F` : '—'}
            {current?.humidity != null ? ` · ${current.humidity}% RH` : ''}
            {current?.wind != null ? ` · wind ${Math.round(current.wind)} mph` : ''}
          </span>
          {wb.hasData && (
            <span className={styles.ctxItem}>
              ET {inches(wb.today?.etIn)} · rain {inches(wb.today?.rainfallIn)} · net {inches(wb.today?.netIn, true)}
              {wb.rolling?.d7 && ` · 7-day ${inches(wb.rolling.d7.balanceIn, true)}`}
            </span>
          )}
          <span className={styles.ctxItem}>
            {priorities.length > 0
              ? `Handwater: ${priorities.map(p => p.location).join(', ')}`
              : intel.hasData ? 'No high-priority handwater areas' : 'No moisture observations yet'}
          </span>
        </div>
      </div>

      {/* ── Date selector + recent ─────────────────────────────────────── */}
      <div className={styles.dateRow}>
        <label className={styles.dateLabel}>
          Log date
          <input type="date" className={styles.dateInput} value={date} max={todayIso()} onChange={e => setDate(e.target.value)} />
        </label>
        {date !== todayIso() && (
          <button type="button" className={styles.todayBtn} onClick={() => setDate(todayIso())}>Today</button>
        )}
        {recentDates.length > 0 && (
          <div className={styles.recentDates}>
            {recentDates.map(d => (
              <button key={d} type="button" className={`${styles.recentDate} ${d === date ? styles.recentDateActive : ''}`} onClick={() => setDate(d)}>
                {d.slice(5)}
              </button>
            ))}
          </div>
        )}
      </div>

      {loadedDate !== date ? (
        <p className={styles.loading}>Loading {date}…</p>
      ) : (
        <>
          {/* ── Overall rating ───────────────────────────────────────── */}
          <p className={styles.fieldLabel}>Overall course condition</p>
          <div className={styles.chips}>
            {RATINGS.map(r => (
              <button
                key={r}
                type="button"
                className={styles.chip}
                data-active={form.overallRating === r ? 'true' : 'false'}
                style={form.overallRating === r ? { background: RATING_COLOR[r], borderColor: RATING_COLOR[r], color: '#0d1a0d' } : undefined}
                onClick={() => setField('overallRating', form.overallRating === r ? '' : r)}
              >
                {r}
              </button>
            ))}
          </div>

          {/* ── Section ratings ──────────────────────────────────────── */}
          {SECTIONS.map(([key, label]) => (
            <div key={key} className={styles.section}>
              <p className={styles.sectionLabel}>{label}</p>
              <div className={styles.chips}>
                {RATINGS.map(r => (
                  <button
                    key={r}
                    type="button"
                    className={styles.chipSm}
                    data-active={form[key] === r ? 'true' : 'false'}
                    style={form[key] === r ? { background: RATING_COLOR[r], borderColor: RATING_COLOR[r], color: '#0d1a0d' } : undefined}
                    onClick={() => setField(key, form[key] === r ? '' : r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* ── Notes ────────────────────────────────────────────────── */}
          {visibleTextFields.map(([key, label]) => (
            <div key={key} className={styles.section}>
              <p className={styles.fieldLabel}>
                {label}{key === 'privateNotes' && <span className={styles.private}> · not crew-visible</span>}
              </p>
              <textarea
                className={styles.textarea}
                value={form[key] ?? ''}
                onChange={e => setField(key, e.target.value)}
                rows={2}
                placeholder={key === 'privateNotes' ? 'Visible only here' : ''}
              />
            </div>
          ))}

          <div className={styles.section}>
            <p className={styles.fieldLabel}>Author <span className={styles.private}>(optional)</span></p>
            <input className={styles.input} value={form.author ?? ''} onChange={e => setField('author', e.target.value)} placeholder="Name" />
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : `Save log for ${date}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
