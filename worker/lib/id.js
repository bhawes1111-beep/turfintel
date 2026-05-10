// ID generation. Uses crypto.randomUUID() (available in Workers runtime).

export function generateId(prefix = '') {
  const uuid = crypto.randomUUID()
  return prefix ? `${prefix}-${uuid.slice(0, 8)}` : uuid
}
