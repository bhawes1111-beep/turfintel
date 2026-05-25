// Phase 7B.1 — Mobile Turf Health capture sheet (zero-typing primary flow).
//
// Direct shape-port of MoistureCaptureSheet. The differences from moisture:
//   - 12 "health type" preset pills (3-col grid × 4 rows) instead of the
//     boolean condition flags moisture uses
//   - 3 severity chips (Low / Moderate / High) — required, not optional
//   - location vocabulary is identical to moisture (Greens 1–18 + 3 areas
//     + Other) so the muscle memory transfers
//
// Tap path goal (FAB → preset → type → severity → Save):
//   1. open sheet
//   2. tap location preset (or recent chip)        ← required
//   3. tap one health-type pill                    ← required
//   4. tap a severity chip                         ← required
//   5. tap Save                                    ← closes immediately
//
// Save is non-blocking; the store's optimistic-insert + sendToServer
// pattern fires the row immediately into the list, then resolves async.
// Failures surface as a retry badge on the pending row.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  submitTurfHealthObservation,
  stagePendingPhoto,
  useTurfHealthData,
} from '../../utils/turfHealth/turfHealthStore'
import { useToast } from '../../utils/feedback/toastContext'
import { openPhotoPicker } from '../../utils/media/pickPhoto'
import styles from './TurfHealthCaptureSheet.module.css'

// Pre-save photo staging path (Phase 7A.4 pattern). The shared
// openPhotoPicker helper handles the DOM + camera plumbing.
function pickPhotoForClientId(clientId) {
  openPhotoPicker(file => stagePendingPhoto(clientId, file))
}

// ── Presets ─────────────────────────────────────────────────────────────────
// Match moisture exactly so the user doesn't relearn location vocabulary.
const GREEN_PRESETS = Array.from({ length: 18 }, (_, i) => `Green ${i + 1}`)
const AREA_PRESETS  = ['Practice Green', 'Putting Green', 'Driving Range']

// The 12 health-type presets (single-select). Worker validates against this
// list — see ALLOWED_HEALTH_TYPES in worker/api/turfHealth.js. Editing this
// list ships immediately by editing both sides; no migration needed.
const HEALTH_TYPES = [
  { key: 'morning-shade',      label: 'Morning shade',   icon: '🌅' },
  { key: 'afternoon-shade',    label: 'Afternoon shade', icon: '🌇' },
  { key: 'all-day-shade',      label: 'All-day shade',   icon: '🌑' },
  { key: 'poor-airflow',       label: 'Poor airflow',    icon: '🌬️' },
  { key: 'wet-pocket',         label: 'Wet pocket',      icon: '💧' },
  { key: 'weak-bermuda',       label: 'Weak bermuda',    icon: '🌾' },
  { key: 'slow-recovery',      label: 'Slow recovery',   icon: '🐢' },
  { key: 'algae-moss',         label: 'Algae / moss',    icon: '🪨' },
  { key: 'chronic-wilt',       label: 'Chronic wilt',    icon: '🥵' },
  { key: 'localized-dry-spot', label: 'Dry spot',        icon: '🟤' },
  { key: 'traffic-stress',     label: 'Traffic',         icon: '👣' },
  { key: 'scalping-thin',      label: 'Scalping / thin', icon: '✂️' },
]

const SEVERITIES = [
  { key: 'low',      label: 'Low' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'high',     label: 'High' },
]

// Extract optional hole number from "Green N" preset for the structured
// `hole` column — identical helper to moisture's.
function holeFromLocation(loc) {
  const m = String(loc).match(/^Green\s+(\d{1,2})$/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 1 && n <= 18 ? n : null
}

/**
 * @param {Function} onClose         - dismiss the sheet
 * @param {string[]} recentLocations - chips for quick-pick (up to 6)
 */
export default function TurfHealthCaptureSheet({ onClose, recentLocations = [] }) {
  const [location,    setLocation]    = useState(null)         // null until picked
  const [otherOpen,   setOtherOpen]   = useState(false)
  const [otherText,   setOtherText]   = useState('')
  const [healthType,  setHealthType]  = useState(null)         // single-select
  const [severity,    setSeverity]    = useState(null)         // single-select
  const [showDetails, setShowDetails] = useState(false)
  const [note,        setNote]        = useState('')
  const [error,       setError]       = useState(null)

  const toast = useToast()
  const otherInputRef = useRef(null)

  // ESC closes. NO autofocus — keyboard never appears in the primary flow.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Other-input focus only happens when the user explicitly taps "Other…".
  useEffect(() => {
    if (otherOpen) otherInputRef.current?.focus()
  }, [otherOpen])

  // Recents minus already-shown presets — prevents "Green 7" appearing twice.
  const presetSet = useMemo(() => new Set([...GREEN_PRESETS, ...AREA_PRESETS]), [])
  const uniqueRecents = useMemo(
    () => recentLocations.filter(r => r && !presetSet.has(r)).slice(0, 6),
    [recentLocations, presetSet],
  )

  // Shared validate + submit; both Save and "+ Log another" route through.
  // Returns the optimistic row on success (caller may want clientId for
  // photo staging), or null on validation failure.
  function doSubmit() {
    const finalLocation = otherOpen ? otherText.trim() : (location ?? '')
    if (!finalLocation) { setError('Pick a location.');         return null }
    if (!healthType)    { setError('Pick a type.');             return null }
    if (!severity)      { setError('Pick a severity.');         return null }

    const optimistic = submitTurfHealthObservation({
      location:    finalLocation,
      hole:        holeFromLocation(finalLocation),
      healthType,
      severity,
      surfaceNote: note.trim() || null,
    })
    return optimistic
  }

  function handleSave() {
    const row = doSubmit()
    if (!row) return
    // Same 6-second photo-action toast as moisture (Phase 7A.4).
    toast?.success?.(
      `Logged ${row.location}`,
      {
        duration: 6000,
        action: { label: '+ Add photo', onClick: () => pickPhotoForClientId(row.clientId) },
      },
    )
    onClose()
  }

  // Save & log another: submit, keep the sheet open + location selected,
  // clear type/severity/note. Target ≤ 3s per repeat for a walking-course
  // run. NO photo action on this toast — repeat captures stay fast.
  function handleSaveAndContinue() {
    const row = doSubmit()
    if (!row) return
    toast?.success?.(`Logged ${row.location}`)
    setHealthType(null)
    setSeverity(null)
    setNote('')
    setError(null)
    // Keep `location`, `otherOpen`, `otherText`, `showDetails` as-is.
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Log turf health observation"
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>Log Turf Health</span>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {/* ── Location: presets first, keyboard never required ─────────── */}
          <p className={styles.fieldLabel}>Location</p>
          {!otherOpen && (
            <>
              <div className={styles.presetGrid}>
                {GREEN_PRESETS.map(p => (
                  <button
                    key={p}
                    type="button"
                    className={styles.presetChip}
                    data-active={location === p ? 'true' : 'false'}
                    onClick={() => { setLocation(p); setError(null) }}
                  >
                    {p.replace('Green ', '')}
                  </button>
                ))}
              </div>
              <div className={styles.areaRow}>
                {AREA_PRESETS.map(p => (
                  <button
                    key={p}
                    type="button"
                    className={styles.areaChip}
                    data-active={location === p ? 'true' : 'false'}
                    onClick={() => { setLocation(p); setError(null) }}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.areaChip}
                  onClick={() => { setOtherOpen(true); setLocation(null) }}
                >
                  Other…
                </button>
              </div>
              {uniqueRecents.length > 0 && (
                <div className={styles.recentRow}>
                  {uniqueRecents.map(loc => (
                    <button
                      key={loc}
                      type="button"
                      className={styles.recentChip}
                      data-active={location === loc ? 'true' : 'false'}
                      onClick={() => { setLocation(loc); setError(null) }}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {otherOpen && (
            <div className={styles.otherWrap}>
              <input
                ref={otherInputRef}
                type="text"
                className={styles.input}
                value={otherText}
                onChange={e => { setOtherText(e.target.value); setError(null) }}
                placeholder="Type a location…"
                autoComplete="off"
              />
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => { setOtherOpen(false); setOtherText('') }}
              >
                Use a preset instead
              </button>
            </div>
          )}

          {/* ── Type (single-select; 3-col grid fits 360px viewports) ────── */}
          <p className={styles.fieldLabel}>Type</p>
          <div className={styles.typeGrid}>
            {HEALTH_TYPES.map(t => (
              <button
                key={t.key}
                type="button"
                className={styles.typeChip}
                data-active={healthType === t.key ? 'true' : 'false'}
                onClick={() => { setHealthType(t.key); setError(null) }}
                aria-pressed={healthType === t.key}
              >
                <span className={styles.typeIcon} aria-hidden="true">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Severity (required, single-select) ────────────────────────── */}
          <p className={styles.fieldLabel}>Severity</p>
          <div className={styles.severityRow}>
            {SEVERITIES.map(s => (
              <button
                key={s.key}
                type="button"
                className={styles.severityChip}
                data-active={severity === s.key ? 'true' : 'false'}
                data-level={s.key}
                onClick={() => { setSeverity(s.key); setError(null) }}
                aria-pressed={severity === s.key}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* ── Optional note (collapsed by default — never blocks flow) ── */}
          {!showDetails && (
            <button
              type="button"
              className={styles.expandLink}
              onClick={() => setShowDetails(true)}
            >
              + Add note
            </button>
          )}
          {showDetails && (
            <div className={styles.detailsWrap}>
              <p className={styles.fieldLabel}>
                Note <span className={styles.optional}>(optional)</span>
              </p>
              <input
                type="text"
                className={styles.input}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. NE corner under tree canopy"
                inputMode="text"
                autoCapitalize="off"
              />
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            className={styles.continueBtn}
            onClick={handleSaveAndContinue}
            title="Save this observation and log another at the same location"
          >
            + Log another
          </button>
          <button className={styles.saveBtn} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Helper hook: distinct recent locations from the store, capped at 6.
 */
export function useRecentTurfHealthLocations(limit = 6) {
  const { observations } = useTurfHealthData()
  return useMemo(
    () => [...new Set((observations ?? []).map(o => o.location).filter(Boolean))].slice(0, limit),
    [observations, limit],
  )
}
