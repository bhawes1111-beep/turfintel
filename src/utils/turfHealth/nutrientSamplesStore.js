import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'

const API = '/api/nutrient-samples'
let state = { samples: [], loading: true, error: null }
let booted = false
const subscribers = new Set()

function notify() { subscribers.forEach(callback => callback()) }
function setState(patch) { state = { ...state, ...patch }; notify() }
async function fetchJSON(url, init) {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `Request failed (${response.status})`)
  return response.json()
}

export async function refreshNutrientSamples() {
  setState({ loading: true, error: null })
  try {
    const samples = await fetchJSON(withCourseScope(API))
    setState({ samples, loading: false })
  } catch (error) { setState({ loading: false, error: error.message }) }
}

export async function createNutrientSample(payload) {
  const saved = await fetchJSON(API, {
    method: 'POST', headers: mutationHeaders(),
    body: JSON.stringify({ ...payload, courseId: getSelectedCourseId() }),
  })
  setState({ samples: [saved, ...state.samples] })
  return saved
}

export async function updateNutrientSample(id, payload) {
  const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: mutationHeaders(), body: JSON.stringify(payload),
  })
  setState({ samples: state.samples.map(sample => sample.id === id ? saved : sample) })
  return saved
}

export async function deleteNutrientSample(id) {
  await fetchJSON(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: mutationHeaders() })
  setState({ samples: state.samples.filter(sample => sample.id !== id) })
}

subscribeCourseChange(() => { if (booted) refreshNutrientSamples() })
function subscribe(callback) {
  subscribers.add(callback)
  if (!booted) { booted = true; refreshNutrientSamples() }
  return () => subscribers.delete(callback)
}
function snapshot() { return state }
export function useNutrientSamplesData() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
