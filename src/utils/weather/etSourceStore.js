// ET source attribution + manual reference value.
//
// Architecture note (intentional, lightweight):
//   - Ambient Weather remains the primary LIVE weather source (current
//     conditions, rainfall, humidity, wind, temperature) — untouched.
//   - The Georgia Weather Network — Savannah is the documented ET REFERENCE
//     source. Its public page is an HTTP, form-driven HTML calculator (not a
//     data feed), so we do NOT auto-scrape it (brittle + mixed-content +
//     ToS). Instead the superintendent reads the Savannah reference ET from
//     the linked calculator and enters/confirms it here. When set, it
//     overrides the locally-estimated ET; when unset, the existing local
//     estimate is used and labeled as such.
//
// Course-scoped, persisted to localStorage. No D1 schema change, no Worker
// change. useSyncExternalStore so any consumer re-renders on update.

import { useSyncExternalStore } from 'react'
import { getSelectedCourseId, subscribeCourseChange } from '../courses/courseStore'

// ── Source labels (the canonical UI strings) ───────────────────────────────
export const WEATHER_SOURCE_LABEL = 'Ambient Weather'
export const ET_SOURCE_LABEL      = 'Georgia Weather Network — Savannah'
export const ET_SOURCE_URL =
  'http://www.georgiaweather.net/mindex.php?content=calculator&variable=CC&site=SAVANNAH'

const LS_PREFIX = 'turfintel:et-savannah:'

function keyFor(courseId) {
  return `${LS_PREFIX}${courseId ?? 'default'}`
}

// state: { value: number|null, observedDate: string|null }
function readForCourse(courseId) {
  if (typeof localStorage === 'undefined') return { value: null, observedDate: null }
  try {
    const raw = localStorage.getItem(keyFor(courseId))
    if (!raw) return { value: null, observedDate: null }
    const parsed = JSON.parse(raw)
    const v = Number(parsed?.value)
    return {
      value:        Number.isFinite(v) ? v : null,
      observedDate: typeof parsed?.observedDate === 'string' ? parsed.observedDate : null,
    }
  } catch {
    return { value: null, observedDate: null }
  }
}

let state = readForCourse(getSelectedCourseId())
const subscribers = new Set()

function notify() { subscribers.forEach(cb => cb()) }

// Reload when the operational course switches.
subscribeCourseChange(() => {
  state = readForCourse(getSelectedCourseId())
  notify()
})

/**
 * Set (or clear) the manual Savannah reference ET value for the active course.
 * Pass null/'' to clear and fall back to the local estimate.
 */
export function setSavannahEt(value) {
  const courseId = getSelectedCourseId()
  const num = value === '' || value == null ? null : Number(value)
  const next = Number.isFinite(num) && num >= 0
    ? { value: parseFloat(num.toFixed(2)), observedDate: new Date().toISOString().slice(0, 10) }
    : { value: null, observedDate: null }
  state = next
  try {
    if (next.value == null) localStorage.removeItem(keyFor(courseId))
    else localStorage.setItem(keyFor(courseId), JSON.stringify(next))
  } catch { /* storage quota — keep in-memory value */ }
  notify()
}

function subscribe(cb) { subscribers.add(cb); return () => subscribers.delete(cb) }
function getSnapshot() { return state }

/**
 * useSavannahEt — { value, observedDate, source }.
 *   value        — manual reference ET (inches) or null when unset
 *   observedDate — ISO date the value was entered
 *   source       — ET_SOURCE_LABEL when a manual value is set, else null
 */
export function useSavannahEt() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    value:        s.value,
    observedDate: s.observedDate,
    source:       s.value != null ? ET_SOURCE_LABEL : null,
  }
}
