// Phase S.7b.3 — Shared product/inventory picker for spray rows.
//
// Replaces the inline <select> that both BuildSpraySheet (Phase S.4
// onward) and SprayApplicationSheetModal (S.7b.2) had to roll
// independently. Single source of truth for:
//
//   • Which inventory kinds are spray-eligible (product / chemical /
//     fertilizer).
//   • Option label format ("Name (qty unit)" when stock is known).
//   • Selection → row shape mapping (inventoryItemId + name + type +
//     unit + productCatalogId).
//
// The picker is intentionally tiny — just a styled <select>. Domain-
// specific row chrome (stock chips, intel chips, unit-conversion
// warnings) lives in the consuming row component (BuildSpraySheet
// keeps its rich table; the sheet editor uses a plain row).

import { useMemo } from 'react'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'

// Inventory kinds that are spray-relevant. Matches BuildSpraySheet's
// productPickerOptions filter so both surfaces see the same list.
const SPRAY_ELIGIBLE_KINDS = new Set(['product', 'chemical', 'fertilizer'])

/**
 * Build the canonical picker options. Exported for callers that need
 * to render their own <select> (e.g. BuildSpraySheet's table cell).
 */
export function useSprayProductOptions() {
  const { items } = useInventoryData()
  return useMemo(() => {
    return (items ?? [])
      .filter(p => SPRAY_ELIGIBLE_KINDS.has(p.kind))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [items])
}

/**
 * Translate an inventory item into the product-row shape used by both
 * BuildSpraySheet drafts and SprayApplicationSheetModal chemical
 * edits. Returns null for falsy input.
 *
 * Callers should `{ ...existingRow, ...mapInventoryItemToProductRow(item) }`
 * so the picker doesn't clobber rate / quantity / snapshot fields
 * the user has already entered.
 */
export function mapInventoryItemToProductRow(item) {
  if (!item) return null
  return {
    inventoryItemId:  item.id,
    productCatalogId: item.productCatalogId ?? null,
    name:             item.name ?? '',
    type:             item.category ?? '',
    unit:             item.unit ?? 'oz',
  }
}

/**
 * The picker component itself.
 *
 * Props:
 *   value          — currently-selected inventory item id (string or null).
 *   onChange(item) — called with the full inventory row (or null if cleared).
 *   ariaLabel      — required for a11y; the parent knows what row this is.
 *   className      — optional select class for styling parity with sibling inputs.
 *   includeBlank   — defaults true; emits an empty "— Select product —" option.
 *   disabled       — disables the select.
 */
export default function SprayProductPicker({
  value,
  onChange,
  ariaLabel,
  className,
  includeBlank = true,
  disabled = false,
}) {
  const options = useSprayProductOptions()

  function handleChange(e) {
    const id = e.target.value
    if (!id) { onChange?.(null); return }
    const item = options.find(p => p.id === id) ?? null
    onChange?.(item)
  }

  return (
    <select
      className={className}
      value={value ?? ''}
      onChange={handleChange}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {includeBlank && <option value="">— Select product —</option>}
      {options.map(p => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.quantity != null ? ` (${p.quantity} ${p.unit ?? ''})` : ''}
        </option>
      ))}
    </select>
  )
}
