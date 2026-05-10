// Equipment data — moved to D1 persistence in Phase 5.0.
// Consumers now use the equipmentStore (src/utils/equipment/equipmentStore.js).
//
// Schemas (for reference; SQL truth lives in worker/migrations/0001_init.sql):
//
// equipment      — { id, name, category, manufacturer, model, serialNumber,
//                    year, hours, serviceInterval, lastService,
//                    lastServiceHours, nextServiceHours, status,
//                    assignedOperator, fuelType, notes, createdAt, updatedAt }
//
// maintenance_logs — { id, equipmentId, equipmentName, category, serviceType,
//                      technician, date, hoursAtService, nextDueHours, status,
//                      priority, completedDate, cost, partsUsed, notes,
//                      createdAt }
//
// Legacy empty arrays are preserved so any unforeseen import compiles
// against an empty list rather than crashing. They are no longer the
// source of truth for any consumer in the app.
export const EQUIPMENT_LIST = []
export const SERVICE_LOG    = []
