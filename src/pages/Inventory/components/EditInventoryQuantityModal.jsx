// Phase I.1 — Edit Inventory Quantity modal.
//
// Minimal modal that lets a superintendent correct the on-hand
// quantity (and optionally the stocking unit + reorder level) for an
// existing inventory item. The worker (updateInventory in
// worker/api/inventory.js) already supported PATCH on these fields
// via MUTABLE_COLUMNS — the UI just never wired an edit affordance,
// so users had to delete and re-add items to fix a count.
//
// Scope: quantity / unit / reorder level only. Catalog link,
// cost basis, vendor, location, and other rich fields live in their
// own existing affordances (CatalogLinkPicker, CostBasisEditor,
// ManualProductForm). This modal is intentionally tiny so the
// hotfix can land without bundling extra UI.
//
// Permission gate: the caller decides whether to render the modal
// (the consuming tabs do `canEditInventory` checks). The worker also
// enforces the same permission via MUTATION_RULES (/api/inventory →
// canEditInventory). Two-layer guard, same pattern as the spray
// workflow.

import { useState } from 'react'
import { patchInventory, refreshInventoryData } from '../../../utils/inventory/inventoryStore'
import { useToast } from '../../../utils/feedback/toastContext'
import styles from './EditInventoryQuantityModal.module.css'

export default function EditInventoryQuantityModal({ item, onClose, onSaved }) {
  const toast = useToast()
  const [quantity, setQuantity]         = useState(() => item?.quantity ?? 0)
  const [unit, setUnit]                 = useState(() => item?.unit ?? '')
  const [reorderLevel, setReorderLevel] = useState(() => item?.reorderLevel ?? '')
  const [busy, setBusy] = useState(false)

  if (!item) return null

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !busy) onClose?.()
  }

  async function handleSave() {
    if (quantity === '' || quantity == null || Number.isNaN(Number(quantity))) {
      toast.info?.('Quantity on hand must be a number.')
      return
    }
    if (Number(quantity) < 0) {
      toast.info?.('Quantity on hand cannot be negative.')
      return
    }
    if (reorderLevel !== '' && reorderLevel != null && Number.isNaN(Number(reorderLevel))) {
      toast.info?.('Reorder level must be a number when set.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        quantity: Number(quantity),
        unit:     unit || null,
      }
      if (reorderLevel !== '' && reorderLevel != null) {
        payload.reorderLevel = Number(reorderLevel)
      }
      const saved = await patchInventory(item.id, payload)
      // Belt-and-suspenders refresh so the spray product picker (which
      // reads useInventoryData) sees the new quantity on its next
      // subscription tick even if the optimistic merge happened to
      // race a parallel re-fetch.
      refreshInventoryData().catch(() => { /* non-fatal */ })
      toast.success?.(`Updated inventory for ${item.name}.`)
      onSaved?.(saved)
    } catch (err) {
      toast.error?.(`Update failed: ${err.message ?? err}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Edit inventory quantity"
      onClick={handleBackdrop}
    >
      <div className={styles.modal} data-modal="edit-inventory-quantity">
        <header className={styles.header}>
          <h2 className={styles.title}>Edit inventory</h2>
          <p className={styles.subtitle}>{item.name}</p>
        </header>

        <div className={styles.body}>
          <label className={styles.field}>
            <span className={styles.label}>Quantity on hand</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              aria-label="Quantity on hand"
              autoFocus
              disabled={busy}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Unit</span>
            <input
              type="text"
              value={unit}
              onChange={e => setUnit(e.target.value)}
              placeholder="oz, gal, lb…"
              aria-label="Stocking unit"
              disabled={busy}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Reorder level</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={reorderLevel}
              onChange={e => setReorderLevel(e.target.value)}
              aria-label="Reorder level"
              disabled={busy}
            />
          </label>

          <p className={styles.hint}>
            Direct edits adjust the on-hand count without writing an inventory
            usage row. Use this to correct mistaken counts or record receiving;
            sprays still deduct via the existing usage ledger.
          </p>
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
