import { useCallback, useEffect, useState } from 'react'
import { getSelectedCourseId, subscribeCourseChange, withCourseScope } from '../courses/courseStore'

export const DASHBOARD_MODULES = [
  { id: 'command', label: 'Priorities & actions' },
  { id: 'nutrientAlerts', label: 'Nutrient alerts' },
  { id: 'applicationTiming', label: 'Application timing & coverage' },
  { id: 'operations', label: 'Operations' },
  { id: 'readiness', label: 'Overnight & crew readiness' },
  { id: 'weather', label: 'Weather' },
  { id: 'agronomy', label: 'Agronomic intelligence' },
  { id: 'irrigation', label: 'Irrigation intelligence' },
  { id: 'gdd', label: 'Growing degree days' },
  { id: 'stewardship', label: 'Stewardship alerts' },
  { id: 'calendar', label: 'Operations calendar' },
]

export const DEFAULT_DASHBOARD_LAYOUT = {
  order: DASHBOARD_MODULES.map(item => item.id),
  hidden: [],
}

const API = '/api/dashboard-preferences'

function storageKey() {
  return `turfintel:dashboard-layout:${getSelectedCourseId()}`
}

function normalize(value) {
  const valid = new Set(DASHBOARD_MODULES.map(item => item.id))
  const order = Array.isArray(value?.order)
    ? [...new Set(value.order.filter(id => valid.has(id)))]
    : []
  for (let index = 0; index < DASHBOARD_MODULES.length; index += 1) {
    const id = DASHBOARD_MODULES[index].id
    if (order.includes(id)) continue
    const preceding = DASHBOARD_MODULES
      .slice(0, index)
      .map(item => item.id)
      .filter(candidate => order.includes(candidate))
    const insertAt = preceding.length > 0
      ? order.lastIndexOf(preceding[preceding.length - 1]) + 1
      : 0
    order.splice(insertAt, 0, id)
  }
  const hidden = Array.isArray(value?.hidden)
    ? [...new Set(value.hidden.filter(id => valid.has(id)))]
    : []
  return { order, hidden }
}

function loadLocal() {
  try { return normalize(JSON.parse(localStorage.getItem(storageKey()) || 'null')) }
  catch { return { ...DEFAULT_DASHBOARD_LAYOUT } }
}

function saveLocal(layout) {
  try { localStorage.setItem(storageKey(), JSON.stringify(layout)) } catch { /* offline/private mode */ }
}

export function useDashboardPreferences() {
  const [layout, setLayoutState] = useState(loadLocal)
  const [syncState, setSyncState] = useState('loading')

  const load = useCallback(async () => {
    const local = loadLocal()
    try {
      const response = await fetch(withCourseScope(API), { credentials: 'same-origin' })
      if (!response.ok) throw new Error(`GET ${API} -> ${response.status}`)
      const data = await response.json()
      const next = data?.layout ? normalize(data.layout) : local
      setLayoutState(next)
      saveLocal(next)
      setSyncState('synced')
    } catch {
      setLayoutState(local)
      setSyncState('local')
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    const unsubscribe = subscribeCourseChange(load)
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [load])

  const saveLayout = useCallback(async nextValue => {
    const next = normalize(nextValue)
    setLayoutState(next)
    saveLocal(next)
    setSyncState('saving')
    try {
      const response = await fetch(withCourseScope(API), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: next }),
      })
      if (!response.ok) throw new Error(`PUT ${API} -> ${response.status}`)
      setSyncState('synced')
    } catch {
      setSyncState('local')
    }
  }, [])

  const resetLayout = useCallback(
    () => saveLayout(DEFAULT_DASHBOARD_LAYOUT),
    [saveLayout],
  )

  return { layout, saveLayout, resetLayout, syncState }
}
