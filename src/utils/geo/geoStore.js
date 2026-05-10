/**
 * useCourseGeoStore — runtime layer on top of the static courseGeo data.
 *
 * Combines:
 *   - Static base geometry from src/data/courseGeo.js
 *   - User-imported features (KML / future Emlid / Toro / etc.)
 *
 * Imports persist to localStorage (key: turfintel-geo-imports-<courseId>) so
 * they survive reload. When a backend exists, this same shape moves
 * server-side without renderer changes.
 *
 * Returned API:
 *   geo            : merged FeatureCollections keyed by layer (renderer reads this)
 *   addFeatures    : (layerKey, features[]) → append + persist
 *   clearImports   : (layerKey?) → clear one layer or all
 *   importCounts   : per-layer count of runtime-imported features
 */

import { useState, useEffect } from 'react'
import { loadSync, save } from '../persistence/persistence'
import { getCourseGeo } from '../../data/courseGeo'
import { LAYER_KEYS } from './featureRegistry'

const KEY_PREFIX = 'turfintel-geo-imports'

function importsKey(courseId) {
  return `${KEY_PREFIX}-${courseId}`
}

function emptyImports() {
  return {}
}

export function useCourseGeoStore(courseId) {
  const [imports, setImports] = useState(() => loadSync(importsKey(courseId)) || emptyImports())

  // Reload imports when the course changes.
  useEffect(() => {
    setImports(loadSync(importsKey(courseId)) || emptyImports())
  }, [courseId])

  // Persist on change.
  useEffect(() => {
    save(importsKey(courseId), imports)
  }, [courseId, imports])

  // Merge static base + runtime imports per layer.
  const baseGeo = getCourseGeo(courseId)
  const geo     = {}
  for (const key of LAYER_KEYS) {
    const baseFeatures   = baseGeo[key]?.features    ?? []
    const importFeatures = imports[key]?.features    ?? []
    geo[key] = {
      type:     'FeatureCollection',
      features: [...baseFeatures, ...importFeatures],
    }
  }

  function addFeatures(layerKey, newFeatures) {
    if (!Array.isArray(newFeatures) || newFeatures.length === 0) return
    setImports(prev => {
      const existing = prev[layerKey]?.features ?? []
      return {
        ...prev,
        [layerKey]: {
          type:     'FeatureCollection',
          features: [...existing, ...newFeatures],
        },
      }
    })
  }

  function clearImports(layerKey) {
    if (layerKey) {
      setImports(prev => {
        if (!prev[layerKey]) return prev
        const next = { ...prev }
        delete next[layerKey]
        return next
      })
    } else {
      setImports(emptyImports())
    }
  }

  const importCounts = {}
  for (const key of LAYER_KEYS) {
    importCounts[key] = imports[key]?.features?.length ?? 0
  }

  return { geo, addFeatures, clearImports, importCounts }
}
