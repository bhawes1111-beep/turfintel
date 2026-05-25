// Phase 7B.1 — Mobile FAB for Turf Health capture.
//
// Same shape as MoistureFab. Differences:
//   - Distinct icon (🌱) so the user reads it as a different action even
//     when both FABs render on /dashboard.
//   - Route-aware visibility: shows on /turf-health/* and /dashboard only.
//   - On /dashboard it sits ABOVE the Moisture FAB (CSS handles the offset)
//     so both are reachable one-handed without overlap.
//   - Permission gate: canEditTurfHealth (read_only + crew NEVER see it).

import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFabVisibility } from '../../utils/ui/useFabVisibility'
import TurfHealthCaptureSheet, { useRecentTurfHealthLocations } from './TurfHealthCaptureSheet'
import styles from './TurfHealthFab.module.css'

export default function TurfHealthFab() {
  const [open, setOpen] = useState(false)
  const { can } = useAuth()
  const { visible, onDashboard } = useFabVisibility('turfHealth')
  const recentLocations = useRecentTurfHealthLocations(6)

  if (!can('canEditTurfHealth')) return null
  if (!visible)                  return null

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        data-stacked={onDashboard ? 'true' : 'false'}
        onClick={() => setOpen(true)}
        aria-label="Log turf health observation"
      >
        <span aria-hidden="true">🌱</span>
      </button>
      {open && (
        <TurfHealthCaptureSheet
          onClose={() => setOpen(false)}
          recentLocations={recentLocations}
        />
      )}
    </>
  )
}
