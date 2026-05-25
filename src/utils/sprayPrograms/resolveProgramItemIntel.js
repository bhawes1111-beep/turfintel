// Phase 7F (3/?) — Spray Program planner intelligence resolver.
//
// Thin adapter over resolveSprayProductIntel that accepts a PLANNED
// program item (from spray_program_items) rather than a Spray Builder
// row. Both shapes converge on the same { name, inventoryItemId } pair
// that the catalog-first resolver consumes, so the adapter is just a
// field renamer.
//
// Stays PURE: no fetch, no React, no store imports, no mutation. The
// caller injects inventoryProducts / catalogProducts / labelsByItemId
// — the same closure pattern used by Spray Builder + Rotation/Interval
// Awareness modules.

import { resolveSprayProductIntel } from '../productCatalog/resolveSprayProductIntel.js'

/**
 * Resolve intelligence for a planned program item.
 *
 * @param {Object}   item                 spray_program_items row (camelCase)
 * @param {Object}   inputs
 * @param {Object[]} inputs.inventoryProducts  inventoryStore.items
 * @param {Object[]} inputs.catalogProducts    productCatalogStore.products
 * @param {Object}   inputs.labelsByItemId     { invItemId → label row }
 * @returns {Object} SprayIntel (same shape Spray Builder uses)
 */
export function resolveProgramItemIntel(item, inputs = {}) {
  if (!item) {
    return resolveSprayProductIntel(null, inputs)
  }

  // Planner items carry both an explicit catalog id AND name + inventory
  // id. The resolver's tier 1a (explicit catalog FK on the inventory
  // row) only consults inventoryProducts.productCatalogId — which is
  // STOCK linkage. The planner item's productCatalogId is INTENT
  // linkage on the plan itself. To preserve the catalog-first contract,
  // we synthesize a virtual inventory row when the item carries an
  // explicit productCatalogId and there's no resolvable inventory row,
  // so the resolver lands on the same catalog row by FK.
  const { inventoryProducts = [], catalogProducts = [], labelsByItemId = {} } = inputs

  // Tier 0a — explicit planner catalog FK wins.
  if (item.productCatalogId) {
    const inv = item.inventoryItemId
      ? inventoryProducts.find(p => p.id === item.inventoryItemId)
      : null
    if (inv && inv.productCatalogId === item.productCatalogId) {
      // Inventory already points to the same catalog — fall through to
      // the standard resolver path (tier 1a hits cleanly).
    } else {
      // Synthesize a non-mutating shadow inventory list so the standard
      // resolver finds the explicit FK without touching the real cache.
      const shadow = [
        ...inventoryProducts,
        {
          id:               item.inventoryItemId ?? `__planner-${item.id ?? 'x'}`,
          name:             item.productName ?? null,
          productCatalogId: item.productCatalogId,
          kind:             'chemical',
        },
      ]
      return resolveSprayProductIntel(
        { name: item.productName, inventoryItemId: shadow[shadow.length - 1].id },
        { inventoryProducts: shadow, catalogProducts, labelsByItemId },
      )
    }
  }

  // Standard path: name + inventoryItemId go straight through.
  return resolveSprayProductIntel(
    { name: item.productName, inventoryItemId: item.inventoryItemId },
    { inventoryProducts, catalogProducts, labelsByItemId },
  )
}

// Test-only seam.
export const __TEST = { /* future helpers; kept for symmetry with peers */ }
