#!/usr/bin/env node

// Builds a catalog seed for the products featured in Syngenta's 2023 golf
// portfolio brochure. Current product metadata and labels come from GreenCast;
// federal registration data is validated against EPA PPLS.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const GREENCAST_INDEX = 'https://www.greencastonline.com/labels/labelresult.aspx'
const GREENCAST_ROOT = 'https://www.greencastonline.com'
const PPLS_ROOT = 'https://ordspub.epa.gov/ords/pesticides/cswu/ppls'
const OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../worker/seeds/syngenta_golf_portfolio_2023.json',
)

const BROCHURE_PRODUCTS = [
  'Appear II',
  'Ascernity',
  'Banner Maxx II',
  'Briskway',
  'Concert II',
  'Daconil Action',
  'Headway',
  'Heritage Action',
  'Instrata',
  'Medallion SC',
  'Posterity',
  'Posterity Forte',
  'Posterity XT',
  'Renown',
  'Secure Action',
  'Subdue Maxx',
  'Tuque exoGEM',
  'Velista',
  'Primo Maxx',
  'Trimmit 2SC',
  'Barricade 4FL',
  'Fusilade II Turf and Ornamental',
  'Manuscript',
  'Monument 75WG',
  'Pennant Magnum',
  'Princep Liquid',
  'Recognition',
  'Reward Landscape and Aquatic',
  'Tenacity',
  'Acelepryn',
  'Acelepryn Xtra',
  'Advion Fire Ant Bait',
  'Advion Insect Granule',
  'Divanem',
  'Ference',
  'Meridian 25WG',
  'Provaunt WDG',
  'Scimitar GC',
  'Caravan G',
]

const DISPLAY_NAME_OVERRIDES = {
  'Appear II': 'APPEAR II FUNGICIDE',
}

const CATEGORY_OVERRIDES = {
  'Caravan G': 'insecticide',
}

const DOWNLOAD_TEXT_OVERRIDES = {
  Manuscript: {
    label: 'Manuscript Label',
    sds: 'Manuscript SDS',
  },
}

const decodeHtml = value => String(value ?? '')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&nbsp;/gi, ' ')
  .replace(/&reg;|&trade;/gi, '')
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

const cleanText = value => decodeHtml(value)
  .replace(/<br\s*\/?>/gi, ', ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const unique = values => [...new Set(values.filter(Boolean))]

function extractField(block, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = block.match(new RegExp(`<strong>${escaped}:<\\/strong>([\\s\\S]*?)<\\/p>`, 'i'))
  return cleanText(match?.[1])
}

function extractDownload(block, label) {
  for (const match of block.matchAll(/<a\b[^>]*\bhref=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (cleanText(match[2]).toLowerCase() !== label.toLowerCase()) continue
    return new URL(decodeHtml(match[1]), GREENCAST_ROOT).href
  }
  return null
}

function mapCategory(name, descriptor) {
  if (CATEGORY_OVERRIDES[name]) return CATEGORY_OVERRIDES[name]
  const value = descriptor.toLowerCase()
  if (value.includes('plant growth regulator')) return 'pgr'
  if (value.includes('fungicide')) return 'fungicide'
  if (value.includes('herbicide')) return 'herbicide'
  if (value.includes('insecticide') || value.includes('nematicide')) return 'insecticide'
  throw new Error(`Cannot map category for ${name}: ${descriptor}`)
}

function extractGroups(classification) {
  const match = classification.match(/Group\s+(.+?)\s+(?:Fungicide|Herbicide|Insecticide|Nematicide|Plant Growth Regulator)/i)
  return match ? match[1].replace(/\s*,\s*/g, ', ').trim() : null
}

function splitGroups(classification, category) {
  const groups = extractGroups(classification)
  return {
    frac_group: category === 'fungicide' ? groups : null,
    hrac_group: category === 'herbicide' ? groups : null,
    irac_group: category === 'insecticide' ? groups : null,
  }
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} from ${url}`)
  return response.json()
}

async function getEpaRecord(epaNumber) {
  const record = (await fetchJson(`${PPLS_ROOT}/${epaNumber}`))?.items?.[0]
  if (!record) throw new Error(`No EPA PPLS record for ${epaNumber}`)
  return record
}

function parseIndex(html) {
  const records = new Map()
  const blocks = html.split('<div class="col-md-12 md-margin-bottom-30 nopadding">').slice(1)

  for (const rawBlock of blocks) {
    const block = rawBlock.split('<hr class="devider')[0]
    const name = cleanText(block.match(/prodlogo-svg[^>]+alt=['"]([^'"]+)['"]/i)?.[1])
    if (!name) continue
    records.set(name, block)
  }
  return records
}

async function buildProduct(name, block) {
  const descriptor = cleanText(block.match(/<h3>[\s\S]*?<strong>([\s\S]*?)<\/strong>\s*<\/h3>/i)?.[1])
  const description = cleanText(block.match(/<\/h3>\s*<p>([\s\S]*?)<\/p>/i)?.[1])
  const classification = extractField(block, 'HRAC/FRAC/IRAC Classification')
  const epaNumber = extractField(block, 'EPA#').match(/\d+-\d+(?:-\d+)?/)?.[0]
  const downloadText = DOWNLOAD_TEXT_OVERRIDES[name] ?? {}
  const labelUrl = extractDownload(block, downloadText.label ?? 'Current EPA-Approved Label')
  const sdsUrl = extractDownload(block, downloadText.sds ?? 'SDS')
  const overviewPath = block.match(/href=['"]([^'"]+)['"][^>]*>[\s\S]*?Product Overview/i)?.[1]
  const overviewUrl = overviewPath ? new URL(overviewPath, GREENCAST_ROOT).href : null

  if (!descriptor || !epaNumber || !labelUrl) {
    throw new Error(`${name}: missing descriptor, EPA number, or current label`)
  }

  const epa = await getEpaRecord(epaNumber)
  if (String(epa.product_status).toLowerCase() !== 'active') {
    throw new Error(`${name}: EPA registration ${epaNumber} is not active`)
  }

  const category = mapCategory(name, descriptor)
  const groups = splitGroups(classification, category)

  return {
    product_name: DISPLAY_NAME_OVERRIDES[name] ?? name.toUpperCase(),
    brand_owner: 'Syngenta',
    manufacturer: epa.companyinfo?.[0]?.name ?? 'SYNGENTA CROP PROTECTION, LLC',
    epa_number: epaNumber,
    formulation: unique((epa.formulations ?? []).map(row => cleanText(row.formulation))).join('; ') || null,
    category,
    ...groups,
    pgr_class: category === 'pgr' ? descriptor : null,
    active_ingredients: (epa.active_ingredients ?? []).map(row => ({
      name: cleanText(row.active_ing),
      percentage: Number.isFinite(Number(row.active_ing_percent)) ? Number(row.active_ing_percent) : null,
    })),
    rates: [],
    targets: unique((epa.pests ?? []).map(row => cleanText(row.pest)).filter(value => value && value !== 'NO PEST')),
    turf_sites: unique((epa.sites ?? []).map(row => cleanText(row.site)).filter(value => value && value !== 'TANK MIX')),
    restricted_use: String(epa.rup_yn).toLowerCase() === 'yes',
    signal_word: cleanText(epa.signal_word) || null,
    rei_hours: null,
    phi_hours: null,
    label_url: labelUrl,
    notes: [
      description,
      `GreenCast product page: ${overviewUrl ?? GREENCAST_INDEX}.`,
      `SDS: ${sdsUrl ?? 'not listed'}.`,
      `Registered product name: ${cleanText(epa.productname)}.`,
      'Read and follow the current linked EPA-approved label for rates, REI, PPE, and restrictions.',
    ].filter(Boolean).join(' '),
    status: 'active',
  }
}

async function main() {
  const response = await fetch(GREENCAST_INDEX)
  if (!response.ok) throw new Error(`${response.status} from ${GREENCAST_INDEX}`)
  const records = parseIndex(await response.text())

  const missing = BROCHURE_PRODUCTS.filter(name => !records.has(name))
  if (missing.length) throw new Error(`Products missing from GreenCast: ${missing.join(', ')}`)

  const products = []
  const failures = []
  for (let start = 0; start < BROCHURE_PRODUCTS.length; start += 6) {
    const batch = BROCHURE_PRODUCTS.slice(start, start + 6)
    const results = await Promise.all(batch.map(async name => {
      try { return { product: await buildProduct(name, records.get(name)) } }
      catch (error) { return { name, error: error.message } }
    }))

    for (const result of results) {
      if (result.product) {
        products.push(result.product)
        console.log(`verified ${result.product.product_name.padEnd(34)} ${result.product.epa_number}`)
      } else {
        failures.push(result)
        console.error(`failed   ${result.name}: ${result.error}`)
      }
    }
  }

  if (failures.length) {
    throw new Error(`${failures.length} Syngenta product(s) could not be verified; seed was not written`)
  }

  const seed = {
    version: 'syngenta-golf-portfolio-2023',
    generatedAt: new Date().toISOString(),
    source: 'Syngenta golf portfolio brochure, GreenCast current labels, and U.S. EPA PPLS',
    notes: 'Products featured in the supplied 2023 Syngenta golf portfolio brochure. Current product metadata and labels were retrieved from GreenCast and federal registration data was validated against EPA PPLS.',
    products,
  }

  await fs.writeFile(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')
  console.log(`\nWrote ${products.length} verified Syngenta golf products to ${OUTPUT}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
