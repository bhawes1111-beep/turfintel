import { useEffect, useMemo, useRef, useState } from 'react'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import {
  approvePurchaseInvoice,
  deletePurchaseInvoice,
  listPurchaseInvoices,
  uploadPurchaseInvoice,
} from '../../../utils/inventory/purchaseInvoicesStore'
import styles from '../Inventory.module.css'

const KIND_OPTIONS = [
  ['chemical', 'Chemical'],
  ['fertilizer', 'Fertilizer'],
  ['part', 'Part'],
  ['irrigation', 'Irrigation'],
  ['product', 'Other product'],
  ['fuel', 'Fuel'],
]

function blankLine() {
  return {
    id: crypto.randomUUID(),
    description: '',
    sku: '',
    quantity: 1,
    unit: 'each',
    unitPrice: '',
    lineTotal: '',
    inventoryItemId: '',
    inventoryKind: 'part',
    includeInInventory: true,
  }
}

function formatMoney(value) {
  const number = Number(value)
  return Number.isFinite(number)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number)
    : '—'
}

function normalized(value) {
  return String(value ?? '').trim().toUpperCase()
}

function prepareDraft(invoice, items) {
  return {
    ...invoice,
    vendor: invoice.vendor || '',
    invoiceNumber: invoice.invoiceNumber || '',
    invoiceDate: invoice.invoiceDate || '',
    subtotal: invoice.subtotal ?? '',
    tax: invoice.tax ?? '',
    total: invoice.total ?? '',
    lines: (invoice.lines.length ? invoice.lines : [blankLine()]).map(line => {
      const exact = items.find(item => normalized(item.name) === normalized(line.description))
      return {
        ...blankLine(),
        ...line,
        inventoryItemId: line.inventoryItemId || exact?.id || '',
        inventoryKind: line.inventoryKind || exact?.kind || 'part',
      }
    }),
  }
}

export default function InventoryPurchaseHistory() {
  const { items } = useInventoryData()
  const inputRef = useRef(null)
  const [invoices, setInvoices] = useState([])
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleteArmed, setDeleteArmed] = useState(false)

  useEffect(() => {
    let active = true
    listPurchaseInvoices()
      .then(rows => {
        if (!active) return
        setInvoices(rows)
        setError('')
      })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const pending = useMemo(() => invoices.filter(row => row.status !== 'approved'), [invoices])
  const approved = useMemo(() => invoices.filter(row => row.status === 'approved'), [invoices])

  async function handleUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); setError('')
    try {
      const uploaded = await uploadPurchaseInvoice(file)
      setInvoices(current => [uploaded, ...current])
      setDraft(prepareDraft(uploaded, items))
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  function patchLine(index, patch) {
    setDraft(current => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line
        const next = { ...line, ...patch }
        if (Object.hasOwn(patch, 'quantity') || Object.hasOwn(patch, 'unitPrice')) {
          const quantity = Number(next.quantity)
          const price = Number(next.unitPrice)
          next.lineTotal = Number.isFinite(quantity) && Number.isFinite(price)
            ? (quantity * price).toFixed(2)
            : ''
        }
        if (Object.hasOwn(patch, 'inventoryItemId') && patch.inventoryItemId) {
          const item = items.find(row => row.id === patch.inventoryItemId)
          if (item) {
            next.description = item.name
            next.inventoryKind = item.kind
            next.unit = item.unit || next.unit
          }
        }
        return next
      }),
    }))
  }

  async function handleApprove() {
    setBusy(true); setError('')
    try {
      const saved = await approvePurchaseInvoice(draft.id, draft)
      setInvoices(current => current.map(row => row.id === saved.id ? saved : row))
      setDraft(null)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function handleDelete() {
    if (!deleteArmed) { setDeleteArmed(true); return }
    setBusy(true); setError('')
    try {
      await deletePurchaseInvoice(draft.id)
      setInvoices(current => current.filter(row => row.id !== draft.id))
      setDraft(null); setDeleteArmed(false)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Purchase Invoices"
        subtitle="Upload invoices, verify every item, then approve inventory changes."
      >
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={handleUpload} />
        <div className={styles.invoiceToolbar}>
          <button className={styles.invoicePrimaryBtn} type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Working…' : '+ Upload Invoice'}
          </button>
          <span>PDF up to 8 MB. Nothing is added to stock before approval.</span>
        </div>
        {error && <div className={styles.invoiceError}>{error}</div>}

        <section className={styles.invoiceSection}>
          <div className={styles.invoiceSectionHeading}>
            <div><h3>Needs Approval</h3><p>Review extracted products and quantities.</p></div>
            <strong>{pending.length}</strong>
          </div>
          {loading ? <p className={styles.invoiceEmpty}>Loading invoices…</p> : pending.length === 0 ? (
            <p className={styles.invoiceEmpty}>No invoices are waiting for approval.</p>
          ) : (
            <div className={styles.invoiceCardGrid}>
              {pending.map(invoice => (
                <article className={styles.invoiceCard} key={invoice.id}>
                  <div><b>{invoice.vendor || 'Vendor not detected'}</b><span>{invoice.invoiceNumber || 'Invoice number needed'}</span></div>
                  <div><span>{invoice.invoiceDate || 'Date needed'}</span><strong>{formatMoney(invoice.total)}</strong></div>
                  <div className={styles.invoiceCardFooter}>
                    <span>{invoice.lines.length} extracted line{invoice.lines.length === 1 ? '' : 's'}</span>
                    <button type="button" onClick={() => { setDraft(prepareDraft(invoice, items)); setDeleteArmed(false) }}>Review</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.invoiceSection}>
          <div className={styles.invoiceSectionHeading}>
            <div><h3>Approved Purchases</h3><p>Invoices already applied to inventory.</p></div>
            <strong>{approved.length}</strong>
          </div>
          {approved.length === 0 ? <p className={styles.invoiceEmpty}>No approved invoices yet.</p> : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Date</th><th>Vendor</th><th>Invoice</th><th>Items</th><th>Total</th><th>Original</th></tr></thead>
                <tbody>{approved.map(invoice => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoiceDate || '—'}</td><td>{invoice.vendor || '—'}</td><td>{invoice.invoiceNumber || '—'}</td>
                    <td>{invoice.lines.length}</td><td>{formatMoney(invoice.total)}</td>
                    <td>{invoice.pdfUrl ? <a href={invoice.pdfUrl} target="_blank" rel="noreferrer">View PDF</a> : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </WorkspaceSection>

      {draft && (
        <div className={styles.invoiceReviewShell} role="dialog" aria-modal="true" aria-label="Review purchase invoice">
          <div className={styles.invoiceReviewPanel}>
            <header className={styles.invoiceReviewHeader}>
              <div><h2>Review Purchase Invoice</h2><p>Confirm the invoice and choose where each item belongs.</p></div>
              <button type="button" aria-label="Close" onClick={() => setDraft(null)}>×</button>
            </header>
            <div className={styles.invoiceReviewBody}>
              <div className={styles.invoiceNotice}>{draft.extractionNote}</div>
              <div className={styles.invoiceMetaGrid}>
                <label>Vendor<input value={draft.vendor} onChange={e => setDraft({ ...draft, vendor: e.target.value })} /></label>
                <label>Invoice number<input value={draft.invoiceNumber} onChange={e => setDraft({ ...draft, invoiceNumber: e.target.value })} /></label>
                <label>Invoice date<input type="date" value={draft.invoiceDate} onChange={e => setDraft({ ...draft, invoiceDate: e.target.value })} /></label>
                <label>Invoice total<input type="number" min="0" step="0.01" value={draft.total} onChange={e => setDraft({ ...draft, total: e.target.value })} /></label>
              </div>
              {draft.pdfUrl && <a className={styles.invoicePdfLink} href={draft.pdfUrl} target="_blank" rel="noreferrer">Open original invoice PDF</a>}

              <div className={styles.invoiceLinesHeader}><h3>Inventory Items</h3><button type="button" onClick={() => setDraft(current => ({ ...current, lines: [...current.lines, blankLine()] }))}>+ Add item</button></div>
              <div className={styles.invoiceLineList}>
                {draft.lines.map((line, index) => (
                  <article className={styles.invoiceLine} key={line.id || index}>
                    <div className={styles.invoiceLineTop}>
                      <label className={styles.invoiceInclude}><input type="checkbox" checked={line.includeInInventory !== false} onChange={e => patchLine(index, { includeInInventory: e.target.checked })} /> Add to inventory</label>
                      <button type="button" onClick={() => setDraft(current => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>Remove</button>
                    </div>
                    <div className={styles.invoiceLineGrid}>
                      <label className={styles.invoiceWide}>Inventory match<select value={line.inventoryItemId || ''} onChange={e => patchLine(index, { inventoryItemId: e.target.value })}>
                        <option value="">Create a new inventory item</option>
                        {items.map(item => <option key={item.id} value={item.id}>{item.name} ({item.quantity ?? 0} {item.unit || ''})</option>)}
                      </select></label>
                      <label className={styles.invoiceWide}>Product description<input value={line.description} onChange={e => patchLine(index, { description: e.target.value })} /></label>
                      {!line.inventoryItemId && <label>Category<select value={line.inventoryKind} onChange={e => patchLine(index, { inventoryKind: e.target.value })}>{KIND_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
                      <label>Quantity to add<input type="number" min="0" step="any" value={line.quantity} onChange={e => patchLine(index, { quantity: e.target.value })} /></label>
                      <label>Inventory unit<input value={line.unit} onChange={e => patchLine(index, { unit: e.target.value })} /></label>
                      <label>Price per unit<input type="number" min="0" step="0.01" value={line.unitPrice ?? ''} onChange={e => patchLine(index, { unitPrice: e.target.value })} /></label>
                      <label>Line total<input type="number" min="0" step="0.01" value={line.lineTotal ?? ''} onChange={e => patchLine(index, { lineTotal: e.target.value })} /></label>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <footer className={styles.invoiceReviewFooter}>
              <button className={styles.invoiceDeleteBtn} type="button" disabled={busy} onClick={handleDelete}>{deleteArmed ? 'Confirm delete invoice' : 'Delete invoice'}</button>
              <div><button type="button" onClick={() => setDraft(null)}>Close</button><button className={styles.invoicePrimaryBtn} type="button" disabled={busy} onClick={handleApprove}>{busy ? 'Approving…' : 'Approve and Add to Inventory'}</button></div>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
