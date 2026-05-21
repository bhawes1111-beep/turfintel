// Irrigation Intelligence Foundation — water-balance data store.
//
// Read-only subscription to the daily_water_balance rollup (D1-backed,
// course-scoped). Mirrors the weatherHistory/feedback store pattern:
// module-level cache, useSyncExternalStore, course-scoped refetch. No
// local-only analytics — the rows come straight from /api/water-balance.

import { useSyncExternalStore } from 'react'
import {
  withCourseScope,
  subscribeCourseChange,
} from '../courses/courseStore'

const API = '/api/water-balance'

let state = {
  balance:   [],     // daily rows, newest first
  loading:   true,
  error:     null,
  lastFetch: null,
}

const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) { state = { ...state, ...patch }; notify() }

async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GET ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshWaterBalance(opts = {}) {
  setState({ loading: true, error: null })
  try {
    let url = withCourseScope(API)
    if (opts.days) url += `&days=${encodeURIComponent(opts.days)}`
    const balance = await fetchJSON(url)
    setState({ balance, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

// Refetch when the operational course switches.
subscribeCourseChange(() => { if (hasBooted) refreshWaterBalance() })

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshWaterBalance({ days: 30 })
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useWaterBalance — { balance, loading, error, lastFetch }.
 * `balance` is the daily_water_balance rows, newest first.
 */
export function useWaterBalance() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
