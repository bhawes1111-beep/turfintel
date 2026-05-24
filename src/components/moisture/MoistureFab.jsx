// Phase 7A.1 — Persistent mobile FAB for moisture capture.
//
// Rendered from Layout.jsx so every authenticated route has the same
// one-tap entry point. Hidden on ≥ 768px (desktop already has the in-page
// LogMoistureButton in MoistureOverview). Gated on `canEditMoisture` so
// read-only roles never see it.
//
// The FAB does ONE thing: opens MoistureCaptureSheet. All capture logic
// (presets, optimistic submit, retry) lives in the sheet/store.

import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import MoistureCaptureSheet, { useRecentMoistureLocations } from './MoistureCaptureSheet'
import styles from './MoistureFab.module.css'

export default function MoistureFab() {
  const [open, setOpen] = useState(false)
  const { can } = useAuth()
  const recentLocations = useRecentMoistureLocations(6)

  if (!can('canEditMoisture')) return null

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        onClick={() => setOpen(true)}
        aria-label="Log moisture observation"
      >
        <span aria-hidden="true">💧</span>
      </button>
      {open && (
        <MoistureCaptureSheet
          onClose={() => setOpen(false)}
          recentLocations={recentLocations}
        />
      )}
    </>
  )
}
