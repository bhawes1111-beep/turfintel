#!/usr/bin/env node

// Builds a product-catalog seed from EPA's official PPLS API for inventory
// products whose registration identity has been verified. Product names that
// can refer to more than one registration are deliberately excluded until the
// EPA number can be read from the container label.

import { writeFileSync } from 'node:fs'

const OUTPUT = 'worker/seeds/inventory_epa_catalog_2026-08-06.json'
const PPLS_BASE = 'https://ordspub.epa.gov/ords/pesticides/cswu/ppls'
const LABEL_BASE = 'https://www3.epa.gov/pesticides/chem_search/ppls'

const VERIFIED_PRODUCTS = [
  // Catalog correction: the legacy seed incorrectly mapped Daconil Action to
  // EPA 100-1456 (a prodiamine herbicide). Keep the verified fungicide record.
  ['DACONIL ACTION', '100-1364', 'fungicide'],
  ['APPEAR II FUNGICIDE', '100-1642', 'fungicide'],
  ['ARKON', '2217-1072', 'herbicide'],
  ['ASCERNITY', '100-1477', 'fungicide'],
  ['BENSUMEC 4L', '2217-696', 'herbicide'],
  ['CONTRADO SC', '53883-534', 'insecticide', { brand_owner: 'Quali-Pro', irac_group: '28' }],
  ['DENSICOR', '101563-210', 'fungicide'],
  ['DITHIOPYR 2EW', '53883-500', 'herbicide', { brand_owner: 'Quali-Pro', hrac_group: '3' }],
  ['FOSETYL-AL 80 WDG', '66222-161', 'fungicide', { brand_owner: 'Quali-Pro', frac_group: '33' }],
  ['IMITATOR PLUS', '19713-526', 'herbicide'],
  ['METRICOR DF', '70506-103', 'herbicide'],
  ['NEGATE 37WG', '53883-307', 'herbicide', { brand_owner: 'Quali-Pro', hrac_group: '2' }],
  ['PENDANT SC', '53883-477', 'fungicide'],
  ['PROPICONAZOLE 14.3', '53883-363', 'fungicide', { brand_owner: 'Quali-Pro', frac_group: '3' }],
  ['RESILIA', '101563-223', 'fungicide'],
  ['REVOLVER', '101563-53', 'herbicide'],
  ['SPECTICLE FLO', '101563-207', 'herbicide'],
  ['SPEED ZONE SOUTHERN', '2217-835', 'herbicide'],
  ['SULFEN SOUTHERN', '93051-6', 'herbicide'],
  ['TEBUCONAZOLE 3.6F', '66222-117', 'fungicide', { brand_owner: 'Quali-Pro', frac_group: '3' }],
  ['TIDE PACLO 2SC', '80697-4', 'pgr'],
  ['TREFINTI', '100-1722', 'insecticide'],
  ['TRIBUTE TOTAL', '101563-147', 'herbicide'],
  ['TRIN-PAC', '89442-7', 'pgr'],
  ['ZELTO', '84059-14', 'insecticide'],
  ['T-NEX', '53883-353', 'pgr', { brand_owner: 'Quali-Pro', pgr_class: 'GA biosynthesis inhibitor (Type II)' }],
]

const titleCase = value => String(value ?? '')
  .toLowerCase()
  .replace(/\b\w/g, letter => letter.toUpperCase())

const unique = values => [...new Set(values.filter(Boolean))]

function latestPdf(files = []) {
  const sorted = [...files].sort((a, b) => {
    const aDate = Date.parse(a?.pdffile_accepted_date ?? '') || 0
    const bDate = Date.parse(b?.pdffile_accepted_date ?? '') || 0
    return bDate - aDate
  })
  return sorted[0]?.pdffile ? `${LABEL_BASE}/${sorted[0].pdffile}` : null
}

async function fetchProduct([inventoryName, epaNumber, category, overrides = {}]) {
  const response = await fetch(`${PPLS_BASE}/${epaNumber}`)
  if (!response.ok) throw new Error(`${inventoryName}: EPA returned ${response.status}`)
  const payload = await response.json()
  const item = payload?.items?.[0]
  if (!item) throw new Error(`${inventoryName}: no EPA record for ${epaNumber}`)

  const apiNumber = String(item.eparegno ?? '').trim()
  if (apiNumber !== epaNumber) {
    throw new Error(`${inventoryName}: expected ${epaNumber}, received ${apiNumber || 'no registration number'}`)
  }

  const company = item.companyinfo?.[0]?.name ?? null
  const activeIngredients = (item.active_ingredients ?? []).map(ingredient => ({
    name: titleCase(ingredient.active_ing),
    percentage: Number(ingredient.active_ing_percent),
    pc_code: ingredient.pc_code ?? null,
    cas_number: ingredient.cas_number ?? null,
  }))

  return {
    product_name: inventoryName,
    brand_owner: overrides.brand_owner ?? company,
    manufacturer: company,
    epa_number: epaNumber,
    formulation: unique((item.formulations ?? []).map(row => row.formulation)).join('; ') || null,
    category,
    frac_group: overrides.frac_group ?? null,
    hrac_group: overrides.hrac_group ?? null,
    irac_group: overrides.irac_group ?? null,
    pgr_class: overrides.pgr_class ?? null,
    active_ingredients: activeIngredients,
    rates: [],
    targets: unique((item.pests ?? []).map(row => titleCase(row.pest))).filter(name => name !== 'No Pest'),
    turf_sites: unique((item.sites ?? []).map(row => titleCase(row.site))),
    restricted_use: String(item.rup_yn).toLowerCase() === 'yes',
    signal_word: item.signal_word ?? null,
    rei_hours: null,
    phi_hours: null,
    label_url: latestPdf(item.pdffiles),
    notes: `Official EPA PPLS record. Registered product name: ${item.productname}. Application rates, REI, and use restrictions must be read from the linked label.`,
    status: String(item.product_status).toLowerCase() === 'active' ? 'active' : 'discontinued',
  }
}

async function main() {
  const products = []
  for (const definition of VERIFIED_PRODUCTS) {
    const product = await fetchProduct(definition)
    products.push(product)
    console.log(`verified ${product.product_name.padEnd(28)} ${product.epa_number}  ${product.status}`)
  }

  const dataset = {
    version: 'inventory-epa-2026-08-06',
    generatedAt: new Date().toISOString(),
    source: 'U.S. EPA Pesticide Product Label System (PPLS) API',
    notes: 'Only products with a verified, unambiguous EPA registration are included. Rates, REI, and PHI are intentionally not inferred from the API and must be read from the linked accepted label.',
    products,
  }
  writeFileSync(OUTPUT, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
  console.log(`\nWrote ${products.length} verified products to ${OUTPUT}`)
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
