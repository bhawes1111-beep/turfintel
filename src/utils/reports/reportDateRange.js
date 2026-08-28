function parseLocalDate(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function defaultOwnerReportRange(referenceDate = new Date()) {
  const reference = parseLocalDate(referenceDate)
  if (!reference) return { startDate: '', endDate: '' }
  const daysSinceMonday = (reference.getDay() + 6) % 7
  const start = addDays(reference, -daysSinceMonday)
  const end = addDays(start, 13)
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) }
}

export function ownerReportEndDate(startDate) {
  const start = parseLocalDate(startDate)
  return start ? toIsoDate(addDays(start, 13)) : ''
}
