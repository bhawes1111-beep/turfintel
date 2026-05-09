// ── TurfIntel Media — Utility Functions ───────────────────────────────────────
//
// Pure browser utilities for file validation, image processing, and data grouping.
// No IDB or fetch calls here — all functions are side-effect free except for
// canvas operations (which only touch the DOM transiently).
//
// Image processing uses createImageBitmap + canvas.toBlob. Both fall back
// gracefully: compressImage returns the original file, generateThumbnail returns null.

// ── File validation ────────────────────────────────────────────────────────────

/**
 * Returns true if the file's MIME type is in the allowedMimes list.
 * @param {File}     file
 * @param {string[]} allowedMimes  e.g. ['image/jpeg', 'image/png']
 */
export function validateFileType(file, allowedMimes) {
  if (!file?.type) return false
  return allowedMimes.includes(file.type)
}

/**
 * Human-readable file size label.
 * @param {number} bytes
 * @returns {string}  e.g. '1.4 MB', '320.0 KB', '512 B'
 */
export function getFileSizeLabel(bytes) {
  if (typeof bytes !== 'number' || bytes < 0) return '—'
  if (bytes < 1_024)           return `${bytes} B`
  if (bytes < 1_048_576)       return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

/**
 * Strips characters that are unsafe in filenames. Caps at 255 characters.
 * @param {string} filename
 * @returns {string}
 */
export function getSafeFilename(filename) {
  if (!filename) return 'unnamed'
  return filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_').slice(0, 255)
}

// ── Image compression ──────────────────────────────────────────────────────────

/**
 * Compresses an image file using canvas. Scales down if larger than maxWidth/maxHeight
 * while preserving aspect ratio. Never upscales.
 *
 * Falls back to the original file if createImageBitmap or canvas.toBlob are
 * unavailable or fail for any reason.
 *
 * @param {File|Blob} file
 * @param {Object}    [opts]
 * @param {number}    [opts.maxWidth=1920]
 * @param {number}    [opts.maxHeight=1080]
 * @param {number}    [opts.quality=0.85]   JPEG quality 0–1
 * @returns {Promise<Blob>}
 */
export async function compressImage(file, {
  maxWidth  = 1920,
  maxHeight = 1080,
  quality   = 0.85,
} = {}) {
  try {
    const bitmap = await createImageBitmap(file)

    // Never upscale — ratio capped at 1
    const ratio = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1)
    const w = Math.max(1, Math.floor(bitmap.width  * ratio))
    const h = Math.max(1, Math.floor(bitmap.height * ratio))

    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
        'image/jpeg',
        quality,
      )
    })
  } catch {
    // Compression unavailable or failed — return original file unchanged.
    return file
  }
}

// ── Thumbnail generation ───────────────────────────────────────────────────────

/**
 * Generates a square-bounded thumbnail using canvas. Preserves aspect ratio.
 * The output fits within a `size × size` bounding box.
 *
 * Returns null if createImageBitmap or canvas.toBlob are unavailable.
 * Callers must handle null thumbnailUrl gracefully.
 *
 * @param {File|Blob} file
 * @param {Object}    [opts]
 * @param {number}    [opts.size=200]   Bounding box in pixels
 * @returns {Promise<Blob|null>}
 */
export async function generateThumbnail(file, { size = 200 } = {}) {
  try {
    const bitmap = await createImageBitmap(file)

    const ratio = Math.min(size / bitmap.width, size / bitmap.height)
    const w = Math.max(1, Math.floor(bitmap.width  * ratio))
    const h = Math.max(1, Math.floor(bitmap.height * ratio))

    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
        'image/jpeg',
        0.75,
      )
    })
  } catch {
    // Thumbnail generation unavailable or failed — callers handle null.
    return null
  }
}

// ── Grouping helpers ───────────────────────────────────────────────────────────

/**
 * Groups an array of media records by module.
 * @param {Object[]} records
 * @returns {Object}  e.g. { spray: [...], irrigation: [...] }
 */
export function groupByModule(records) {
  return records.reduce((acc, r) => {
    ;(acc[r.module] ??= []).push(r)
    return acc
  }, {})
}

/**
 * Groups an array of media records by tag. Records with multiple tags appear
 * in multiple groups.
 * @param {Object[]} records
 * @returns {Object}  e.g. { 'pre-spray': [...], 'post-spray': [...] }
 */
export function groupByTag(records) {
  return records.reduce((acc, r) => {
    for (const tag of (r.tags ?? [])) {
      ;(acc[tag] ??= []).push(r)
    }
    return acc
  }, {})
}
