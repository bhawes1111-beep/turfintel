import { useEffect, useState } from 'react'
import { getSelectedCourseId, subscribeCourseChange } from '../courses/courseStore.js'
import {
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
    return { ...DEFAULT_MOISTURE_DISPLAY_SETTINGS }
  }
}

function saveSettings(settings) {
  try { localStorage.setItem(storageKey(), JSON.stringify(settings)) } catch { /* offline/private mode */ }
}

export function useMoistureDisplaySettings() {
  const [settings, setSettings] = useState(loadSettings)

  useEffect(() => subscribeCourseChange(() => setSettings(loadSettings())), [])

  function updateSetting(name, value) {
    setSettings(current => {
      const candidate = { ...current, [name]: value }
      if (name === 'dryBelow' && Number(value) >= current.wetAbove) {
        candidate.dryBelow = current.wetAbove - .1
      }
      if (name === 'wetAbove' && Number(value) <= current.dryBelow) {
        candidate.wetAbove = current.dryBelow + .1
      }
      const next = normalizeMoistureDisplaySettings(candidate)
      saveSettings(next)
      return next
    })
  }

  function resetSettings() {
    const next = { ...DEFAULT_MOISTURE_DISPLAY_SETTINGS }
    saveSettings(next)
    setSettings(next)
  }

  return { settings, updateSetting, resetSettings }
}
