// Calendar events data store (Phase 5.4a).
//
// Mirrors equipmentStore / repairsStore / inventoryStore / spraysStore.
// Module-level cache, useSyncExternalStore subscription, optimistic
// mutations, x-admin-key on writes, refresh-on-error.
//
// Cross-module handoffs (BuildSpraySheet → Operations Calendar,
// Repairs → Operations Calendar, MaintenanceLogs → Operations Calendar)
// now call createCalendarEvent() here instead of dispatching to
// OperationsContext. Server-side dedupe (sourceId + event_type +
// start_date) keeps repeat dispatches idempotent.

import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'
import { mutationHeaders } from '../auth/mutationAuth'

const API = '/api/calendar-events'


let state = {
  events:    [],
  loading:   true,
  error:     null,
  lastFetch: null,
}

const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) {
  state = { ...state, ...patch }
  notify()
}

async function fetchJSON(url, init) {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshCalendarData() {
  setState({ loading: true, error: null })
  try {
    const events = await fetchJSON(withCourseScope(API))
    setState({ events, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshCalendarData() })

// ── Optimistic mutations ───────────────────────────────────────────────────

/**
 * Creates a calendar event. The Worker enforces sourceId+event_type+start_date
 * dedupe; a duplicate call returns the existing event row (idempotent).
 * The local cache is updated to reflect the server-canonical result, so
 * repeat dispatches don't create local duplicates either.
 */
export async function createCalendarEvent(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState(prev => prev)  // no-op to mark current state
    const existsLocally = state.events.some(e => e.id === saved.id)
    setState({
      events: existsLocally
        ? state.events.map(e => e.id === saved.id ? saved : e)
        : [saved, ...state.events],
    })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function patchCalendarEvent(id, updates) {
  const prev = state.events
  const next = prev.map(e => e.id === id ? { ...e, ...updates } : e)
  setState({ events: next })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ events: state.events.map(e => e.id === id ? saved : e) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshCalendarData()
    throw err
  }
}

export async function deleteCalendarEvent(id) {
  const prev = state.events
  setState({ events: prev.filter(e => e.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshCalendarData()
    throw err
  }
}

// ── Subscription hook ──────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshCalendarData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useCalendarData — read-only subscription to the Calendar Events vertical.
 * Returns { events, loading, error, lastFetch }.
 *
 * Each event preserves the pre-5.4a nested shape used by the Operations
 * Calendar surface: { id, category (event_type alias), date (start_date
 * alias), priority, status, title, startTime, endTime, location,
 * assignedStaff[], equipment[], tags[], notes, metadata: { sourceModule,
 * sourceId, createdAt } } — so consumers swap data source without
 * reshaping field reads.
 */
export function useCalendarData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
