// Irrigation data.
//
// REPAIRS moved to D1 persistence in Phase 5.1c. Consumers now use
// repairsStore (src/utils/repairs/repairsStore.js). The empty array
// export below is preserved as a defensive backstop for any unforeseen
// import; it is no longer the source of truth for any consumer.
//
// CYCLES remains a static (empty) export until the Irrigation Cycle
// domain migrates — Phase 5.x.
//
// Schemas (for reference; SQL truth for repairs lives in
// worker/migrations/0002_repairs.sql):
//
// repairs — { id, repairId, issueType, area, hole, headNumber, description,
//             priority, status, assignedTo, laborHours, partsUsed,
//             dateReported, dateCompleted, notes, createdAt, updatedAt }
//
// CYCLES — [{ id, area, zone, holes, startHour, durationMin, gallons,
//             pressure, status, notes }]
//   area:      'Greens' | 'Tees' | 'Fairways' | 'Approaches' | 'Roughs'
//   zone:      Free-form zone label (e.g. 'Greens — Hole 1')
//   holes:     Array of hole numbers covered (e.g. [1] or [1, 2, 3])
//   startHour: Decimal hour in the night-window domain. 18.0 = 6:00 PM
//              tonight, 24.0 = midnight, 30.0 = 6:00 AM tomorrow.
//   durationMin: Cycle duration in minutes.
//   gallons:    Volume applied or planned (optional).
//   pressure:   PSI reading at time of run (optional).
//   status:    'scheduled' | 'running' | 'completed' | 'delayed' | 'fault' | 'skipped'
//   notes:     Free-form text (optional).

export const REPAIRS = []
export const CYCLES  = []
