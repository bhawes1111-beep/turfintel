// Cloud-backed Task Library categories.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'

const API = '/api/task-categories'

export const DEFAULT_TASK_CATEGORIES = [
  { id: 'default-crew',        slug: 'crew',        name: 'Crew',        sortOrder: 10, activeCount: 0, totalCount: 0 },
  { id: 'default-irrigation',  slug: 'irrigation',  name: 'Irrigation',  sortOrder: 20, activeCount: 0, totalCount: 0 },
  { id: 'default-spray',       slug: 'spray',       name: 'Spray',       sortOrder: 30, activeCount: 0, totalCount: 0 },
  { id: 'default-agronomy',    slug: 'agronomy',    name: 'Agronomy',    sortOrder: 40, activeCount: 0, totalCount: 0 },
  { id: 'default-maintenance', slug: 'maintenance', name: 'Maintenance', sortOrder: 50, activeCount: 0, totalCount: 0 },
]

let state = {
  categories: DEFAULT_TASK_CATEGORIES,
  loading:    true,
  error:      null,
  lastFetch:  null,
}

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

export function normalizeTaskCategorySlug(value) {
  return (value ?? '').trim().toLowerCase()
}

export function taskCategoryLabelFor(categories, category) {
  const slug = normalizeTaskCategorySlug(category)
  if (!slug) return 'Other'
  const match = (categories ?? []).find(c => normalizeTaskCategorySlug(c.slug) === slug)
  return match?.name ?? 'Other'
}

function sortCategories(categories) {
  return [...(Array.isArray(categories) ? categories : [])]
    .filter(c => c && c.slug)
    .sort((a, b) => {
      const sa = a.sortOrder ?? 0
      const sb = b.sortOrder ?? 0
      if (sa !== sb) return sa - sb
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
}

export async function refreshTaskCategoriesData() {
  setState({ loading: true, error: null })
  try {
    const categories = await fetchJSON(withCourseScope(API))
    setState({
      categories: sortCategories(categories),
      loading: false,
      error: null,
      lastFetch: Date.now(),
    })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

export async function createTaskCategory(payload) {
  const saved = await fetchJSON(API, {
    method:  'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({
      courseId: getSelectedCourseId(),
      ...payload,
    }),
  })
  const exists = state.categories.some(c => c.id === saved.id || c.slug === saved.slug)
  setState({
    categories: sortCategories(exists
      ? state.categories.map(c => (c.id === saved.id || c.slug === saved.slug) ? saved : c)
      : [...state.categories, saved]),
  })
  return saved
}

export async function patchTaskCategory(id, updates) {
  const prev = state.categories
  setState({
    categories: sortCategories(prev.map(c => c.id === id ? { ...c, ...updates } : c)),
  })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({
      categories: sortCategories(state.categories.map(c => c.id === id ? saved : c)),
    })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshTaskCategoriesData()
    throw err
  }
}

export async function deleteTaskCategory(id) {
  const prev = state.categories
  setState({ categories: prev.filter(c => c.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshTaskCategoriesData()
    throw err
  }
}

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshTaskCategoriesData()
    subscribeCourseChange(refreshTaskCategoriesData)
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

export function useTaskCategoriesData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
