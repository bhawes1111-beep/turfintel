const THOUSAND_SQ_FT_PER_ACRE = 43.56

export const CARRIER_RATE_UNITS = [
  { value: 'gallons_per_acre', label: 'gal / acre' },
  { value: 'gallons_per_1000sqft', label: 'gal / 1,000 sq ft' },
]

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function sumApplicationAcres(areas) {
  if (!Array.isArray(areas)) return 0
  return areas.reduce((sum, area) => {
    const acreage = finiteNumber(area?.acreage)
    return sum + (acreage != null && acreage > 0 ? acreage : 0)
  }, 0)
}

export function calculateCarrierGallons(rate, unit, acres) {
  const numericRate = finiteNumber(rate)
  const numericAcres = finiteNumber(acres)
  if (numericRate == null || numericRate < 0 || numericAcres == null || numericAcres <= 0) return null
  return unit === 'gallons_per_1000sqft'
    ? numericRate * numericAcres * THOUSAND_SQ_FT_PER_ACRE
    : numericRate * numericAcres
}

export function parseCarrierRate(carrierVolume, totalVolume, acres) {
  const text = String(carrierVolume ?? '')
  const perThousand = text.match(/([0-9]+(?:\.[0-9]+)?)\s*gal(?:lons?)?\s*\/\s*1(?:,?000)?\s*(?:sq(?:uare)?\s*ft|sf)/i)
  if (perThousand) {
    return { rate: perThousand[1], unit: 'gallons_per_1000sqft' }
  }

  const perAcre = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:gal(?:lons?)?\s*\/\s*acre|gpa)\b/i)
  if (perAcre) {
    return { rate: perAcre[1], unit: 'gallons_per_acre' }
  }

  const numericTotal = finiteNumber(totalVolume)
  const numericAcres = finiteNumber(acres)
  if (numericTotal != null && numericTotal >= 0 && numericAcres != null && numericAcres > 0) {
    return { rate: String(numericTotal / numericAcres), unit: 'gallons_per_acre' }
  }

  return { rate: '', unit: 'gallons_per_acre' }
}

export function formatCarrierSummary(rate, unit, totalVolume) {
  const numericRate = finiteNumber(rate)
  if (numericRate == null || numericRate < 0) return null
  const unitLabel = unit === 'gallons_per_1000sqft' ? 'gal / 1,000 sq ft' : 'gal / acre'
  const numericTotal = finiteNumber(totalVolume)
  return numericTotal != null && numericTotal >= 0
    ? `${numericRate} ${unitLabel} | ${Number(numericTotal.toFixed(2))} gal total`
    : `${numericRate} ${unitLabel}`
}
