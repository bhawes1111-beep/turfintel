// Phase 9C.3a — Shared cascade delete for calendar_event tasks.
//
// Worker-side `DELETE /api/calendar-events/:id` is a single-row delete
// (no FOREIGN KEY ON DELETE CASCADE in 0010_assignments_reservations.sql,
// since both calendar_event_id columns are documented as "soft" FKs).
// That leaves orphaned crew_assignments + equipment_reservations behind
// in D1 every time a task is deleted.
//
// This helper orchestrates the cleanup client-side using the existing
// store mutators, so no worker or schema change is needed:
//
//   1. Unlink any reservation whose crewAssignmentId points at one of
//      this task's crew_assignments (so other in-flight DisplayBoard /
//      Assignments renderers don't briefly resolve stale linkages).
//   2. Delete the crew_assignments rows linked to the event.
//   3. Delete the equipment_reservations rows linked to the event.
//   4. Delete the calendar_event row itself.
//
// Promise.allSettled is used for the bulk cleanup groups so that a
// single transient row failure doesn't abort the entire task delete —
// at worst a few orphan rows linger, which matches today's pre-cascade
// behavior. The final deleteCalendarEvent is sequenced last and is
// the only step whose outcome is treated as the operation's outcome.

import {
  patchEquipmentReservation,
  deleteCrewAssignment,
  deleteEquipmentReservation,
} from '../assignments/assignmentsStore'
import { deleteCalendarEvent } from '../calendar/calendarStore'

/**
 * Delete a calendar_event task and cascade-clean its linked rows.
 *
 * @param {string} eventId - calendar_events.id to delete
 * @param {object} ctx
 * @param {Array<{id:string, calendarEventId:string}>} ctx.crewAssignments
 *        Snapshot of all crew_assignments visible to the caller.
 * @param {Array<{id:string, calendarEventId:string, crewAssignmentId?:string|null}>} ctx.equipmentReservations
 *        Snapshot of all equipment_reservations visible to the caller.
 * @returns {Promise<{ ok: true, eventId: string }>} on success.
 *          Throws if the final deleteCalendarEvent fails.
 */
export async function deleteTaskCascade(eventId, { crewAssignments = [], equipmentReservations = [] } = {}) {
  if (!eventId) throw new Error('deleteTaskCascade: eventId is required')

  const linkedAssignments  = crewAssignments.filter(a => a.calendarEventId === eventId)
  const linkedReservations = equipmentReservations.filter(r => r.calendarEventId === eventId)

  // 1. Null out crewAssignmentId on any reservation that points at one of
  //    this task's crew_assignments. This keeps DisplayBoard's Phase 10
  //    chip resolution from briefly resolving a stale linkage if a render
  //    races the rest of the cleanup. Reservations without a crew link
  //    (task-level chips) skip this step naturally.
  await Promise.allSettled(
    linkedReservations
      .filter(r => r.crewAssignmentId)
      .map(r => patchEquipmentReservation(r.id, { crewAssignmentId: null }))
  )

  // 2. Delete the crew_assignments rows for this task.
  await Promise.allSettled(
    linkedAssignments.map(a => deleteCrewAssignment(a.id))
  )

  // 3. Delete the equipment_reservations rows for this task.
  await Promise.allSettled(
    linkedReservations.map(r => deleteEquipmentReservation(r.id))
  )

  // 4. Delete the calendar_event itself. Sequential — only proceed once
  //    the dependent rows are gone (matches the DailyAssignmentBoard
  //    Phase 8A.3 unlink-before-delete order). Any failure here is the
  //    one outcome the caller cares about, so we let it propagate.
  await deleteCalendarEvent(eventId)

  return { ok: true, eventId }
}

// Phase 9C.3b — Shared confirm-message builder. Centralises the
// impact-aware copy previously duplicated inline in
// TasksManagerModal + OperationsBoard, so every delete surface
// (including the new Display Board delete) speaks with the same
// voice. Pure string composition; no React, no hooks.
//
//   buildDeleteConfirmMessage('Mow Greens', 0, 0)
//   → 'Delete "Mow Greens" for today?\n\nThis removes the task from
//      the Assignments board and the Display Board.'
//
//   buildDeleteConfirmMessage('Mow Greens', 3, 2)
//   → same opener + a second paragraph naming the cascade impact:
//     '3 crew members are assigned and 2 pieces of equipment are linked.
//      Their assignment and equipment links for this task will also be cleared.'
//
// Singular/plural variants for crew (member/members, is/are) and
// equipment (piece/pieces, is/are) are handled inline.
export function buildDeleteConfirmMessage(title, linkedCrewCount = 0, linkedEqCount = 0) {
  const safeTitle = title ?? ''
  let message = `Delete "${safeTitle}" for today?\n\n` +
                `This removes the task from the Assignments board and the Display Board.`
  if (linkedCrewCount > 0 || linkedEqCount > 0) {
    const crewPhrase = linkedCrewCount === 1
      ? '1 crew member is assigned'
      : `${linkedCrewCount} crew members are assigned`
    const eqPhrase = linkedEqCount === 1
      ? '1 piece of equipment is linked'
      : `${linkedEqCount} pieces of equipment are linked`
    const summary = (linkedCrewCount > 0 && linkedEqCount > 0)
      ? `${crewPhrase} and ${eqPhrase}.`
      : (linkedCrewCount > 0 ? `${crewPhrase}.` : `${eqPhrase}.`)
    message += `\n${summary}\n` +
               `Their assignment and equipment links for this task will also be cleared.`
  }
  return message
}
