import { useSyncExternalStore } from 'react'
import { withCourseScope, subscribeCourseChange, getSelectedCourseId } from '../courses/courseStore'
import { mutationHeaders } from '../auth/mutationAuth'

const API = '/api/weekly-goals'
const OPTIONS_API = '/api/weekly-goal-options'
let state = { goals: [], goalOptions: [], loading: true, error: null, lastFetch: null }
let hasBooted = false
const subscribers = new Set()

function notify() { subscribers.forEach(callback => callback()) }
function setState(patch) { state = { ...state, ...patch }; notify() }

async function fetchJSON(url, init) {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} -> ${response.status} ${body}`)
  }
  return response.json()
}

export async function refreshWeeklyGoalsData() {
  setState({ loading: true, error: null })
  try {
    const [goals, goalOptions] = await Promise.all([
      fetchJSON(withCourseScope(API)),
      fetchJSON(withCourseScope(OPTIONS_API)),
    ])
    setState({ goals, goalOptions, loading: false, error: null, lastFetch: Date.now() })
  } catch (error) {
    setState({ loading: false, error: error.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshWeeklyGoalsData() })

export async function createWeeklyGoal(payload) {
  const saved = await fetchJSON(API, {
    method: 'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
  })
  setState({ goals: [saved, ...state.goals] })
  if (['not-done', 'in-progress'].includes(saved.status)) await refreshWeeklyGoalsData()
  return saved
}

export async function patchWeeklyGoal(id, updates) {
  const previous = state.goals
  setState({ goals: previous.map(goal => goal.id === id ? { ...goal, ...updates } : goal) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: mutationHeaders(),
      body: JSON.stringify(updates),
    })
    setState({ goals: state.goals.map(goal => goal.id === id ? saved : goal) })
    if (['not-done', 'in-progress'].includes(saved.status)) await refreshWeeklyGoalsData()
    return saved
  } catch (error) {
    setState({ goals: previous, error: error.message })
    throw error
  }
}

export async function deleteWeeklyGoal(id) {
  const previous = state.goals
  setState({ goals: previous.filter(goal => goal.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: mutationHeaders(),
    })
  } catch (error) {
    setState({ goals: previous, error: error.message })
    throw error
  }
}

export async function createWeeklyGoalOption(label) {
  const saved = await fetchJSON(OPTIONS_API, {
    method: 'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({ courseId: getSelectedCourseId(), label }),
  })
  if (!state.goalOptions.some(option => option.id === saved.id)) {
    setState({
      goalOptions: [...state.goalOptions, saved]
        .sort((a, b) => a.label.localeCompare(b.label)),
    })
  }
  return saved
}

export async function deleteWeeklyGoalOption(id) {
  await fetchJSON(`${OPTIONS_API}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: mutationHeaders(),
  })
  setState({ goalOptions: state.goalOptions.filter(option => option.id !== id) })
}

function subscribe(callback) {
  subscribers.add(callback)
  if (!hasBooted) { hasBooted = true; refreshWeeklyGoalsData() }
  return () => subscribers.delete(callback)
}

function getSnapshot() { return state }

export function useWeeklyGoalsData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
