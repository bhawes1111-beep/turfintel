import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'
import { mutationHeaders } from '../auth/mutationAuth'

const API = '/api/employee-training'

let state = {
  records:   [],
  loading:   true,
  error:     null,
  lastFetch: null,
}

const disabledState = { ...state, loading: false, error: null }
const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
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

export async function refreshEmployeeTrainingData() {
  setState({ loading: true, error: null })
  try {
    const records = await fetchJSON(withCourseScope(API))
    setState({ records, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshEmployeeTrainingData() })

export async function createEmployeeTraining(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ records: [saved, ...state.records] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

export async function patchEmployeeTraining(id, updates) {
  const prev = state.records
  setState({ records: prev.map(record => record.id === id ? { ...record, ...updates } : record) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ records: state.records.map(record => record.id === id ? saved : record) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshEmployeeTrainingData()
    throw err
  }
}

export async function deleteEmployeeTraining(id) {
  const prev = state.records
  setState({ records: prev.filter(record => record.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshEmployeeTrainingData()
    throw err
  }
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshEmployeeTrainingData()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }
function getDisabledSnapshot() { return disabledState }
function subscribeDisabled() { return () => {} }

export function useEmployeeTrainingData({ enabled = true } = {}) {
  return useSyncExternalStore(
    enabled ? subscribe : subscribeDisabled,
    enabled ? getSnapshot : getDisabledSnapshot,
    enabled ? getSnapshot : getDisabledSnapshot,
  )
}
