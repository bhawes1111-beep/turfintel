// Inventory data — empty in production until live records are imported.
// Each category is its own export so tabs only import what they need.
//
// Schemas:
// PRODUCTS         — [{ id, name, category, unit, onHand, reorderLevel, ... }]
// CHEMICALS        — [{ id, name, manufacturer, epaNumber, onHand, ... }]
// FERTILIZERS      — [{ id, name, analysis, onHand, ... }]
// PARTS            — [{ id, name, partNumber, category, onHand, ... }]
// FUEL             — [{ id, type, gallonsOnHand, lastDelivery, ... }]
// PURCHASE_HISTORY — [{ id, date, vendor, item, quantity, total, ... }]

export const PRODUCTS         = []
export const CHEMICALS        = []
export const FERTILIZERS      = []
export const PARTS            = []
export const FUEL             = []
export const PURCHASE_HISTORY = []
