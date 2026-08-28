import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import { getSelectedCourseId, subscribeCourseChange, withCourseScope } from '../courses/courseStore'
import { refreshNutrientSamples } from './nutrientSamplesStore'

const API = '/api/nutrient-report-imports'
let state = { imports: [], loading: true, error: null }
let booted = false
const subscribers = new Set()

function notify() { subscribers.forEach(callback => callback()) }
function setState(patch) { state = { ...state, ...patch }; notify() }
async function responseJSON(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `Request failed (${response.status})`)
  }
  return response.json()
}

export async function refreshNutrientReportImports() {
  setState({ loading: true, error: null })
  try {
    const imports = await responseJSON(await fetch(withCourseScope(API), { credentials: 'same-origin' }))
    setState({ imports, loading: false })
  } catch (error) { setState({ loading: false, error: error.message }) }
}

export async function uploadNutrientReport(file, sampleType) {
  const form = new FormData()
  form.append('file', file)
  form.append('sampleType', sampleType)
  form.append('courseId', getSelectedCourseId())
  const saved = await responseJSON(await fetch(API, {
    method: 'POST', credentials: 'same-origin', body: form,
  }))
  setState({ imports: [saved, ...state.imports] })
  return saved
}

export async function approveNutrientReport(id, sample) {
  const result = await responseJSON(await fetch(`${API}/${encodeURIComponent(id)}/approve`, {
    method: 'POST', credentials: 'same-origin', headers: mutationHeaders(), body: JSON.stringify(sample),
  }))
  setState({ imports: state.imports.map(item => item.id === id ? result.import : item) })
  await refreshNutrientSamples()
  return result
}

export async function deleteNutrientReport(id) {
  await responseJSON(await fetch(`${API}/${encodeURIComponent(id)}`, {
    method: 'DELETE', credentials: 'same-origin', headers: mutationHeaders(),
  }))
  setState({ imports: state.imports.filter(item => item.id !== id) })
}

subscribeCourseChange(() => { if (booted) refreshNutrientReportImports() })
function subscribe(callback) {
  subscribers.add(callback)
  if (!booted) { booted = true; refreshNutrientReportImports() }
  return () => subscribers.delete(callback)
}
function snapshot() { return state }

export function useNutrientReportImportsData() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
