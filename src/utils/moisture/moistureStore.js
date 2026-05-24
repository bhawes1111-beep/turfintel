// Moisture + Handwatering Intelligence — data store.
//
// Course-scoped CRUD over /api/moisture, mirroring the feedback/notes store
// pattern: module-level cache, useSyncExternalStore, optimistic create with
// refetch-on-failure. No local-only analytics — observations persist in D1.

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'
import { uploadAttachment, deleteAttachment } from '../attachments/attachmentsStore'
import { bridgeToast } from '../feedback/toastBridge'

const API = '/api/moisture'

let state = {
  observations: [],   // newest first
  loading:      true,
  error:        null,
  lastFetch:    null,
  // Phase 7A.5 — batched attachment cache. ONE GET /api/attachments
  // ?parentType=moisture_observation returns every active moisture photo
  // for the course; we group them by parent_id once so per-row lookup is
  // O(1) and the page never fans out to N parallel requests.
  attachmentsByParent: new Map(),  // observationId → Attachment[]
  attachmentsLoading:  true,
  attachmentsError:    null,
}

// Phase 7A.4 — module-scope (NOT React state) staging map for photos picked
// before the observation's server id has arrived. Keyed by clientId. File
// objects don't belong in a state tree snapshot (no value-equality, not
// serializable). Entries are removed on successful upload, on dismiss, or
// on explicit retry success. Survives across re-renders; clears on reload.
const pendingPhotos = new Map()   // clientId → File

const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) { state = { ...state, ...patch }; notify() }

async function fetchJSON(url, init) {
  // Phase 3C: session-cookie auth — credentials sends the httpOnly ti_session
  // cookie; no x-admin-key from the browser. The Worker gate enforces role.
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshMoisture(opts = {}) {
  setState({ loading: true, error: null })
  try {
    let url = withCourseScope(API)
    if (opts.days)  url += `&days=${encodeURIComponent(opts.days)}`
    if (opts.limit) url += `&limit=${encodeURIComponent(opts.limit)}`
    const observations = await fetchJSON(url)
    setState({ observations, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

// Phase 7A.5 — single GET that returns every active moisture-observation
// attachment for the course. We group by parent_id so per-row chip lookups
// are O(1) and the page never fans out to N parallel /api/attachments calls.
// Worker endpoint already supports the parentType-only query — no backend
// change needed; see worker/api/attachments.js listAttachments.
export async function refreshMoistureAttachments() {
  setState({ attachmentsLoading: true, attachmentsError: null })
  try {
    const url = withCourseScope('/api/attachments') + '&parentType=moisture_observation'
    const list = await fetchJSON(url)
    const byParent = new Map()
    for (const att of list) {
      const arr = byParent.get(att.parentId) ?? []
      arr.push(att)
      byParent.set(att.parentId, arr)
    }
    setState({ attachmentsByParent: byParent, attachmentsLoading: false, attachmentsError: null })
  } catch (err) {
    setState({ attachmentsLoading: false, attachmentsError: err.message })
  }
}

subscribeCourseChange(() => {
  if (!hasBooted) return
  refreshMoisture()
  refreshMoistureAttachments()
})

// ── Mutations ───────────────────────────────────────────────────────────────

export async function createMoistureObservation(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify({ courseId: getSelectedCourseId(), ...payload }),
    })
    setState({ observations: [saved, ...state.observations] })
    return saved
  } catch (err) {
    setState({ error: err.message })
    throw err
  }
}

// ── Phase 7A.1: capture-flow wrapper ────────────────────────────────────────
//
// Splits the user action ("tap Save") from the network round-trip. Inserts an
// optimistic pending row IMMEDIATELY so the mobile modal can close in zero
// network time; the network call resolves the pending row in-place, OR
// stamps it with `_error` and `_pending` so the UI can show a retry badge.
//
// Architectural note (Phase 7A rule): this is the only path the new mobile
// FAB uses. The legacy createMoistureObservation() is preserved for the
// existing MoistureOverview flow and any other caller, so no regressions.
// A future IndexedDB-backed offline queue can replace the body of submit()
// without changing this contract.

function uuid() {
  // RFC4122 v4-ish — crypto.randomUUID() exists in modern browsers + Node 19+,
  // fall back to Math.random for older runtimes (smoke tests run on Node 20).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'mxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * submitMoistureObservation — capture-flow entry point.
 *
 * Returns synchronously with the optimistic row (carries _pending: true).
 * The eventual network resolution updates the same row in the store; on
 * failure, the row stays in the list with _pending: true and _error set,
 * ready for a retry handler to call retryPendingObservation(clientId).
 *
 * @param {Object} payload  - moisture observation fields (location required).
 * @returns {Object}        - the optimistic row stamped with clientId.
 */
export function submitMoistureObservation(payload = {}) {
  const clientId         = payload.clientId         ?? uuid()
  const clientObservedAt = payload.clientObservedAt ?? new Date().toISOString()
  const courseId         = getSelectedCourseId()

  const optimistic = {
    // Synthetic id for React keys; replaced by server id on success.
    id:               `pending-${clientId}`,
    courseId,
    observedAt:       payload.observedAt ?? clientObservedAt,
    observedBy:       payload.observedBy ?? null,
    location:         payload.location ?? '',
    hole:             payload.hole ?? null,
    moisturePct:      payload.moisturePct ?? null,
    surfaceNote:      payload.surfaceNote ?? null,
    wiltStress:       !!payload.wiltStress,
    drySpot:          !!payload.drySpot,
    handwaterRec:     !!payload.handwaterRec,
    syringeRec:       !!payload.syringeRec,
    notes:            payload.notes ?? null,
    clientId,
    clientObservedAt,
    lat:              payload.lat ?? null,
    lng:              payload.lng ?? null,
    gpsAccuracy:      payload.gpsAccuracy ?? null,
    createdAt:        clientObservedAt,
    _pending:         true,
    _error:           null,
  }

  setState({ observations: [optimistic, ...state.observations] })

  // Fire-and-forget network call; reconciles by clientId so retries are safe.
  void sendToServer({
    ...payload,
    clientId,
    clientObservedAt,
    courseId,
  })

  return optimistic
}

async function sendToServer(payload) {
  try {
    const saved = await fetchJSON(API, {
      method:  'POST',
      headers: mutationHeaders(),
      body:    JSON.stringify(payload),
    })
    // Replace the matching pending row with the canonical server row.
    // Preserve any photo-pending flags so the row UI can still show the
    // photo-retry pill if a queued photo is mid-upload or already failed.
    const prior = state.observations.find(o => o.clientId === payload.clientId)
    const merged = prior?._photoPending || prior?._photoError
      ? { ...saved, _photoPending: prior._photoPending, _photoError: prior._photoError }
      : saved
    setState({
      observations: state.observations.map(o =>
        o.clientId === payload.clientId ? merged : o,
      ),
    })
    // Phase 7A.4 — drain any photo the user staged before the server id
    // arrived. Fire-and-forget; the photo upload reports its own state.
    if (pendingPhotos.has(payload.clientId)) {
      void uploadStagedPhoto(payload.clientId, saved.id)
    }
  } catch (err) {
    // Keep the row in the list with retry badge. The user keeps their work.
    setState({
      observations: state.observations.map(o =>
        o.clientId === payload.clientId
          ? { ...o, _pending: true, _error: err.message }
          : o,
      ),
    })
  }
}

// ── Phase 7A.4: photo staging + upload ─────────────────────────────────────
//
// The capture sheet closes synchronously on Save; the observation POST fires
// in the background. The user may tap "+ Add photo" from the success toast
// BEFORE the observation server id has arrived. stagePendingPhoto() holds the
// File in the per-clientId map so the upload can fire once the real id is
// known. If the observation POST has already resolved when the user picks
// the photo, the upload fires immediately.

/**
 * Stage a photo File for a recent observation. Marks the row with
 * _photoPending so the UI can show a "Uploading photo…" affordance. The
 * actual network call happens here if the observation already has a real
 * id, otherwise it fires in sendToServer when the id arrives.
 *
 * @param {string} clientId  - the observation's clientId (must already exist in observations[])
 * @param {File}   file      - the image file from <input type="file">
 */
export function stagePendingPhoto(clientId, file) {
  if (!clientId || !file) return
  pendingPhotos.set(clientId, file)
  // Stamp _photoPending on the row so the UI can reflect it.
  setState({
    observations: state.observations.map(o =>
      o.clientId === clientId
        ? { ...o, _photoPending: true, _photoError: null }
        : o,
    ),
  })
  // If the row already has a real server id (observation POST already
  // resolved), fire the upload right now. Otherwise sendToServer drains us.
  const row = state.observations.find(o => o.clientId === clientId)
  const hasRealId = row && row.id && !row.id.startsWith('pending-')
  if (hasRealId) void uploadStagedPhoto(clientId, row.id)
}

async function uploadStagedPhoto(clientId, observationId) {
  const file = pendingPhotos.get(clientId)
  if (!file) return
  try {
    const saved = await uploadAttachment({
      parentType: 'moisture_observation',
      parentId:   observationId,
      file,
    })
    pendingPhotos.delete(clientId)
    // Phase 7A.5 — hand-merge the new attachment into the byParent cache
    // so the photo chip appears immediately, without an extra round-trip.
    // The list endpoint orders newest-first; we prepend to match.
    const nextMap = new Map(state.attachmentsByParent)
    const list    = nextMap.get(observationId) ?? []
    nextMap.set(observationId, [saved, ...list])
    setState({
      observations: state.observations.map(o =>
        o.clientId === clientId
          ? { ...o, _photoPending: false, _photoError: null }
          : o,
      ),
      attachmentsByParent: nextMap,
    })
    // Phase 7A.4 — explicit success ack via the toast bridge so the user
    // knows the photo landed even though the upload was async and the
    // capture sheet has long since closed. 2s — short, non-intrusive.
    bridgeToast().success?.('Photo attached', 2000)
  } catch (err) {
    // Keep the File around — retry will reuse it. Stamp the row so the UI
    // can surface a Retry photo affordance distinct from observation retry.
    setState({
      observations: state.observations.map(o =>
        o.clientId === clientId
          ? { ...o, _photoPending: false, _photoError: err.message || 'Photo upload failed' }
          : o,
      ),
    })
  }
}

/**
 * Retry a failed photo upload for a row whose observation succeeded but
 * whose photo upload did not. Distinct from retryPendingObservation: the
 * observation is fine; only the attached image needs another try.
 */
export function retryPendingPhoto(clientId) {
  const row = state.observations.find(o => o.clientId === clientId)
  if (!row) return
  const hasRealId = row.id && !row.id.startsWith('pending-')
  if (!hasRealId) return    // observation hasn't been saved yet; nothing to attach to
  if (!pendingPhotos.has(clientId)) return  // file already consumed or lost
  // Clear _photoError before retry so the UI reflects in-flight state.
  setState({
    observations: state.observations.map(o =>
      o.clientId === clientId
        ? { ...o, _photoError: null, _photoPending: true }
        : o,
    ),
  })
  void uploadStagedPhoto(clientId, row.id)
}

/**
 * Retry a previously-failed capture. Looks up the pending row by clientId
 * and re-fires the network call with the same payload.
 */
export function retryPendingObservation(clientId) {
  const row = state.observations.find(o => o.clientId === clientId)
  if (!row) return
  // Clear _error before retry so the UI reflects in-flight state.
  setState({
    observations: state.observations.map(o =>
      o.clientId === clientId ? { ...o, _error: null } : o,
    ),
  })
  void sendToServer({
    location:         row.location,
    hole:             row.hole,
    moisturePct:      row.moisturePct,
    surfaceNote:      row.surfaceNote,
    wiltStress:       row.wiltStress,
    drySpot:          row.drySpot,
    handwaterRec:     row.handwaterRec,
    syringeRec:       row.syringeRec,
    notes:            row.notes,
    lat:              row.lat,
    lng:              row.lng,
    gpsAccuracy:      row.gpsAccuracy,
    clientId:         row.clientId,
    clientObservedAt: row.clientObservedAt,
    courseId:         row.courseId,
  })
}

/**
 * Drop a pending row the user explicitly wants to discard. Also clears any
 * staged photo so File memory is released and a stale retry can't fire
 * against a row that no longer exists.
 */
export function dismissPendingObservation(clientId) {
  pendingPhotos.delete(clientId)
  setState({
    observations: state.observations.filter(o => o.clientId !== clientId || !o._pending),
  })
}

export async function patchMoistureObservation(id, updates) {
  const prev = state.observations
  setState({ observations: prev.map(o => o.id === id ? { ...o, ...updates } : o) })
  try {
    const saved = await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: mutationHeaders(),
      body:    JSON.stringify(updates),
    })
    setState({ observations: state.observations.map(o => o.id === id ? saved : o) })
    return saved
  } catch (err) {
    setState({ error: err.message })
    refreshMoisture()
    throw err
  }
}

export async function deleteMoistureObservation(id) {
  const prev = state.observations
  setState({ observations: prev.filter(o => o.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshMoisture()
    throw err
  }
}

// ── Phase 7A.5: attachment delete helper ──────────────────────────────────

/**
 * Delete a moisture-observation photo. Calls the existing R2-backed
 * deleteAttachment (soft-deletes the metadata row + hard-deletes the R2
 * object), then prunes the byParent cache by id so the chip updates
 * without an extra round-trip.
 *
 * @param {string} attachmentId
 * @param {string} observationId  - the parentId; needed to prune the right Map entry
 */
export async function deleteMoistureAttachment(attachmentId, observationId) {
  await deleteAttachment(attachmentId)
  const nextMap = new Map(state.attachmentsByParent)
  const list    = nextMap.get(observationId) ?? []
  const filtered = list.filter(a => a.id !== attachmentId)
  if (filtered.length > 0) nextMap.set(observationId, filtered)
  else                     nextMap.delete(observationId)
  setState({ attachmentsByParent: nextMap })
}

// ── Phase 7A.6: post-capture photo attach ─────────────────────────────────
//
// Phase 7A.4 staged photos before the observation's server id arrived
// (clientId-keyed). This path is for rows that already exist on the server
// — the row's `id` is known, so we skip staging and upload directly.
// Hand-merges the saved attachment into the byParent cache so the chip
// appears immediately.
//
// Used by: the "+ 📷" empty-state chip on Moisture Overview rows, and the
// "+ Add another" button in the viewer footer. Both call this with the
// row's REAL id (never a synthetic pending- id).

/**
 * Upload a photo and attach it to an existing moisture observation row.
 * Returns the saved attachment on success. Throws on failure so the
 * caller can show a row-local error toast (the store doesn't dictate UX).
 *
 * @param {string} observationId  - the row's real (post-server) id
 * @param {File}   file
 * @returns {Promise<Object>}  the saved attachment
 */
export async function addPhotoToObservation(observationId, file) {
  if (!observationId || observationId.startsWith('pending-')) {
    throw new Error('Photo can only be added once the observation has been saved.')
  }
  if (!file) throw new Error('No file provided.')
  const saved = await uploadAttachment({
    parentType: 'moisture_observation',
    parentId:   observationId,
    file,
  })
  // Hand-merge into the cache so the chip updates without a refetch.
  const nextMap = new Map(state.attachmentsByParent)
  const list    = nextMap.get(observationId) ?? []
  nextMap.set(observationId, [saved, ...list])
  setState({ attachmentsByParent: nextMap })
  // Same toast as the 7A.4 staged-upload success path — consistent
  // confirmation regardless of how the photo got attached.
  bridgeToast().success?.('Photo attached', 2000)
  return saved
}

// ── React hook ────────────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshMoisture({ days: 14 })
    refreshMoistureAttachments()
  }
  return () => subscribers.delete(cb)
}

function getSnapshot() { return state }

/**
 * useMoistureData — { observations, loading, error, lastFetch }.
 * `observations` are newest-first.
 */
export function useMoistureData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Phase 7A.5 — batched moisture-attachment hook.
 * Returns { byParent, loading, error } where byParent is a Map from
 * observationId → Attachment[]. Use byParent.get(o.id) ?? [] in row
 * renders; lookup is O(1) and the underlying network cost is exactly ONE
 * GET per page mount + ONE per mutation, regardless of row count.
 *
 * Boot side-effect: shares the subscribe() above with useMoistureData, so
 * the first MoistureOverview render triggers both fetches in parallel.
 */
export function useMoistureAttachments() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    byParent: s.attachmentsByParent,
    loading:  s.attachmentsLoading,
    error:    s.attachmentsError,
  }
}
