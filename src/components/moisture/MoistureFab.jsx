// Phase 7A.1 — Persistent mobile FAB for moisture capture.
// Route-aware: shows on /turf-health/* and /dashboard only.
// On /dashboard it sits at the bottom slot (Turf Health FAB stacks above).
//
// Hidden on ≥ 768px (desktop already has the in-page LogMoistureButton in
// MoistureOverview). Gated on `canEditMoisture` so read-only roles never
// see it.
//
// The FAB does ONE thing: opens MoistureCaptureSheet. All capture logic
// (presets, optimistic submit, retry) lives in the sheet/store.

import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFabVisibility } from '../../utils/ui/useFabVisibility'
import MoistureCaptureSheet, { useRecentMoistureLocations } from './MoistureCaptureSheet'
import styles from './MoistureFab.module.css'

export default function MoistureFab() {
  const [open, setOpen] = useState(false)
  const { can } = useAuth()
  const { visible } = useFabVisibility('moisture')
  const recentLocations = useRecentMoistureLocations(6)

  if (!can('canEditMoisture')) return null
  if (!visible)                return null

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
