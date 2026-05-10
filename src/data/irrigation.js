// Irrigation data — empty in production until live records are imported.
//
// Schemas:
//
// REPAIRS — [{ repairId, dateReported, dateCompleted, status, priority,
//              hole, area, headId, type, notes, ... }]
//
// CYCLES  — [{ id, area, zone, holes, startHour, durationMin, gallons,
//              pressure, status, notes }]
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
