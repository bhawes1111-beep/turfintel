export function normalizePartEquipment(value) {
  const list = Array.isArray(value)
    ? value
    : (value ? [value] : [])
  return [...new Set(list.map(name => String(name).trim()).filter(Boolean))]
}
