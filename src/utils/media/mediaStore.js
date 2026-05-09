// ── TurfIntel Media Store — Public API ────────────────────────────────────────
//
// The only entry point consumers should import from. Never import mediaPersistence
// or mediaUtils directly in components — use these functions instead.
//
// Object URL lifecycle:
//   saveMedia()     returns localUrl + thumbnailUrl populated (for immediate display).
//   getMediaRecord() returns the raw IDB record — localUrl/thumbnailUrl are null.
//   To display after load: const blob = await getMediaBlob(id)
//                          const url  = URL.createObjectURL(blob)
//   Always revoke: URL.revokeObjectURL(url) when the component unmounts.
//
// Error handling:
//   saveMedia() propagates IDB errors (e.g. quota exceeded) — callers must catch.
//   All other functions propagate IDB errors; wrap in try/catch where needed.

import * as db from './mediaPersistence'
import { createMediaRecord, ALLOWED_MIME, MEDIA_TYPE } from './mediaSchemas'
import {
  validateFileType,
  getSafeFilename,
  compressImage,
  generateThumbnail,
} from './mediaUtils'

// ── saveMedia ─────────────────────────────────────────────────────────────────
// Full pipeline: validate → compress → thumbnail → persist → return with URLs.
//
// @param {File}   file
// @param {Object} opts
// @param {string} opts.type     - MEDIA_TYPE value ('image' | 'document')
// @param {string} opts.module   - MEDIA_MODULE value ('spray' | 'irrigation' | …)
// @param {string[]} [opts.tags]
// @param {Object}   [opts.metadata]
// @returns {Promise<Object>} TurfMediaRecord with localUrl + thumbnailUrl set
// @throws  On invalid file type or IDB quota/storage error

export async function saveMedia(file, { type, module, tags = [], metadata = {} }) {
  if (!validateFileType(file, ALLOWED_MIME[type] ?? [])) {
    throw new Error(`File type "${file.type}" is not allowed for media type "${type}"`)
  }

  const isImage = type === MEDIA_TYPE.IMAGE

  // Compress if image — falls back to original file on canvas failure
  const blob = isImage ? await compressImage(file) : file

  const record = createMediaRecord({
    type,
    module,
    filename: getSafeFilename(file.name),
    mimeType: file.type,
    size:     blob.size,
    metadata,
    tags,
  })

  // Save main blob — may throw on quota exceeded; let it propagate
  await db.saveBlob(record.id, blob)

  // Generate and save thumbnail — best-effort, null is acceptable
  let thumbBlob = null
  if (isImage) {
    thumbBlob = await generateThumbnail(file)
    if (thumbBlob) {
      await db.saveBlob(`${record.id}-thumb`, thumbBlob)
    }
  }

  // Save metadata after blobs so a crash mid-save leaves no orphan meta record
  await db.saveMeta(record)

  // Return record with fresh session-ephemeral URLs for immediate display
  return {
    ...record,
    localUrl:     URL.createObjectURL(blob),
    thumbnailUrl: thumbBlob ? URL.createObjectURL(thumbBlob) : null,
  }
}

// ── getMediaRecord ─────────────────────────────────────────────────────────────
// Returns the metadata record for an id. localUrl/thumbnailUrl will be null.

export function getMediaRecord(id) {
  return db.getMeta(id)
}

// ── getMediaBlob ──────────────────────────────────────────────────────────────
// Returns the main Blob for an id, or null if not found.
// Create a URL with URL.createObjectURL(blob) and revoke it when done.

export function getMediaBlob(id) {
  return db.getBlob(id)
}

// ── getThumbnailBlob ──────────────────────────────────────────────────────────
// Returns the thumbnail Blob for an id, or null if not present.

export function getThumbnailBlob(id) {
  return db.getBlob(`${id}-thumb`)
}

// ── getMediaByModule ──────────────────────────────────────────────────────────
// Returns all metadata records for a given module, sorted newest-first.

export async function getMediaByModule(module) {
  const records = await db.getMetaByModule(module)
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ── getAllMedia ───────────────────────────────────────────────────────────────
// Returns all metadata records, sorted newest-first.

export async function getAllMedia() {
  const records = await db.getAllMeta()
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ── deleteMedia ───────────────────────────────────────────────────────────────
// Removes metadata + main blob + thumbnail blob.
// IDB delete is idempotent — safe even if thumbnail was never generated.

export function deleteMedia(id) {
  return Promise.all([
    db.deleteMeta(id),
    db.deleteBlob(id),
    db.deleteBlob(`${id}-thumb`),
  ])
}
