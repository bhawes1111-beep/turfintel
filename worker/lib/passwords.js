// Password hashing — PBKDF2 via WebCrypto.
//
// No native bcrypt/argon dependency: WebCrypto's PBKDF2 is built into the
// Workers runtime (and Node 18+), so this runs identically in production and
// in node-run smoke tests. Storage format is self-describing so the work
// factor can be raised later without breaking existing hashes:
//
//   pbkdf2$<iterations>$<salt_b64>$<hash_b64>
//
// Verification is constant-time over the derived bits.

const ITERATIONS = 100_000
const HASH = 'SHA-256'
const KEYLEN_BITS = 256
const SALT_BYTES = 16

function b64encode(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function b64decode(str) {
  const bin = atob(str)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveBits(password, salt, iterations) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: HASH },
    keyMaterial,
    KEYLEN_BITS,
  )
  return new Uint8Array(bits)
}

/** hashPassword — returns the self-describing storage string. */
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await deriveBits(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${b64encode(salt)}$${b64encode(hash)}`
}

// Constant-time comparison over equal-length byte arrays.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** verifyPassword — re-derives with the stored salt/iterations and compares. */
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = parseInt(parts[1], 10)
  if (!Number.isFinite(iterations) || iterations <= 0) return false
  let salt, expected
  try {
    salt = b64decode(parts[2])
    expected = b64decode(parts[3])
  } catch {
    return false
  }
  const actual = await deriveBits(password, salt, iterations)
  return timingSafeEqual(actual, expected)
}
