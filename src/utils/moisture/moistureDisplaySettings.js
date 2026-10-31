import { useEffect, useState } from 'react'
import { getSelectedCourseId, subscribeCourseChange } from '../courses/courseStore.js'
import {
  cloneDefaultMoistureDisplaySettings,
  DEFAULT_MOISTURE_DISPLAY_SETTINGS,
  normalizeMoistureDisplaySettings,
} from './moistureDisplayConfig.js'

const STORAGE_PREFIX = 'turfintel:moisture-display:'

function storageKey() {
  return `${STORAGE_PREFIX}${getSelectedCourseId()}`
}

function loadSettings() {
  try {
    return normalizeMoistureDisplaySettings(JSON.parse(localStorage.getItem(storageKey()) || 'null'))
  } catch {
    return cloneDefaultMoistureDisplaySettings()
  }
}

function saveSettings(settings) {
  try { localStorage.setItem(storageKey(), JSON.stringify(settings)) } catch { /* offline/private mode */ }
}

export function useMoistureDisplaySettings() {
  const [settings, setSettings] = useState(loadSettings)

  useEffect(() => subscribeCourseChange(() => setSettings(loadSettings())), [])

  function updateScale(section, metricId, scale) {
    setSettings(current => {
      const candidate = section === 'moisture'
        ? { ...current, moisture: scale }
        : { ...current, tdr: { ...current.tdr, [metricId]: scale } }
      const next = normalizeMoistureDisplaySettings(candidate)
      saveSettings(next)
      return next
    })
  }

  function resetSettings() {
    const next = cloneDefaultMoistureDisplaySettings()
    saveSettings(next)
    setSettings(next)
  }

  function resetScale(section, metricId) {
    const fallback = section === 'moisture'
      ? DEFAULT_MOISTURE_DISPLAY_SETTINGS.moisture
      : DEFAULT_MOISTURE_DISPLAY_SETTINGS.tdr[metricId]
    updateScale(section, metricId, fallback)
  }

  return { settings, updateScale, resetScale, resetSettings }
}
