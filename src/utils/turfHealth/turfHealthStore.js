// Phase 7B.1 — Turf Health Observation store.
//
// Direct port of moistureStore (Phase 7A.1–7A.6). Same shapes, same
// optimistic-insert + clientId-dedup + retry-pending + batched-attachment-
// cache patterns. Everything proven by the moisture vertical, replayed
// here for Turf Health. Where this file differs from moistureStore.js,
// the difference is annotated inline.
//
// Public exports:
//   - useTurfHealthData()        : { observations, loading, error, lastFetch, ... }
//   - useTurfHealthAttachments() : { byParent, loading, error }
//   - refreshTurfHealth()
//   - refreshTurfHealthAttachments()
//   - submitTurfHealthObservation(payload)         (sync; returns optimistic row)
//   - retryPendingObservation(clientId)
//   - dismissPendingObservation(clientId)
//   - stagePendingPhoto(clientId, file)
//   - retryPendingPhoto(clientId)
//   - addPhotoToObservation(observationId, file)   (post-save direct attach)
//   - deleteTurfHealthObservation(id)
//   - deleteTurfHealthAttachment(attachmentId, observationId)

import { useSyncExternalStore } from 'react'
import { mutationHeaders } from '../auth/mutationAuth'
import {
  withCourseScope,
  subscribeCourseChange,
  getSelectedCourseId,
} from '../courses/courseStore'
import { uploadAttachment, deleteAttachment } from '../attachments/attachmentsStore'
import { bridgeToast } from '../feedback/toastBridge'

const API = '/api/turf-health'

let state = {
  observations:        [],
  loading:             true,
  error:               null,
  lastFetch:           null,
  attachmentsByParent: new Map(),
  attachmentsLoading:  true,
  attachmentsError:    null,
}

// Module-scope staging map for photos picked before the observation's
// server id has arrived (Phase 7A.4 pattern). File objects don't belong
// in React state — they're not serializable and have no value equality.
const pendingPhotos = new Map()  // clientId → File

const subscribers = new Set()
let hasBooted = false

function notify() { subscribers.forEach(cb => cb()) }
function setState(patch) { state = { ...state, ...patch }; notify() }

async function fetchJSON(url, init) {
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

// ── List refresh ────────────────────────────────────────────────────────────

export async function refreshTurfHealth(opts = {}) {
  setState({ loading: true, error: null })
  try {
    let url = withCourseScope(API)
    if (opts.days)  url += `&days=${encodeURIComponent(opts.days)}`
    if (opts.limit) url += `&limit=${encodeURIComponent(opts.limit)}`
    if (opts.status) url += `&status=${encodeURIComponent(opts.status)}`
    const observations = await fetchJSON(url)
    setState({ observations, loading: false, error: null, lastFetch: Date.now() })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

// Phase 7A.5 — batched attachment cache. ONE GET returns every active
// turf_health_observation photo for the course; group by parent_id so
// per-row chip lookups are O(1) and the page never fans out.
export async function refreshTurfHealthAttachments() {
  setState({ attachmentsLoading: true, attachmentsError: null })
  try {
    const url = withCourseScope('/api/attachments') + '&parentType=turf_health_observation'
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
  refreshTurfHealth()
  refreshTurfHealthAttachments()
})

// ── Optimistic submit (Phase 7A.1 pattern) ─────────────────────────────────

function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'thxxxxxxxxx4xxxyxxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Sync submit. Inserts the optimistic row immediately so the capture sheet
 * can close in zero network time; the network call resolves the pending
 * row in-place via sendToServer.
 *
 * @param {Object} payload  - turf health observation fields (location +
 *                            healthType required by the Worker).
 * @returns {Object}        the optimistic row stamped with clientId.
 */
export function submitTurfHealthObservation(payload = {}) {
  const clientId         = payload.clientId         ?? uuid()
  const clientObservedAt = payload.clientObservedAt ?? new Date().toISOString()
  const courseId         = getSelectedCourseId()

  const optimistic = {
    id:               `pending-${clientId}`,
    courseId,
    observedAt:       payload.observedAt ?? clientObservedAt,
    observedBy:       payload.observedBy ?? null,
    location:         payload.location ?? '',
    hole:             payload.hole ?? null,
    areaType:         payload.areaType ?? null,
    healthType:       payload.healthType ?? null,
    severity:         payload.severity ?? null,
    surfaceNote:      payload.surfaceNote ?? null,
    notes:            payload.notes ?? null,
    tags:             Array.isArray(payload.tags) ? payload.tags : [],
    status:           payload.status ?? 'active',
    followUpDate:     payload.followUpDate ?? null,
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
    // Preserve _photoPending / _photoError if the user staged a photo while
    // the observation POST was in flight — same merge pattern as moisture.
    const prior  = state.observations.find(o => o.clientId === payload.clientId)
    const merged = prior?._photoPending || prior?._photoError
      ? { ...saved, _photoPending: prior._photoPending, _photoError: prior._photoError }
      : saved
    setState({
      observations: state.observations.map(o =>
        o.clientId === payload.clientId ? merged : o,
      ),
    })
    if (pendingPhotos.has(payload.clientId)) {
      void uploadStagedPhoto(payload.clientId, saved.id)
    }
  } catch (err) {
    setState({
      observations: state.observations.map(o =>
        o.clientId === payload.clientId
          ? { ...o, _pending: true, _error: err.message }
          : o,
      ),
    })
  }
}

/** Retry a previously-failed observation submit (Phase 7A.2). */
export function retryPendingObservation(clientId) {
  const row = state.observations.find(o => o.clientId === clientId)
  if (!row) return
  setState({
    observations: state.observations.map(o =>
      o.clientId === clientId ? { ...o, _error: null } : o,
    ),
  })
  void sendToServer({
    location:         row.location,
    hole:             row.hole,
    areaType:         row.areaType,
    healthType:       row.healthType,
    severity:         row.severity,
    surfaceNote:      row.surfaceNote,
    notes:            row.notes,
    tags:             row.tags,
    status:           row.status,
    followUpDate:     row.followUpDate,
    lat:              row.lat,
    lng:              row.lng,
    gpsAccuracy:      row.gpsAccuracy,
    clientId:         row.clientId,
    clientObservedAt: row.clientObservedAt,
    courseId:         row.courseId,
  })
}

/** Discard a pending row the user explicitly wants to drop. */
export function dismissPendingObservation(clientId) {
  pendingPhotos.delete(clientId)
  setState({
    observations: state.observations.filter(o => o.clientId !== clientId || !o._pending),
  })
}

// ── Phase 7A.4: photo staging + upload ──────────────────────────────────

/** Stage a photo File picked while the observation POST is still in flight. */
export function stagePendingPhoto(clientId, file) {
  if (!clientId || !file) return
  pendingPhotos.set(clientId, file)
  setState({
    observations: state.observations.map(o =>
      o.clientId === clientId
        ? { ...o, _photoPending: true, _photoError: null }
        : o,
    ),
  })
  const row = state.observations.find(o => o.clientId === clientId)
  const hasRealId = row && row.id && !row.id.startsWith('pending-')
  if (hasRealId) void uploadStagedPhoto(clientId, row.id)
}

async function uploadStagedPhoto(clientId, observationId) {
  const file = pendingPhotos.get(clientId)
  if (!file) return
  try {
    const saved = await uploadAttachment({
      parentType: 'turf_health_observation',
      parentId:   observationId,
      file,
    })
    pendingPhotos.delete(clientId)
    // Hand-merge into cache (Phase 7A.5).
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
    bridgeToast().success?.('Photo attached', 2000)
  } catch (err) {
    setState({
      observations: state.observations.map(o =>
        o.clientId === clientId
          ? { ...o, _photoPending: false, _photoError: err.message || 'Photo upload failed' }
          : o,
      ),
    })
  }
}

/** Retry a failed staged photo (observation already saved). */
export function retryPendingPhoto(clientId) {
  const row = state.observations.find(o => o.clientId === clientId)
  if (!row) return
  const hasRealId = row.id && !row.id.startsWith('pending-')
  if (!hasRealId) return
  if (!pendingPhotos.has(clientId)) return
  setState({
    observations: state.observations.map(o =>
      o.clientId === clientId
        ? { ...o, _photoError: null, _photoPending: true }
        : o,
    ),
  })
  void uploadStagedPhoto(clientId, row.id)
}

// ── Phase 7A.6: post-save direct attach ────────────────────────────────

/**
 * Upload a photo to an existing row (real server id required). Skips
 * the staging path — used by the row "+ 📷" chip and the viewer's
 * "+ Add another" button.
 */
export async function addPhotoToObservation(observationId, file) {
  if (!observationId || observationId.startsWith('pending-')) {
    throw new Error('Photo can only be added once the observation has been saved.')
  }
  if (!file) throw new Error('No file provided.')
  const saved = await uploadAttachment({
    parentType: 'turf_health_observation',
    parentId:   observationId,
    file,
  })
  const nextMap = new Map(state.attachmentsByParent)
  const list    = nextMap.get(observationId) ?? []
  nextMap.set(observationId, [saved, ...list])
  setState({ attachmentsByParent: nextMap })
  bridgeToast().success?.('Photo attached', 2000)
  return saved
}

// ── Delete (observation + attachment) ─────────────────────────────────

export async function deleteTurfHealthObservation(id) {
  const prev = state.observations
  setState({ observations: prev.filter(o => o.id !== id) })
  try {
    await fetchJSON(`${API}/${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: mutationHeaders(),
    })
  } catch (err) {
    setState({ error: err.message })
    refreshTurfHealth()
    throw err
  }
}

export async function deleteTurfHealthAttachment(attachmentId, observationId) {
  await deleteAttachment(attachmentId)
  const nextMap = new Map(state.attachmentsByParent)
  const list    = nextMap.get(observationId) ?? []
  const filtered = list.filter(a => a.id !== attachmentId)
  if (filtered.length > 0) nextMap.set(observationId, filtered)
  else                     nextMap.delete(observationId)
  setState({ attachmentsByParent: nextMap })
}

// ── React hooks ────────────────────────────────────────────────────────────

function subscribe(cb) {
  subscribers.add(cb)
  if (!hasBooted) {
    hasBooted = true
    refreshTurfHealth({ days: 180 })
    refreshTurfHealthAttachments()
  }
  return () => subscribers.delete(cb)
}
function getSnapshot() { return state }

/** useTurfHealthData — { observations, loading, error, lastFetch }. */
export function useTurfHealthData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** useTurfHealthAttachments — { byParent, loading, error }. */
export function useTurfHealthAttachments() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    byParent: s.attachmentsByParent,
    loading:  s.attachmentsLoading,
    error:    s.attachmentsError,
  }
}
