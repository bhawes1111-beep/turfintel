// Inventory Chemical Import Wizard — client store (Phase 19).
//
// Three concerns:
//   1. uploadLabelPdf  — PDF-only validated upload to R2, reusing the
//      existing /api/attachments multipart system (parentType
//      'inventory_label', keyed to the wizard's pre-generated item id).
//   2. extractLabel    — POSTs the uploaded attachment id to the worker's
//      extraction endpoint. No AI is wired yet, so this returns
//      { configured: false, draft } and the wizard falls back to manual
//      entry. The contract stays stable for a future AI phase.
//   3. saveImportedLabel — creates the inventory item + label row; on
//      success refreshes the shared inventory store so the new chemical
//      appears immediately (and the Spray Builder can look it up).
//
// useImportedLabels() follows the vertical-store pattern (module cache +
// useSyncExternalStore + course-scoped refetch) so the Chemicals tab can
// show a "Label PDF" link without prop-drilling.

import { useSyncExternalStore } from 'react'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'
import { uploadAttachment, deleteAttachment } from '../attachments/attachmentsStore'
import { refreshInventoryData } from './inventoryStore'
import { mutationHeaders } from '../auth/mutationAuth'

const API = '/api/inventory/import-label'

// Mirrors the worker's MAX_FILE_BYTES in attachments.js.
export const MAX_PDF_BYTES = 8 * 1024 * 1024

async function fetchJSON(url, init) {
  // Phase 3C: session-cookie auth — credentials sends the httpOnly ti_session
  // cookie; no x-admin-key from the browser. The Worker gate enforces role.
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  const text = await res.text().catch(() => '')
  let body = null
  if (text) {
    try { body = JSON.parse(text) } catch { body = null }
  }
  if (!res.ok) {
    // 409 duplicate carries a structured body the wizard needs — surface it.
    const err = new Error(body?.error || body?.message || `${init?.method ?? 'GET'} ${url} → ${res.status}`)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

// ── Upload ─────────────────────────────────────────────────────────────────

/**
 * Validates a PDF (type + size) and uploads it to R2 via the existing
 * attachment system. `draftItemId` is the wizard's pre-generated inventory
 * item id — used as the attachment parentId so the PDF is keyed to the
 * item it will eventually be saved against.
 * Returns the attachment object ({ id, url, ... }).
 */
export async function uploadLabelPdf({ file, draftItemId }) {
  if (!file) throw new Error('A PDF file is required')
  if (file.type !== 'application/pdf') {
    throw new Error('Only PDF files are accepted')
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(`File exceeds the ${MAX_PDF_BYTES / 1024 / 1024} MB limit`)
  }
  if (!draftItemId) throw new Error('draftItemId is required')

  return uploadAttachment({
    parentType: 'inventory_label',
    parentId:   draftItemId,
    file,
  })
}

/** Remove an orphan PDF (e.g. wizard cancelled after upload, before save). */
export async function discardLabelPdf(attachmentId) {
  if (!attachmentId) return
  try {
    await deleteAttachment(attachmentId)
  } catch {
    // Best-effort cleanup — a leftover R2 object is not worth surfacing.
  }
}

// ── Extract ────────────────────────────────────────────────────────────────

/**
 * Asks the worker to extract label fields from the uploaded PDF.
 * Returns { configured, message, draft }. When `configured` is false the
 * wizard shows the "not configured" state and uses `draft` as the empty
 * form skeleton.
 */
export async function extractLabel(attachmentId) {
  return fetchJSON(`${API}/extract`, {
    method:  'POST',
    headers: mutationHeaders(),
    body:    JSON.stringify({ attachmentId: attachmentId ?? null }),
  })
}

// ── Save ───────────────────────────────────────────────────────────────────

/**
 * Saves the reviewed draft. `dedupeMode` is 'check' | 'create' | 'update'.
 * On a duplicate name with mode 'check', the worker responds 409 — this
 * helper throws an error whose `.body` carries { duplicate, existing }.
 * On success, refreshes the shared inventory store.
 */
export async function saveImportedLabel({ item, label, pdfAttachmentId, dedupeMode = 'check' }) {
  const saved = await fetchJSON(`${API}/save`, {
    method:  'POST',
    headers: mutationHeaders(),
    body:    JSON.stringify({
      courseId: getSelectedCourseId(),
      dedupeMode,
      pdfAttachmentId: pdfAttachmentId ?? null,
      item,
      label,
    }),
  })
  // New/updated chemical needs to show up in the Chemicals tab + be
  // available to the Spray Builder lookup.
  await refreshInventoryData()
  refreshLabels()
  return saved
}

// ── Imported-labels list (vertical store) ──────────────────────────────────

let state = {
  labels:  [],
  loading: true,
  error:   null,
}

const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) {
  state = { ...state, ...patch }
  notify()
}

export async function refreshLabels() {
  setState({ loading: true, error: null })
  try {
    const labels = await fetchJSON(withCourseScope(`${API}/labels`))
    setState({ labels: labels ?? [], loading: false, error: null })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

subscribeCourseChange(() => { if (hasBooted) refreshLabels() })

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshLabels()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useImportedLabels — read-only subscription to the saved product labels.
 * Returns { labels, loading, error }.
 */
export function useImportedLabels() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
