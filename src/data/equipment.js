// Equipment data — empty in production until live records are imported.
//
// Schemas:
//
// EQUIPMENT_LIST — [{ id, name, category, manufacturer, model, serialNumber,
//                     year, hours, serviceInterval, lastService,
//                     lastServiceHours, nextServiceHours, status,
//                     assignedOperator, fuelType, notes }]
// SERVICE_LOG    — [{ id, equipmentId, equipmentName, category, serviceType,
//                     technician, date, hoursAtService, nextDueHours, status,
//                     priority, completedDate, cost, partsUsed, notes }]

export const EQUIPMENT_LIST = []
export const SERVICE_LOG    = []
