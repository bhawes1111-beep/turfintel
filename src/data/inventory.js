// Inventory data — moved to D1 persistence in Phase 5.2.
// Consumers now use inventoryStore (src/utils/inventory/inventoryStore.js).
//
// Schemas (for reference; SQL truth lives in
// worker/migrations/0004_inventory.sql):
//
// inventory_items — { id, kind, name, category, unit, quantity,
//                     reorderLevel, location, vendor, costPerUnit, notes,
//                     manufacturer, epaNumber, expiryDate,  // chemical
//                     partNumber, equipment,                 // part
//                     analysis,                              // fertilizer
//                     tankCapacity, currentLevel, lastFill,  // fuel
//                     relatedUsage, createdAt, updatedAt }
//   kind: 'product' | 'chemical' | 'fertilizer' | 'part' | 'fuel'
//
// inventory_usage — { id, productName, quantityUsed, unit, sourceId,
//                     date, area, applicator, createdAt }
//
// Legacy empty arrays are preserved as defensive backstops for any
// unforeseen import. They are no longer the source of truth for any
// consumer in the app. PURCHASE_HISTORY remains static until a future
// phase migrates the Purchase History surface.
export const PRODUCTS         = []
export const CHEMICALS        = []
export const FERTILIZERS      = []
export const PARTS            = []
export const FUEL             = []
export const PURCHASE_HISTORY = []
