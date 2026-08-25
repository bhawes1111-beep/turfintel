import { useEffect, useSyncExternalStore } from 'react'
import { getSelectedCourseId, subscribeCourseChange, withCourseScope } from '../courses/courseStore'
import { mutationHeaders } from '../auth/mutationAuth'

const API = '/api/spray-training-briefs'

let state = { briefs: [], loading: false, error: null, lastFetch: null }
let booted = false
const listeners = new Set()

function notify() { listeners.forEach(listener => listener()) }
function setState(patch) { state = { ...state, ...patch }; notify() }
function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) }
function snapshot() { return state }

async function requestJson(url, init) {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data?.error || `${init?.method || 'GET'} ${url} failed`)
    error.status = response.status
    error.details = data
    throw error
  }
  return data
}

export async function refreshTrainingBriefs() {
  setState({ loading: true, error: null })
  try {
    const briefs = await requestJson(withCourseScope(API))
    setState({ briefs, loading: false, lastFetch: Date.now() })
    return briefs
  } catch (error) {
    setState({ loading: false, error: error.message })
    throw error
  }
}

export function useTrainingBriefs() {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)
  useEffect(() => {
    if (booted) return
    booted = true
    refreshTrainingBriefs().catch(() => {})
  }, [])
  return current
}

subscribeCourseChange(() => {
  if (booted) refreshTrainingBriefs().catch(() => {})
})

function upsertBrief(brief) {
  const exists = state.briefs.some(item => item.id === brief.id)
  setState({ briefs: exists
    ? state.briefs.map(item => item.id === brief.id ? brief : item)
    : [brief, ...state.briefs] })
  return brief
}

export async function getTrainingBrief(id) {
  return requestJson(`${API}/${encodeURIComponent(id)}`)
}

export async function createTrainingBrief(source) {
  const brief = await requestJson(API, {
    method: 'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({ courseId: getSelectedCourseId(), ...source }),
  })
  return upsertBrief(brief)
}

export async function uploadTrainingBrief(file) {
  const form = new FormData()
  form.append('courseId', getSelectedCourseId())
  form.append('file', file)
  const brief = await requestJson(`${API}/upload`, { method: 'POST', body: form })
  return upsertBrief(brief)
}

export async function updateTrainingBrief(id, updates) {
  const brief = await requestJson(`${API}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: mutationHeaders(),
    body: JSON.stringify(updates),
  })
  return upsertBrief(brief)
}

export async function approveTrainingBrief(id) {
  const brief = await requestJson(`${API}/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: mutationHeaders(),
  })
  return upsertBrief(brief)
}

export async function regenerateTrainingBrief(id) {
  const brief = await requestJson(`${API}/${encodeURIComponent(id)}/regenerate`, {
    method: 'POST',
    headers: mutationHeaders(),
  })
  return upsertBrief(brief)
}

export async function archiveTrainingBrief(id) {
  await requestJson(`${API}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: mutationHeaders(),
  })
  setState({ briefs: state.briefs.filter(item => item.id !== id) })
}

export async function acknowledgeTrainingBrief(id, responses) {
  const acknowledgment = await requestJson(`${API}/${encodeURIComponent(id)}/acknowledgments`, {
    method: 'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({ acknowledged: true, responses }),
  })
  await refreshTrainingBriefs()
  return acknowledgment
}
