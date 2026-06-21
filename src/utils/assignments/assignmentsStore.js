// Crew Assignments + Equipment Reservations data store (Phase 5.4c).
//
// Mirrors equipmentStore / repairsStore / inventoryStore / spraysStore /
// calendarStore / alertsStore: module-level cache, useSyncExternalStore
// subscription, optimistic mutations, x-admin-key on writes, refresh-on-
// error. Two domains live in one store because they share a coordinated
// lifecycle (both link back to a calendar_event_id and are written by the
// same cross-module handoff sites).
//
// Cross-module writers — MaintenanceLogs.handleScheduleService — now call
// createEquipmentReservation() here instead of dispatching RESERVE_EQUIPMENT.
// Worker-side dedupe on (calendar_event_id, employee_name) and
// (calendar_event_id, equipment_name) keeps repeat dispatches idempotent.

import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'
import { mutationHeaders } from '../auth/mutationAuth'

const CREW_API = '/api/crew-assignments'
const RES_API  = '/api/equipment-reservations'


let state = {
  crewAssignments:       [],
  equipmentReservations: [],
  loading:               true,
  error:                 null,
  lastFetch:             null,
}

const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) {
  state = { ...state, ...patch }
  notify()
}

async function fetchJSON(url, init) {
  // Phase 3C: session-cookie auth — credentials sends the httpOnly ti_session
  // cookie; no x-admin-key from the browser. The Worker gate enforces role.
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshAssignmentsData() {
  setState({ loading: true, error: null })
  try {
    const [crewAssignments, equipmentReservations] = await Promise.all([
      fetchJSON(withCourseScope(CREW_API)),
      fetchJSON(withCourseScope(RES_API)),
    ])
    setState({
      crewAssignments,
      equipmentReservations,
      loading:   false,
      error:     null,
      lastFetch: Date.now(),
    })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshAssignmentsData() })

// ── Crew assignments — optimistic mutations ────────────────────────────────

/**
 * Creates a crew assignment. The Worker enforces (calendar_event_id,
 * employee_name) dedupe; a duplicate call returns the existing row
 * (idempotent). Local cache reflects the server-canonical result, so
 * repeat dispatches do not create local duplicates either.
 */
export async function createCrewAssignment(payload) {
  try {
    const saved = await fetchJSON(CREW_API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    const existsLocally = state.crewAssignments.some(a => a.id === saved.id)
    setState({
      crewAssignments: existsLocally
        ? state.crewAssignments.map(a => a.id === saved.id ? saved : a)
        : [saved, ...state.crewAssignments],
    })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function patchCrewAssignment(id, updates) {
  const prev = state.crewAssignments
  const next = prev.map(a => a.id === id ? { ...a, ...updates } : a)
  setState({ crewAssignments: next })
  try {
    const saved = await fetchJSON(`${CREW_API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({
      crewAssignments: state.crewAssignments.map(a => a.id === id ? saved : a),
    })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshAssignmentsData()
    throw err
  }
}

export async function deleteCrewAssignment(id) {
  const prev = state.crewAssignments
  setState({ crewAssignments: prev.filter(a => a.id !== id) })
  try {
    await fetchJSON(`${CREW_API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshAssignmentsData()
    throw err
  }
}

/**
 * Phase DAB.10a — Bulk-replace one (calendarEventId, employeeName)'s
 * job list. The worker DELETEs every existing row for that pair, then
 * INSERTs `jobs.length` new rows with job_order = index. Blank jobs
 * (no notes / notesEs / role) are filtered server-side and not
 * persisted, so the editor can submit padded slots without leaking
 * empty rows into the DB.
 *
 * Payload shape:
 *   {
 *     calendarEventId: 'evt-…',
 *     employeeId:      'emp-…',       // optional; default per-job
 *     employeeName:    'Brian Warren',
 *     role:            'Operator',    // optional; default per-job
 *     jobs: [
 *       { notes: '1st Job notes', status: 'assigned', notesEs: null },
 *       { notes: '2nd Job notes' },
 *       …
 *     ]
 *   }
 *
 * Empty `jobs: []` (or all-blank jobs filtered to empty) clears every
 * crew_assignments row for that (event, employee) pair — the
 * supervisor's explicit "remove all jobs" gesture.
 *
 * Returns { ok, calendarEventId, employeeName, rows }.
 * Local cache: drops any rows for (event, employee) then merges in
 * the freshly-saved rows so subscribers re-render with canonical
 * state. Refreshes on error so optimistic drift can't accumulate.
 */
export async function bulkReplaceEmployeeJobs(payload) {
  try {
    const saved = await fetchJSON(`${CREW_API}/bulk-jobs`, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    const eventId = saved.calendarEventId
    const empName = saved.employeeName
    const rows    = Array.isArray(saved.rows) ? saved.rows : []
    setState({
      crewAssignments: [
        ...state.crewAssignments.filter(a =>
          !(a.calendarEventId === eventId && a.employeeName === empName)
        ),
        ...rows,
      ],
    })
    return saved
  } catch (err) {
    setState({ error: err.message })
    // Refresh on error so the optimistic state can't drift.
    refreshAssignmentsData()
    throw err
  }
}

/**
 * Phase DAB.10a.1 — Bulk-replace one employee's ordered task list
 * for a single (course, date). Each task is a distinct calendar
 * event; jobOrder = the supervisor's chosen ordering across them.
 *
 * Payload shape:
 *   {
 *     date: 'YYYY-MM-DD',
 *     employeeName: 'Brian Warren',
 *     employeeId:   'emp-…',          // optional, default per-job
 *     role:         'Operator',       // optional, default per-job
 *     jobs: [
 *       { calendarEventId, notes, notesEs, status, role },  // 1st Job
 *       { calendarEventId, notes, notesEs, status, role },  // 2nd Job
 *       …
 *     ]
 *   }
 *
 * Empty `jobs: []` (or all-blank-after-filter) clears every
 * crew_assignments row this employee held against any of that day's
 * calendar_events for the active course. Other employees and other
 * dates are untouched.
 *
 * Returns { ok, date, employeeName, rows }.
 * Local cache: drops every row for (employee, calendarEventIds we
 * deleted) and merges the freshly-saved rows so subscribers re-render
 * with canonical state.
 *
 * Defer to bulkReplaceEmployeeJobs for the per-event sub-row workflow
 * that DAB.10a originally shipped; that endpoint is preserved
 * untouched for future use cases.
 */
export async function bulkReplaceEmployeeDay(payload) {
  try {
    const saved = await fetchJSON(`${CREW_API}/bulk-employee-day`, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    const empName       = saved.employeeName
    const newRows       = Array.isArray(saved.rows) ? saved.rows : []
    // Cache rebuild: drop ANY existing row for this employee that
    // ties to one of the calendar events covered by the saved rows.
    // We can't enumerate "this day's event ids" purely from the
    // response (the response only includes inserted rows; a "clear
    // all" returns []), so we fall back to refreshing on the empty
    // case. The non-empty case can compute the affected events from
    // the response and trim locally without a network round-trip.
    if (newRows.length === 0) {
      // Empty save = "clear all jobs for this employee for that
      // date". The response can't tell us which event ids were
      // deleted, so re-pull the canonical list. Non-fatal: optimistic
      // setState below also clears the obvious matches.
      setState({
        crewAssignments: state.crewAssignments.filter(a => a.employeeName !== empName),
      })
      refreshAssignmentsData().catch(() => { /* non-fatal */ })
    } else {
      const newRowEventIds = new Set(newRows.map(r => r.calendarEventId))
      setState({
        crewAssignments: [
          ...state.crewAssignments.filter(a =>
            !(a.employeeName === empName && newRowEventIds.has(a.calendarEventId))
          ),
          ...newRows,
        ],
      })
      // Belt-and-suspenders refresh so any rows the supervisor
      // removed (events NOT in newRowEventIds) get pruned from the
      // local cache on the next tick.
      refreshAssignmentsData().catch(() => { /* non-fatal */ })
    }
    return saved
  } catch (err) {
    setState({ error: err.message })
    // Refresh on error so the optimistic state can't drift.
    refreshAssignmentsData()
    throw err
  }
}

// ── Equipment reservations — optimistic mutations ──────────────────────────

/**
 * Creates an equipment reservation. The Worker enforces
 * (calendar_event_id, equipment_name) dedupe; a duplicate call returns
 * the existing row (idempotent).
 */
export async function createEquipmentReservation(payload) {
  try {
    const saved = await fetchJSON(RES_API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    const existsLocally = state.equipmentReservations.some(r => r.id === saved.id)
    setState({
      equipmentReservations: existsLocally
        ? state.equipmentReservations.map(r => r.id === saved.id ? saved : r)
        : [saved, ...state.equipmentReservations],
    })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function patchEquipmentReservation(id, updates) {
  const prev = state.equipmentReservations
  const next = prev.map(r => r.id === id ? { ...r, ...updates } : r)
  setState({ equipmentReservations: next })
  try {
    const saved = await fetchJSON(`${RES_API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({
      equipmentReservations: state.equipmentReservations.map(r => r.id === id ? saved : r),
    })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshAssignmentsData()
    throw err
  }
}

export async function deleteEquipmentReservation(id) {
  const prev = state.equipmentReservations
  setState({ equipmentReservations: prev.filter(r => r.id !== id) })
  try {
    await fetchJSON(`${RES_API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshAssignmentsData()
    throw err
  }
}

// ── Subscription hook ──────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshAssignmentsData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useAssignmentsData — read-only subscription to the assignments vertical.
 * Returns { crewAssignments, equipmentReservations, loading, error, lastFetch }.
 *
 * Each record uses one-row-per-person / one-row-per-equipment normalized
 * shape: { id, calendarEventId, employeeName | equipmentName, role |
 * equipmentId, status, notes, assignedAt | reservedAt, createdAt,
 * updatedAt }.
 */
export function useAssignmentsData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
