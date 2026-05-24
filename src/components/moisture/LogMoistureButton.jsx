// Moisture + Handwatering Intelligence — inline trigger for the capture sheet.
//
// Phase 7A.1: this component is now a thin wrapper around MoistureCaptureSheet.
// The previous inline modal moved out so the mobile FAB can render the same
// sheet without duplicating the form. Existing call sites (MoistureOverview)
// keep working: same import path, same `compact` prop, same visual button.

import { useState } from 'react'
import MoistureCaptureSheet, { useRecentMoistureLocations } from './MoistureCaptureSheet'
import styles from './LogMoistureButton.module.css'

export default function LogMoistureButton({ compact = false }) {
  const [open, setOpen] = useState(false)
  const recentLocations = useRecentMoistureLocations(6)

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${compact ? styles.triggerCompact : ''}`}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">💧</span> Log Moisture
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
