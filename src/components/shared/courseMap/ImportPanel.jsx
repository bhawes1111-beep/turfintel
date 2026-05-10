/**
 * ImportPanel — drop-in UI for adding KML files to any layer.
 *
 * Props:
 *   addFeatures   (layerKey, features[]) => void   — from useCourseGeoStore
 *   clearImports  (layerKey?) => void              — from useCourseGeoStore
 *   importCounts  Record<string, number>           — from useCourseGeoStore
 *
 * Phase 2 supports plain .kml only. KMZ users should re-export from
 * Google Earth as KML, not KMZ.
 */

import { useRef, useState } from 'react'
import { LAYERS } from '../../../utils/geo/featureRegistry'
import { importKML } from '../../../utils/geo/imports'
import styles from './CourseMap.module.css'

// Layers that accept user imports. opsCommand-style composites and reserved
// layers without a clear KML use case are excluded.
const IMPORTABLE_LAYERS = [
  'irrigationHeads',
  'sprinklerRoutes',
  'gpsTracks',
  'greens',
  'fairways',
  'tees',
  'rough',
  'bunkers',
  'sprayCoverage',
  'equipmentTelemetry',
]

export default function ImportPanel({ addFeatures, clearImports, importCounts }) {
  const fileRef = useRef(null)
  const [layerKey, setLayerKey] = useState('irrigationHeads')
  const [status,   setStatus]   = useState({ kind: 'idle', text: '' })

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onerror = () => setStatus({ kind: 'error', text: 'Could not read file' })
    reader.onload  = () => {
      try {
        const fc = importKML(String(reader.result), layerKey)
        addFeatures(layerKey, fc.features)
        const n = fc.features.length
        setStatus({
          kind: 'success',
          text: `Imported ${n} feature${n === 1 ? '' : 's'} into ${LAYERS[layerKey].label}`,
        })
      } catch (err) {
        setStatus({ kind: 'error', text: err.message || 'Import failed' })
      }
    }
    reader.readAsText(file)
    // Reset so the same file can be re-picked
    e.target.value = ''
  }

  const counts        = importCounts ?? {}
  const totalImported = Object.values(counts).reduce((a, b) => a + b, 0)
  const layerImported = counts[layerKey] ?? 0

  return (
    <div className={styles.importPanel}>
      <div className={styles.importHeader}>
        <span className={styles.importTitle}>Import KML</span>
        <span className={styles.importHint}>Google Earth · GPS export</span>
      </div>

      <div className={styles.importRow}>
        <label className={styles.importLabel}>Layer</label>
        <select
          className={styles.importSelect}
          value={layerKey}
          onChange={e => setLayerKey(e.target.value)}
        >
          {IMPORTABLE_LAYERS.map(key => (
            <option key={key} value={key}>
              {LAYERS[key].icon}  {LAYERS[key].label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.importRow}>
        <input
          ref={fileRef}
          type="file"
          accept=".kml,application/vnd.google-earth.kml+xml,text/xml,application/xml"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className={styles.importBtn}
          onClick={() => fileRef.current?.click()}
        >
          Choose KML file
        </button>
        {layerImported > 0 && (
          <button
            type="button"
            className={styles.importClearBtn}
            onClick={() => {
              clearImports(layerKey)
              setStatus({ kind: 'info', text: `Cleared ${LAYERS[layerKey].label} imports` })
            }}
            title={`Clear ${LAYERS[layerKey].label} imports`}
          >
            Clear layer
          </button>
        )}
      </div>

      {status.kind !== 'idle' && (
        <div
          className={`${styles.importStatus} ${
            status.kind === 'success' ? styles.importStatusSuccess
            : status.kind === 'error' ? styles.importStatusError
            : styles.importStatusInfo
          }`}
        >
          {status.text}
        </div>
      )}

      {totalImported > 0 && (
        <div className={styles.importCounts}>
          {Object.entries(counts)
            .filter(([, n]) => n > 0)
            .map(([key, n]) => (
              <span key={key} className={styles.importCountChip}>
                <span style={{ color: LAYERS[key]?.fill ?? '#4ade80' }}>
                  {LAYERS[key]?.icon ?? '•'}
                </span>
                {LAYERS[key]?.label ?? key}: {n}
              </span>
            ))}
          <button
            type="button"
            className={styles.importClearAllBtn}
            onClick={() => {
              clearImports()
              setStatus({ kind: 'info', text: 'Cleared all imports' })
            }}
          >
            Clear all
          </button>
        </div>
      )}

      <div className={styles.importFootnote}>
        Plain .kml only. From Google Earth: <em>Save Place As → Kml</em> (not Kmz).
      </div>
    </div>
  )
}
