// Phase 11 — Equipment Picker Modal.
//
// Opens when a supervisor clicks "Equipment" on a Daily Assignment Board
// row. Lists course equipment with derived status (Available, Reserved,
// In Use, Maintenance, Status unknown) and exposes assign/unassign
// actions that write through equipment_reservations + the Phase 10
// crew_assignment_id linkage.
//
// Status derivation rules (no invented values):
//   1. If equipment.status is out-of-service / maintenance / unavailable
//      → Maintenance.
//   2. Else look at active reservations for today's events:
//        - any in-use         → In Use
//        - any reserved       → Reserved (with operator hint when linked)
//        - none               → Available
//   3. If the underlying equipment row has no status string at all
//      → Status unknown.

import { useEffect, useMemo, useState } from 'react'
import {
  createEquipmentReservation,
  patchEquipmentReservation,
} from '../../../utils/assignments/assignmentsStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from './DailyAssignmentBoard.module.css'

const MAINTENANCE_STATES = new Set([
  'out-of-service',
  'maintenance',
  'unavailable',
  'broken',
])

function deriveStatus(eq, todayReservationsForEq) {
  if (!eq?.status) return { kind: 'unknown', label: 'Status unknown' }
  if (MAINTENANCE_STATES.has(eq.status)) {
    return { kind: 'maintenance', label: 'Maintenance' }
  }
  if (todayReservationsForEq.some(r => r.status === 'in-use')) {
    return { kind: 'in-use', label: 'In Use' }
  }
  if (todayReservationsForEq.length > 0) {
    return { kind: 'reserved', label: 'Reserved' }
  }
  return { kind: 'available', label: 'Available' }
}

export default function EquipmentPickerModal({
  employee,
  assignment,
  event,
  equipment,
  reservations,
  dayEventIds,
  onClose,
}) {
  const toast                     = useToast()
  const [search, setSearch]       = useState('')
  const [busyKey, setBusyKey]     = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Index today's reservations by equipment name ──────────────────────
  // We key by name because reservations carry equipment_name as the
  // load-bearing field; equipment_id is nullable for legacy rows.
  const todayResByName = useMemo(() => {
    const m = new Map()
    for (const r of reservations) {
      if (r.status === 'cancelled' || r.status === 'released') continue
      if (!dayEventIds.has(r.calendarEventId)) continue
      if (!m.has(r.equipmentName)) m.set(r.equipmentName, [])
      m.get(r.equipmentName).push(r)
    }
    return m
  }, [reservations, dayEventIds])

  // ── Equipment list (filtered by search) ───────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return equipment
      .filter(eq => {
        if (!q) return true
        const hay = `${eq.name ?? ''} ${eq.category ?? ''} ${eq.status ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [equipment, search])

  // ── Actions ───────────────────────────────────────────────────────────
  async function handleAssign(eq) {
    setBusyKey(eq.id)
    try {
      const eventId = assignment.calendarEventId
      // Find an existing reservation on the same event + equipment.
      const existing = reservations.find(r =>
        r.calendarEventId === eventId
        && r.equipmentName === eq.name
        && r.status !== 'cancelled'
        && r.status !== 'released',
      )
      if (existing) {
        // Move (or set) the operator linkage on the existing row.
        await patchEquipmentReservation(existing.id, {
          crewAssignmentId: assignment.id,
        })
      } else {
        await createEquipmentReservation({
          calendarEventId:  eventId,
          crewAssignmentId: assignment.id,
          equipmentId:      eq.id,
          equipmentName:    eq.name,
          status:           'reserved',
        })
      }
      toast.success(`${eq.name} → ${employee.name}`)
    } catch (err) {
      toast.error(`Assign failed: ${err.message}`)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleUnassign(reservation) {
    setBusyKey(reservation.id)
    try {
      await patchEquipmentReservation(reservation.id, { crewAssignmentId: null })
      toast.success('Unassigned from operator (reservation kept)')
    } catch (err) {
      toast.error(`Unassign failed: ${err.message}`)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog">
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <header className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Assign Equipment</h2>
            <p className={styles.modalSub}>
              <strong>{employee.name}</strong>
              {' · '}
              {event?.title ?? 'Unknown task'}
            </p>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >×</button>
        </header>

        <div className={styles.modalSearch}>
          <input
            type="search"
            placeholder="Search equipment by name, category, or status…"
            className={styles.modalSearchInput}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <ul className={styles.equipmentList}>
          {filtered.length === 0 ? (
            <li className={styles.equipmentEmpty}>No equipment matches.</li>
          ) : filtered.map(eq => {
            const todayResForEq = todayResByName.get(eq.name) ?? []
            const status        = deriveStatus(eq, todayResForEq)

            // Is THIS reservation tied to THIS employee on THIS event?
            const linkedToThis = todayResForEq.find(r =>
              r.calendarEventId === assignment.calendarEventId
              && r.crewAssignmentId === assignment.id,
            )

            // A reservation that exists for this event+equipment but
            // points to a different operator. Used to label "with X".
            const otherOnSameEvent = todayResForEq.find(r =>
              r.calendarEventId === assignment.calendarEventId
              && r.crewAssignmentId
              && r.crewAssignmentId !== assignment.id,
            )

            const otherEventReservations = todayResForEq.filter(r =>
              r.calendarEventId !== assignment.calendarEventId,
            )

            const isBusy = busyKey === eq.id || (linkedToThis && busyKey === linkedToThis.id)

            return (
              <li key={eq.id} className={styles.equipmentRow}>
                <div className={styles.equipmentMain}>
                  <span className={styles.equipmentName}>{eq.name}</span>
                  {eq.category && (
                    <span className={styles.equipmentCategory}>{eq.category}</span>
                  )}
                </div>

                <div className={styles.equipmentStatusCol}>
                  <span
                    className={styles.statusPill}
                    data-status={status.kind}
                  >
                    {status.label}
                  </span>
                  {otherOnSameEvent && !linkedToThis && (
                    <span className={styles.equipmentHint}>
                      with another operator on this task
                    </span>
                  )}
                  {otherEventReservations.length > 0 && (
                    <span className={styles.equipmentHint}>
                      busy on {otherEventReservations.length} other task{otherEventReservations.length !== 1 ? 's' : ''} today
                    </span>
                  )}
                </div>

                <div className={styles.equipmentAction}>
                  {linkedToThis ? (
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={isBusy}
                      onClick={() => handleUnassign(linkedToThis)}
                    >
                      {isBusy ? '…' : 'Unassign'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={isBusy || status.kind === 'maintenance'}
                      onClick={() => handleAssign(eq)}
                      title={status.kind === 'maintenance'
                        ? 'Equipment is in maintenance — fix in Equipment page first'
                        : otherOnSameEvent
                          ? 'This will move the machine from the other operator'
                          : 'Assign to this operator'}
                    >
                      {isBusy ? '…' : (otherOnSameEvent ? 'Move here' : 'Assign')}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <footer className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Done
          </button>
        </footer>

      </div>
    </div>
  )
}
