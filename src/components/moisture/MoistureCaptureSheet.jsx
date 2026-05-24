// Phase 7A.1 — Mobile moisture capture sheet (zero-typing primary flow).
//
// Tap path goal (FAB → preset → pill → Save):
//   1. open sheet
//   2. tap location preset (or recent chip)        ← required
//   3. tap one or more condition pills              ← required (≥1)
//   4. tap Save                                     ← closes immediately
//
// "Optional details" (moisture %, surface note) live behind an Expand link
// so they never block the primary flow but are reachable with one extra tap.
//
// Save is non-blocking: submitMoistureObservation() inserts an optimistic
// row into the store and fires the network call in the background. The
// sheet closes synchronously. Failures surface as a retry badge on the
// pending row in any list that reads the moisture store.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  submitMoistureObservation,
  useMoistureData,
} from '../../utils/moisture/moistureStore'
import { useToast } from '../../utils/feedback/toastContext'
import styles from './LogMoistureButton.module.css'

// ── Presets ─────────────────────────────────────────────────────────────────
// Greens 1–18 + the three approved shoulder areas. Anything beyond this set
// goes through the "Other (type)" affordance, which is the only path that
// triggers the keyboard.
const GREEN_PRESETS = Array.from({ length: 18 }, (_, i) => `Green ${i + 1}`)
const AREA_PRESETS  = ['Practice Green', 'Putting Green', 'Driving Range']

const FLAGS = [
  { key: 'wiltStress',   label: 'Wilt',      icon: '🥵' },
  { key: 'drySpot',      label: 'Dry spot',  icon: '🟤' },
  { key: 'handwaterRec', label: 'Handwater', icon: '💧' },
  { key: 'syringeRec',   label: 'Syringe',   icon: '🌫️' },
]

// Extract optional hole number from "Green N" preset for the structured
// `hole` column. Matches existing behaviour in the legacy modal.
function holeFromLocation(loc) {
  const m = String(loc).match(/^Green\s+(\d{1,2})$/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 1 && n <= 18 ? n : null
}

/**
 * @param {Function} onClose      - called when the sheet should dismiss.
 * @param {string[]} recentLocations - chips for quick-pick (up to 6).
 */
export default function MoistureCaptureSheet({ onClose, recentLocations = [] }) {
  const [location,    setLocation]   = useState(null)        // null until picked
  const [otherOpen,   setOtherOpen]  = useState(false)
  const [otherText,   setOtherText]  = useState('')
  const [flags,       setFlags]      = useState({})
  const [showDetails, setShowDetails] = useState(false)
  const [moisture,    setMoisture]   = useState('')
  const [note,        setNote]       = useState('')
  const [error,       setError]      = useState(null)

  const toast = useToast()
  const otherInputRef = useRef(null)

  // ESC closes; sheet does NOT autofocus any input — that would pop the
  // keyboard and violate the zero-typing rule.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Focus the "Other" text input only when the user explicitly opens that
  // affordance — keyboard never appears in the primary flow.
  useEffect(() => {
    if (otherOpen) otherInputRef.current?.focus()
  }, [otherOpen])

  function toggleFlag(key) {
    setFlags(f => ({ ...f, [key]: !f[key] }))
  }

  // De-dup recent chips that already appear in presets, so the chip row
  // only shows custom locations the user typed before.
  const presetSet = useMemo(() => new Set([...GREEN_PRESETS, ...AREA_PRESETS]), [])
  const uniqueRecents = useMemo(
    () => recentLocations.filter(r => r && !presetSet.has(r)).slice(0, 6),
    [recentLocations, presetSet],
  )

  // Phase 7A.3 — shared validate+submit, so Save and "Log another" route
  // through identical logic. Returns true on success so the caller can
  // decide whether to close the sheet (Save) or just clear the row inputs
  // (Log another). Never throws — validation failures set the inline error
  // and return false; submit itself is fire-and-forget via the store wrapper.
  function doSubmit() {
    const finalLocation = otherOpen ? otherText.trim() : (location ?? '')
    if (!finalLocation) {
      setError('Pick a location.')
      return false
    }
    const anyFlag = FLAGS.some(f => flags[f.key])
    const moistureNum = moisture.trim() !== '' ? Number(moisture) : null
    // Require at least one signal so we never write an empty row. A flag,
    // a measured %, or a free-text note all count.
    if (!anyFlag && moistureNum == null && note.trim() === '') {
      setError('Tap at least one condition pill.')
      return false
    }

    submitMoistureObservation({
      location:     finalLocation,
      hole:         holeFromLocation(finalLocation),
      moisturePct:  moistureNum,
      surfaceNote:  note.trim() || null,
      wiltStress:   !!flags.wiltStress,
      drySpot:      !!flags.drySpot,
      handwaterRec: !!flags.handwaterRec,
      syringeRec:   !!flags.syringeRec,
    })

    toast?.success?.(`Logged ${finalLocation}`)
    return true
  }

  function handleSave() {
    if (doSubmit()) onClose()
  }

  // Save & log another: submit, keep the sheet open + location selected,
  // clear everything else so the next observation is one location-confirm-
  // (already selected) plus one condition-pill tap away. Targets ≤ 3s per
  // repeat capture during a walking-greens run.
  function handleSaveAndContinue() {
    if (!doSubmit()) return
    setFlags({})
    setMoisture('')
    setNote('')
    setError(null)
    // Keep `location`, `otherOpen`, `otherText`, `showDetails` as-is so the
    // user doesn't lose context between captures.
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Log moisture observation"
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>Log Moisture</span>
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

          {/* ── Conditions: required ─────────────────────────────────────── */}
          <p className={styles.fieldLabel}>Conditions</p>
          <div className={styles.toggles}>
            {FLAGS.map(f => (
              <button
                key={f.key}
                type="button"
                className={styles.toggle}
                data-active={flags[f.key] ? 'true' : 'false'}
                onClick={() => toggleFlag(f.key)}
                aria-pressed={!!flags[f.key]}
              >
                <span className={styles.toggleIcon} aria-hidden="true">{f.icon}</span>
                {f.label}
              </button>
            ))}
          </div>

          {/* ── Optional details (collapsed by default) ──────────────────── */}
          {!showDetails && (
            <button
              type="button"
              className={styles.expandLink}
              onClick={() => setShowDetails(true)}
            >
              + Add moisture % or note
            </button>
          )}
          {showDetails && (
            <div className={styles.detailsWrap}>
              <p className={styles.fieldLabel}>
                Moisture % <span className={styles.optional}>(optional)</span>
              </p>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                inputMode="decimal"
                className={styles.input}
                value={moisture}
                onChange={e => setMoisture(e.target.value)}
                placeholder="VWC"
              />
              <p className={styles.fieldLabel}>
                Note <span className={styles.optional}>(optional)</span>
              </p>
              <input
                type="text"
                className={styles.input}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. dry SW corner"
              />
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <button
            className={styles.cancelBtn}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={styles.continueBtn}
            onClick={handleSaveAndContinue}
            title="Save this observation and log another at the same location"
          >
            + Log another
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Helper hook: distinct recent locations from the store, capped at 6,
 * preserving newest-first ordering. Used by both the FAB and the legacy
 * inline button.
 */
export function useRecentMoistureLocations(limit = 6) {
  const { observations } = useMoistureData()
  return useMemo(
    () => [...new Set((observations ?? []).map(o => o.location).filter(Boolean))].slice(0, limit),
    [observations, limit],
  )
}
