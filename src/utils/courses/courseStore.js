// Courses data store + operational-scope helpers (Phase 5.7).
//
// Two concerns live here:
//
// 1. The courses list itself — useCoursesData() — boots from
//    /api/courses, follows the same vertical-store pattern as the
//    other nine stores.
//
// 2. The selected operational course id — getSelectedCourseId() /
//    setSelectedCourseId() / useSelectedCourse() — backed by
//    localStorage. Setting a new course id notifies every other
//    vertical store via subscribeCourseChange() so they refetch with
//    the new scope. Default: 'crossroads-gc'.
//
// The geo "active course" concept in src/context/CourseContext is
// separate and unchanged — it owns map lat/lng/aerial, not data scope.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'

const API = '/api/courses'
const LS_KEY = 'turfintel:selected-course-id'
const DEFAULT_COURSE_ID = 'crossroads-gc'


// ── Courses list cache ─────────────────────────────────────────────────────

let state = {
  courses:   [],
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

export async function refreshCoursesData() {
  setState({ loading: true, error: null })
  try {
    const courses = await fetchJSON(API)
    setState({ courses, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshCoursesData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

export function useCoursesData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ── Selected-course module state ───────────────────────────────────────────
//
// Lives in module scope so non-React callers (vertical stores, scope helpers)
// can read it synchronously. Mirror copy in localStorage survives reload.

let selectedCourseId = DEFAULT_COURSE_ID
try {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) selectedCourseId = stored
  }
} catch {
  // localStorage unavailable (SSR, private mode) — stay on default.
}

const selectedSubscribers = new Set()
const courseChangeSubscribers = new Set()

function notifySelected() {
  selectedSubscribers.forEach(cb => cb())
}

export function getSelectedCourseId() {
  return selectedCourseId
}

export function setSelectedCourseId(id) {
  if (!id || id === selectedCourseId) return
  selectedCourseId = id
  try { localStorage.setItem(LS_KEY, id) } catch {}
  notifySelected()
  // Tell every vertical store that scope changed — they refresh.
  courseChangeSubscribers.forEach(cb => cb(id))
}

/**
 * Vertical stores call this once at module load. The supplied callback
 * fires whenever the operational scope changes — usually a refreshXData().
 */
export function subscribeCourseChange(cb) {
  courseChangeSubscribers.add(cb)
  return () => courseChangeSubscribers.delete(cb)
}

function subscribeSelected(cb) {
  selectedSubscribers.add(cb)
  return () => selectedSubscribers.delete(cb)
}

function getSelectedSnapshot() {
  return selectedCourseId
}

/** Returns the selected course id (live, re-renders on change). */
export function useSelectedCourseId() {
  return useSyncExternalStore(subscribeSelected, getSelectedSnapshot, getSelectedSnapshot)
}

/** Returns the full course object for the current selection (or null). */
export function useSelectedCourse() {
  const id      = useSelectedCourseId()
  const { courses } = useCoursesData()
  return courses.find(c => c.id === id) ?? null
}

// ── Scope helper for fetch URLs ───────────────────────────────────────────

/**
 * Appends ?courseId=... to a URL using the current selected course.
 * Verticals call this on every GET so Worker list endpoints filter.
 */
export function withCourseScope(url) {
  const id = selectedCourseId
  if (!id) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}courseId=${encodeURIComponent(id)}`
}

// ── Optional admin mutations ──────────────────────────────────────────────

export async function createCourse(payload) {
  const saved = await fetchJSON(API, {
    method:  'POST',
    headers: mutationHeaders(),
    body:    JSON.stringify(payload),
  })
  setState({ courses: [...state.courses, saved] })
  return saved
}

export async function patchCourse(id, updates) {
  const prev = state.courses
  setState({ courses: prev.map(c => c.id === id ? { ...c, ...updates } : c) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ courses: state.courses.map(c => c.id === id ? saved : c) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshCoursesData()
    throw err
  }
}

export async function deleteCourse(id) {
  const prev = state.courses
  setState({ courses: prev.filter(c => c.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshCoursesData()
    throw err
  }
}
