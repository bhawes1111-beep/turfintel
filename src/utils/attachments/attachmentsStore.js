// Operational attachments — client store (Phase 8).
//
// Unlike the other verticals, attachments are scoped per (parentType,
// parentId) — every Daily Briefing and every Operations Task has its
// own short list of photos. A single global cache doesn't fit; instead
// this module keeps a per-parent cache keyed by `${parentType}:${parentId}`.
//
// Hook contract:
//   useAttachmentsForParent('daily_briefing', noteId)
//     → { attachments, loading, error, refresh }
//
// Course scoping rides on every GET via withCourseScope. Uploads inject
// the selected course id so the metadata row + R2 key both carry it.

import { useEffect, useState, useCallback } from 'react'
import { withCourseScope, getSelectedCourseId } from '../courses/courseStore'
// Phase 3C: session-cookie auth. Uploads stay multipart — we send NO headers
// at all so the browser sets the multipart/form-data boundary itself, and
// `credentials: 'same-origin'` carries the httpOnly ti_session cookie. No
// x-admin-key from the browser.

const API = '/api/attachments'

async function fetchJSON(url, init) {
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${text}`)
  }
  return res.json()
}

/**
 * Stable URL for an attachment's binary content. Safe to use directly as
 * an <img src>; the Worker serves the bytes with a 1-hour public cache.
 */
export function attachmentFileUrl(id) {
  return `${API}/${encodeURIComponent(id)}/file`
}

/**
 * Upload a single image to R2 + insert the metadata row. Returns the
 * full attachment object (with id and url).
 */
export async function uploadAttachment({ parentType, parentId, file, caption, uploadedBy }) {
  if (!parentType || !parentId || !file) {
    throw new Error('uploadAttachment requires parentType, parentId, file')
  }
  const fd = new FormData()
  fd.append('courseId',   getSelectedCourseId())
  fd.append('parentType', parentType)
  fd.append('parentId',   parentId)
  fd.append('file',       file, file.name)
  if (caption)    fd.append('caption',    caption)
  if (uploadedBy) fd.append('uploadedBy', uploadedBy)

  const res = await fetch(API, {
    method:      'POST',
    credentials: 'same-origin',   // session cookie; NO Content-Type (browser sets the multipart boundary)
    body:        fd,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Upload failed (${res.status}): ${text || res.statusText}`)
  }
  return res.json()
}

/** Soft-delete metadata + hard-delete the R2 object. */
export async function deleteAttachment(id) {
  const url = `${API}/${encodeURIComponent(id)}`
  const res = await fetch(url, {
    method:      'DELETE',
    credentials: 'same-origin',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Delete failed (${res.status}): ${text || res.statusText}`)
  }
  return res.json()
}

/**
 * useAttachmentsForParent — fetches the active attachments for a single
 * parent. Refresh trigger exposed for upload/delete handlers to call
 * after a mutation.
 */
export function useAttachmentsForParent(parentType, parentId) {
  const [attachments, setAttachments] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  const refresh = useCallback(async () => {
    if (!parentType || !parentId) return
    const url = withCourseScope(
      `${API}?parentType=${encodeURIComponent(parentType)}&parentId=${encodeURIComponent(parentId)}`,
    )
    setLoading(true)
    setError(null)
    try {
      const list = await fetchJSON(url)
      setAttachments(list)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [parentType, parentId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { attachments, loading, error, refresh }
}
