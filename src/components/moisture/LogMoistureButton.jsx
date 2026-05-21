// Moisture + Handwatering Intelligence — fast field entry.
//
// Mobile-first, one-handed, sunlight-readable quick logger. One tap opens a
// compact form: pick/type a location → tap big condition toggles → optional
// moisture % + short note → Save. Minimal typing, large tap targets, no deep
// modals. Same lightweight modal pattern as the Phase 31 LogFeedback button.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  createMoistureObservation,
  useMoistureData,
} from '../../utils/moisture/moistureStore'
import { useToast } from '../../utils/feedback/toastContext'
import styles from './LogMoistureButton.module.css'

// Big toggle definitions — observer's field call.
const FLAGS = [
  { key: 'wiltStress',   label: 'Wilt',       icon: '🥵' },
  { key: 'drySpot',      label: 'Dry spot',   icon: '🟤' },
  { key: 'handwaterRec', label: 'Handwater',  icon: '💧' },
  { key: 'syringeRec',   label: 'Syringe',    icon: '🌫️' },
]

function MoistureModal({ onClose, recentLocations }) {
  const [location, setLocation] = useState('')
  const [moisture, setMoisture] = useState('')
  const [note,     setNote]     = useState('')
  const [flags,    setFlags]    = useState({})
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)
  const toast = useToast()
  const ref = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggle(key) { setFlags(f => ({ ...f, [key]: !f[key] })) }

  // Derive an optional hole number from a "Green 7" / "7" style location.
  function holeFrom(loc) {
    const m = String(loc).match(/\b(\d{1,2})\b/)
    if (!m) return null
    const n = parseInt(m[1], 10)
    return n >= 1 && n <= 18 ? n : null
  }

  async function handleSave() {
    const loc = location.trim()
    if (!loc) { setError('Pick or type a location first.'); return }
    setSaving(true)
    setError(null)
    try {
      await createMoistureObservation({
        location:     loc,
        hole:         holeFrom(loc),
        moisturePct:  moisture.trim() !== '' ? Number(moisture) : null,
        surfaceNote:  note.trim() || null,
        wiltStress:   !!flags.wiltStress,
        drySpot:      !!flags.drySpot,
        handwaterRec: !!flags.handwaterRec,
        syringeRec:   !!flags.syringeRec,
      })
      toast?.success?.(`Logged ${loc}`)
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save observation.')
      setSaving(false)
    }
  }

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Log moisture">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>Log Moisture</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          <p className={styles.fieldLabel}>Location</p>
          <input
            ref={ref}
            type="text"
            className={styles.input}
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="e.g. Green 7"
            autoComplete="off"
          />
          {recentLocations.length > 0 && (
            <div className={styles.recentRow}>
              {recentLocations.map(loc => (
                <button key={loc} type="button" className={styles.recentChip} onClick={() => setLocation(loc)}>
                  {loc}
                </button>
              ))}
            </div>
          )}

          <p className={styles.fieldLabel}>Conditions</p>
          <div className={styles.toggles}>
            {FLAGS.map(f => (
              <button
                key={f.key}
                type="button"
                className={styles.toggle}
                data-active={flags[f.key] ? 'true' : 'false'}
                onClick={() => toggle(f.key)}
                aria-pressed={!!flags[f.key]}
              >
                <span className={styles.toggleIcon} aria-hidden="true">{f.icon}</span>
                {f.label}
              </button>
            ))}
          </div>

          <div className={styles.inlineRow}>
            <div className={styles.inlineField}>
              <p className={styles.fieldLabel}>Moisture % <span className={styles.optional}>(optional)</span></p>
              <input
                type="number" min="0" max="100" step="0.1" inputMode="decimal"
                className={styles.input}
                value={moisture}
                onChange={e => setMoisture(e.target.value)}
                placeholder="VWC"
              />
            </div>
          </div>

          <p className={styles.fieldLabel}>Note <span className={styles.optional}>(optional)</span></p>
          <input
            type="text"
            className={styles.input}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. dry SW corner"
          />

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function LogMoistureButton({ compact = false }) {
  const [open, setOpen] = useState(false)
  const { observations } = useMoistureData()

  // Recent distinct locations for one-tap reuse (fast field entry).
  const recentLocations = [...new Set((observations ?? []).map(o => o.location).filter(Boolean))].slice(0, 6)

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${compact ? styles.triggerCompact : ''}`}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">💧</span> Log Moisture
      </button>
      {open && <MoistureModal onClose={() => setOpen(false)} recentLocations={recentLocations} />}
    </>
  )
}
