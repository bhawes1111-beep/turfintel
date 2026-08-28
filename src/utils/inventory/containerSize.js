export function formatContainerSize(item) {
  if (item?.containerCount && item?.containerSize && item?.containerUnit) {
    const total = calculateContainerTotal(item.containerCount, item.containerSize)
    const totalText = total == null ? '' : ` = ${formatInventoryNumber(total)} ${item.containerUnit}`
    return `${item.containerCount} x ${item.containerSize} ${item.containerUnit}${totalText}`
  }

  const parts = [
    item?.containerSize,
    item?.containerUnit,
    item?.containerType,
  ].map(value => String(value ?? '').trim()).filter(Boolean)

  return parts.join(' ')
}

export function calculateContainerTotal(containerCount, containerSize) {
  const count = Number(containerCount)
  const size = Number(containerSize)
  if (!Number.isFinite(count) || !Number.isFinite(size)) return null
  return roundInventoryNumber(count * size)
}

export function calculateUnitCost(containerPrice, containerSize) {
  const price = Number(containerPrice)
  const size = Number(containerSize)
  if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return null
  return roundMoney(price / size)
}

export function calculateContainerInventoryValue(containerCount, containerPrice) {
  const count = Number(containerCount)
  const price = Number(containerPrice)
  if (!Number.isFinite(count) || !Number.isFinite(price)) return null
  return roundMoney(count * price)
}

export function convertInventoryWeight(value, fromUnit, toUnit) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null

  const normalize = unit => {
    const value = String(unit ?? '').trim().toLowerCase()
    if (['lb', 'lbs', 'pound', 'pounds'].includes(value)) return 'lb'
    if (['oz', 'ounce', 'ounces'].includes(value)) return 'oz'
    return value
  }

  const from = normalize(fromUnit)
  const to = normalize(toUnit)
  if (from === to && (from === 'lb' || from === 'oz')) return amount
  if (from === 'lb' && to === 'oz') return roundInventoryNumber(amount * 16)
  if (from === 'oz' && to === 'lb') return roundInventoryNumber(amount / 16)
  return null
}

export function formatInventoryWeightEquivalent(value, unit) {
  const normalized = String(unit ?? '').trim().toLowerCase()
  const target = ['lb', 'lbs', 'pound', 'pounds'].includes(normalized) ? 'oz'
    : ['oz', 'ounce', 'ounces'].includes(normalized) ? 'lb'
      : null
  if (!target) return ''
  const converted = convertInventoryWeight(value, unit, target)
  return converted == null ? '' : `${formatInventoryNumber(converted)} ${target}`
}

export function formatInventoryNumber(value) {
  if (value === '' || value == null) return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return String(roundInventoryNumber(num))
}

export function formatMoney(value) {
  if (value === '' || value == null) return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return `$${roundMoney(num).toFixed(2)}`
}

function roundInventoryNumber(value) {
  return Math.round(Number(value) * 10000) / 10000
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100
}
