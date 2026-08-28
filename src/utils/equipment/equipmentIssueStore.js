import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'
import { mutationHeaders } from '../auth/mutationAuth'

const API = '/api/equipment-issues'
const PUBLIC_BOARD_API = '/api/display-board/equipment-board'
const PUBLIC_SUBMIT_API = '/api/display-board/equipment-issues'

let state = {
  issues:    [],
  loading:   true,
  error:     null,
  lastFetch: null,
}

const subscribers = new Set()
let hasBooted = false

function notify() {
  subscribers.forEach(cb => cb())
}

function setState(patch) {
  state = { ...state, ...patch }
  notify()
}

async function fetchJSON(url, init) {
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} -> ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshEquipmentIssues() {
  setState({ loading: true, error: null })
  try {
    const issues = await fetchJSON(withCourseScope(API))
    setState({ issues, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshEquipmentIssues() })

export async function createEquipmentIssue(payload) {
  const saved = await fetchJSON(API, {
    method:  'POST',
    headers: mutationHeaders(),
    body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
  })
  setState({ issues: [saved, ...state.issues] })
  return saved
}

export async function patchEquipmentIssue(id, updates) {
  const prev = state.issues
  setState({ issues: prev.map(issue => issue.id === id ? { ...issue, ...updates } : issue) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ issues: state.issues.map(issue => issue.id === id ? saved : issue) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshEquipmentIssues()
    throw err
  }
}

export async function deleteEquipmentIssue(id) {
  const prev = state.issues
  setState({ issues: prev.filter(issue => issue.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshEquipmentIssues()
    throw err
  }
}

export async function fetchEquipmentBoardState(courseId = getSelectedCourseId()) {
  const url = courseId
    ? `${PUBLIC_BOARD_API}?courseId=${encodeURIComponent(courseId)}`
    : PUBLIC_BOARD_API
  return fetchJSON(url)
}

export async function submitPublicEquipmentIssue(payload) {
  return fetchJSON(PUBLIC_SUBMIT_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
  })
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshEquipmentIssues()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() {
  return state
}

export function useEquipmentIssuesData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
