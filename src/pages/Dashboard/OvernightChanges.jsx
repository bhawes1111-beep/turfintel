// Phase 6A.2 — Overnight Changes card.
//
// Pure derivation over existing stores. Surfaces "what's new since
// yesterday evening" so the superintendent can scan changes that
// happened while they were off the clock.
//
// Window: events with createdAt (or observedAt for disease) at or
// after 6 PM the previous day, in the local timezone. Recomputed on
// every render — no new state, no persistence, no schema.
//
// Stores read (all pre-existing):
//   - notesStore         (operations_daily_notes)
//   - alertsStore        (alerts)
//   - spraysStore        (spray_records — planned only)
//   - diseaseStore       (disease_observations)
//   - equipmentStore     (service log — flagged only)
//
// Renders ≤ 6 lines. If nothing new, renders an honest "all quiet" empty.

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOperationsNotesData } from '../../utils/operations/notesStore'
import { useAlertsData } from '../../utils/alerts/alertsStore'
import { useSpraysData } from '../../utils/sprays/spraysStore'
import { useDisease } from '../../utils/disease/diseaseStore'
import { useEquipmentData } from '../../utils/equipment/equipmentStore'
import styles from './OvernightChanges.module.css'

// Returns the ms epoch of 6 PM yesterday (local time). Anything newer
// counts as "overnight." Computed per render — cheap.
function overnightCutoff() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  d.setHours(18, 0, 0, 0)
  return d.getTime()
}

function newerThan(iso, cutoff) {
  if (!iso) return false
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= cutoff
}

export default function OvernightChanges() {
  const navigate                       = useNavigate()
  const { notes = [] }                 = useOperationsNotesData()
  const { alerts = [] }                = useAlertsData()
  const { records: sprays = [] }       = useSpraysData()
  const { observations: disease = [] } = useDisease()
  const { serviceLog = [] }            = useEquipmentData()

  const items = useMemo(() => {
    const cutoff = overnightCutoff()
    const out = []

    const newNotes = notes.filter(n => n.status === 'active' && newerThan(n.createdAt, cutoff))
    if (newNotes.length > 0) {
      out.push({
        key:   'notes',
        icon:  '📝',
        label: `${newNotes.length} new briefing note${newNotes.length === 1 ? '' : 's'}`,
        to:    '/morning-brief',
      })
    }

    const newAlerts = alerts.filter(a => a.status !== 'resolved' && newerThan(a.createdAt, cutoff))
    if (newAlerts.length > 0) {
      out.push({
        key:   'alerts',
        icon:  '⚠️',
        label: `${newAlerts.length} new alert${newAlerts.length === 1 ? '' : 's'}`,
        to:    '/dashboard',
      })
    }

    const newSprays = sprays.filter(s => s.status === 'planned' && newerThan(s.createdAt, cutoff))
    if (newSprays.length > 0) {
      out.push({
        key:   'sprays',
        icon:  '🌿',
        label: `${newSprays.length} new spray plan${newSprays.length === 1 ? '' : 's'}`,
        to:    '/spray',
      })
    }

    // Disease observations: observedAt is the field-fact timestamp; createdAt
    // is when the row was inserted. Either qualifies as overnight activity.
    const newDisease = disease.filter(o => newerThan(o.observedAt, cutoff) || newerThan(o.createdAt, cutoff))
    if (newDisease.length > 0) {
      out.push({
        key:   'disease',
        icon:  '🔬',
        label: `${newDisease.length} new disease observation${newDisease.length === 1 ? '' : 's'}`,
        to:    '/disease',
      })
    }

    const newEquip = serviceLog.filter(
      l => (l.status === 'overdue' || (l.status === 'open' && l.priority === 'critical'))
        && newerThan(l.createdAt, cutoff),
    )
    if (newEquip.length > 0) {
      out.push({
        key:   'equipment',
        icon:  '⚙️',
        label: `${newEquip.length} new equipment flag${newEquip.length === 1 ? '' : 's'}`,
        to:    '/equipment',
      })
    }

    return out
  }, [notes, alerts, sprays, disease, serviceLog])

  if (items.length === 0) {
    return (
      <div className={styles.allQuiet}>
        <span className={styles.allQuietIcon}>✓</span>
        <span>Nothing new since 6 PM yesterday.</span>
      </div>
    )
  }

  return (
    <ul className={styles.list}>
      {items.map(it => (
        <li key={it.key} className={styles.row}>
          <button type="button" className={styles.rowBtn} onClick={() => navigate(it.to)}>
            <span className={styles.icon} aria-hidden="true">{it.icon}</span>
            <span className={styles.label}>{it.label}</span>
            <span className={styles.chev} aria-hidden="true">›</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
