// ── TurfIntel Media — Schema & Constants ──────────────────────────────────────
//
// Standard media record schema used across all TurfIntel media storage.
// All media records must be created via createMediaRecord() — never build
// the shape ad-hoc in consuming code.
//
// Note on localUrl / thumbnailUrl:
//   These are session-ephemeral. They are always null when loaded from IDB.
//   After saving or loading a blob, generate them with URL.createObjectURL().
//   Callers are responsible for revoking object URLs when they're no longer needed.

// ── Media type registry ────────────────────────────────────────────────────────

export const MEDIA_TYPE = {
  IMAGE:    'image',
  DOCUMENT: 'document',
}

// ── Module identifiers — mirrors src/utils/intelligence/types.js ──────────────

export const MEDIA_MODULE = {
  SPRAY:      'spray',
  IRRIGATION: 'irrigation',
  DISEASE:    'disease',
  AGRONOMY:   'agronomy',
  CREW:       'crew',
  EQUIPMENT:  'equipment',
}

// ── Allowed MIME types per media type ─────────────────────────────────────────

export const ALLOWED_MIME = {
  image:    ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  document: ['application/pdf'],
}

// ── Record factory ─────────────────────────────────────────────────────────────

/**
 * Creates a standard media metadata record.
 * The id is generated here — never pass one in from outside.
 *
 * @param {Object}   opts
 * @param {string}   opts.type        - MEDIA_TYPE value
 * @param {string}   opts.module      - MEDIA_MODULE value
 * @param {string}   opts.filename    - Sanitized filename (use getSafeFilename)
 * @param {string}   opts.mimeType    - File MIME type e.g. 'image/jpeg'
 * @param {number}   opts.size        - Byte size of the (possibly compressed) blob
 * @param {Object}   [opts.metadata]  - Arbitrary key-value pairs for future extension
 * @param {string[]} [opts.tags]      - Filter/grouping tags
 * @returns {Object} TurfMediaRecord
 */
export function createMediaRecord({
  type,
  module,
  filename,
  mimeType,
  size,
  metadata = {},
  tags     = [],
}) {
  return {
    id:           `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    module,
    filename,
    mimeType,
    size,
    createdAt:    new Date().toISOString(),
    localUrl:     null,   // ephemeral — null in IDB, set after URL.createObjectURL()
    thumbnailUrl: null,   // ephemeral — null in IDB, set after URL.createObjectURL()
    metadata,
    tags,
  }
}
