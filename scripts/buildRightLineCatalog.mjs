#!/usr/bin/env node

// Builds the current RightLine catalog from the manufacturer's product pages
// and official labels. EPA registration data is verified through PPLS.

import { writeFileSync } from 'node:fs'
import { extractText, getDocumentProxy } from 'unpdf'

const LIST_URL = 'https://rightlineusa.com/products/'
const SITE_ROOT = 'https://rightlineusa.com'
const PPLS_ROOT = 'https://ordspub.epa.gov/ords/pesticides/cswu'
const EPA_LABEL_ROOT = 'https://www3.epa.gov/pesticides/chem_search/ppls'
const OUTPUT = 'worker/seeds/rightline_catalog_2026-08-08.json'

const PRODUCT_OVERRIDES = {
  '/product/height-wdg/': {
    epa_number: '83529-244',
    category: 'insecticide',
    irac_group: '4A + 3A',
  },
  '/product/olympia/': {
    epa_number: '83529-239',
    category: 'insecticide',
    irac_group: '4A',
  },
  '/product/sulfen-southern/': {
    category: 'herbicide',
  },
}

const EXCLUDED_PATHS = new Set(['/product/yoast-seo-wordpress/'])

const NON_PESTICIDE_OVERRIDES = {
  '/product/rightline-heroic-450/': {
    category: 'fertilizer',
    formulation: 'Liquid fertilizer',
    fertilizer_analysis: '12-5-9',
    rates: [
      { rate: '0.5-1.0 gal', unit: 'gal/acre', interval: 'Lawns, turf, golf fairways, collars, and roughs' },
      { rate: '1.5-3.0 fl oz', unit: 'fl oz/1,000 sq ft', interval: 'Lawns, turf, golf fairways, collars, and roughs' },
    ],
    targets: ['Nitrogen', 'Available phosphate', 'Soluble potash'],
  },
  '/product/rightline-light-it-up/': {
    category: 'fertilizer',
    formulation: 'Liquid iron',
    fertilizer_analysis: '5% Fe',
    rates: [
      { rate: '1-2 qt', unit: 'qt/acre', interval: 'Turfgrass and sod foliar application' },
      { rate: '0.75-1.5 fl oz', unit: 'fl oz/1,000 sq ft', interval: 'Turfgrass and sod foliar application' },
    ],
    targets: ['Iron deficiency'],
  },
}

const decodeHtml = value => String(value ?? '')
  .replace(/&amp;|&#038;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&reg;|&trade;|&#x2122;|&#8482;/gi, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

const cleanText = value => decodeHtml(String(value ?? ''))
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[\u00ae\u2122]/g, '')
  .replace(/[\u2010-\u2015]/g, '-')
  .replace(/\s+/g, ' ')
  .trim()

const titleCase = value => String(value ?? '')
  .toLowerCase()
  .replace(/\b\w/g, letter => letter.toUpperCase())

const unique = values => [...new Set(values.filter(Boolean))]

function pagePath(url) {
  return new URL(url).pathname
}

function extractLinks(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(match => ({
      href: new URL(decodeHtml(match[1]), SITE_ROOT).href,
      text: cleanText(match[2]),
    }))
}

function extractLabelUrl(html) {
  const links = extractLinks(html)
  return links.find(link => /^(?:specimen\s+)?label$/i.test(link.text))?.href ?? null
}

function extractSdsUrl(html) {
  const links = extractLinks(html)
  return links.find(link => /safety data sheet|\bsds\b/i.test(link.text))?.href ?? null
}

function extractMetaDescription(html) {
  const first = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
  const reversed = html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i)
  return cleanText(first?.[1] ?? reversed?.[1])
}

async function labelText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} from label ${url}`)
  const buffer = new Uint8Array(await response.arrayBuffer())
  const pdf = await getDocumentProxy(buffer)
  const extracted = await extractText(pdf, { mergePages: true })
  return String(extracted.text ?? '').replace(/\s+/g, ' ')
}

function extractEpaNumber(text) {
  const patterns = [
    /EPA\s+Reg(?:istration)?\.?\s*(?:No\.?|Number)?\s*[:#]?\s*(\d{4,6}-\d+(?:-\d+)?)/ig,
    /EPA\s+Registration\s+Number\s*[:#]?\s*(\d{4,6}-\d+(?:-\d+)?)/ig,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match?.[1]) return match[1]
  }
  return null
}

function extractReiHours(text) {
  const patterns = [
    /restricted[- ]entry interval(?:\s*\(REI\))?[^.]{0,120}?(\d+(?:\.\d+)?)\s*hours?/i,
    /\bREI\b[^.]{0,60}?(\d+(?:\.\d+)?)\s*hours?/i,
  ]
  for (const pattern of patterns) {
    const value = Number(text.match(pattern)?.[1])
    if (Number.isFinite(value)) return value
  }
  return null
}

function extractGroup(text, type) {
  const matches = [...text.matchAll(new RegExp(`(?:GROUP|Group)\\s+([0-9A-Z]+(?:\\s*[,+/]\\s*[0-9A-Z]+)*)\\s+${type}`, 'gi'))]
  const groups = unique(matches.flatMap(match => match[1].split(/\s*[,+/]\s*/).filter(Boolean)))
  return groups.join(' + ') || null
}

function mapCategory(...parts) {
  const text = parts.join(' ').toLowerCase()
  if (/fungicide/.test(text)) return 'fungicide'
  if (/herbicide/.test(text)) return 'herbicide'
  if (/growth regulator|\bpgr\b/.test(text)) return 'pgr'
  if (/insecticide|nematicide|miticide/.test(text)) return 'insecticide'
  if (/fertilizer|nutrient|\biron\b/.test(text)) return 'fertilizer'
  throw new Error(`Cannot determine product category from: ${parts.filter(Boolean).join(' | ')}`)
}

function latestEpaLabel(files = []) {
  const sorted = [...files].sort((a, b) =>
    (Date.parse(b?.pdffile_accepted_date ?? '') || 0) - (Date.parse(a?.pdffile_accepted_date ?? '') || 0))
  return sorted[0]?.pdffile ? `${EPA_LABEL_ROOT}/${sorted[0].pdffile}` : null
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} from ${url}`)
  return response.json()
}

async function getEpaRecord(epaNumber) {
  const parts = epaNumber.split('-')
  if (parts.length === 3) {
    const distributor = (await fetchJson(`${PPLS_ROOT}/pplsdist/${epaNumber}`))?.items?.[0]
    if (!distributor) throw new Error(`No EPA distributor record for ${epaNumber}`)
    const masterNumber = distributor.sec3rinum
    const master = masterNumber
      ? (await fetchJson(`${PPLS_ROOT}/ppls/${masterNumber}`))?.items?.[0]
      : null
    if (!master) throw new Error(`No EPA master record for distributor registration ${epaNumber}`)
    return {
      record: master,
      registeredName: distributor.sec3prodname ?? master.productname ?? null,
      status: /active|registered/i.test(distributor.distributor_status ?? '') ? 'active' : 'discontinued',
      restrictedUse: String(distributor.rup_yn ?? master.rup_yn).toLowerCase() === 'yes',
    }
  }

  const record = (await fetchJson(`${PPLS_ROOT}/ppls/${epaNumber}`))?.items?.[0]
  if (!record) throw new Error(`No EPA product record for ${epaNumber}`)
  return {
    record,
    registeredName: record.productname ?? null,
    status: String(record.product_status).toLowerCase() === 'active' ? 'active' : 'discontinued',
    restrictedUse: String(record.rup_yn).toLowerCase() === 'yes',
  }
}

function activeIngredients(record) {
  return (record.active_ingredients ?? []).map(ingredient => ({
    name: titleCase(ingredient.active_ing),
    percentage: Number(ingredient.active_ing_percent),
    pc_code: ingredient.pc_code ?? null,
    cas_number: ingredient.cas_number ?? null,
  }))
}

function classifyPgr(ingredients) {
  const names = ingredients.map(ingredient => ingredient.name).join(' ').toLowerCase()
  if (/trinexapac|prohexadione/.test(names)) return 'GA biosynthesis inhibitor - Class A'
  if (/paclobutrazol|flurprimidol/.test(names)) return 'GA biosynthesis inhibitor - Class B'
  return 'Plant growth regulator'
}

async function buildProduct(url) {
  const path = pagePath(url)
  const pageResponse = await fetch(url)
  if (!pageResponse.ok) throw new Error(`${pageResponse.status} from ${url}`)
  const html = await pageResponse.text()
  const name = cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]).toUpperCase()
  const title = cleanText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1])
  const description = extractMetaDescription(html)
  const labelUrl = extractLabelUrl(html)
  const sdsUrl = extractSdsUrl(html)
  const nonPesticide = NON_PESTICIDE_OVERRIDES[path]
  const override = PRODUCT_OVERRIDES[path] ?? {}

  if (!name) throw new Error(`${path}: missing product name`)
  if (!labelUrl) throw new Error(`${path}: missing official label link`)
  const text = await labelText(labelUrl)

  if (nonPesticide) {
    return {
      product_name: name,
      brand_owner: 'RightLine',
      manufacturer: 'RightLine, LLC',
      epa_number: null,
      formulation: nonPesticide.formulation,
      category: nonPesticide.category,
      frac_group: null,
      hrac_group: null,
      irac_group: null,
      pgr_class: null,
      chemical_class: null,
      active_ingredients: [],
      fertilizer_analysis: nonPesticide.fertilizer_analysis,
      rates: nonPesticide.rates,
      targets: nonPesticide.targets,
      turf_sites: ['golf courses', 'turfgrass', 'sod'],
      restricted_use: false,
      signal_word: /\bWARNING\b/i.test(text) ? 'Warning' : (/\bCAUTION\b/i.test(text) ? 'Caution' : null),
      rei_hours: null,
      phi_hours: null,
      label_url: labelUrl,
      notes: `${description} RightLine product page: ${url}. SDS: ${sdsUrl ?? 'not listed'}. Follow the linked manufacturer label for rates and state restrictions.`.trim(),
      status: 'active',
    }
  }

  const epaNumber = extractEpaNumber(text) ?? override.epa_number ?? null
  if (!epaNumber) throw new Error(`${path}: EPA number not found in official label`)
  const epa = await getEpaRecord(epaNumber)
  const record = epa.record
  const category = override.category ?? mapCategory(title, description, text.slice(0, 1800))
  const ingredients = activeIngredients(record)

  return {
    product_name: name,
    brand_owner: 'RightLine',
    manufacturer: record.companyinfo?.[0]?.name ?? 'RightLine, LLC',
    epa_number: epaNumber,
    formulation: unique((record.formulations ?? []).map(row => row.formulation)).join('; ') || null,
    category,
    frac_group: category === 'fungicide' ? extractGroup(text, 'FUNGICIDE') : null,
    hrac_group: category === 'herbicide' ? extractGroup(text, 'HERBICIDE') : null,
    irac_group: override.irac_group ?? (category === 'insecticide' ? extractGroup(text, '(?:INSECTICIDE|NEMATICIDE)') : null),
    pgr_class: category === 'pgr' ? classifyPgr(ingredients) : null,
    chemical_class: null,
    active_ingredients: ingredients,
    fertilizer_analysis: null,
    rates: [],
    targets: unique((record.pests ?? []).map(row => titleCase(row.pest))).filter(target => target !== 'No Pest'),
    turf_sites: unique((record.sites ?? []).map(row => titleCase(row.site))),
    restricted_use: epa.restrictedUse || /RESTRICTED USE PESTICIDE/i.test(text),
    signal_word: record.signal_word ?? null,
    rei_hours: extractReiHours(text),
    phi_hours: null,
    label_url: labelUrl ?? latestEpaLabel(record.pdffiles),
    notes: `${description} RightLine product page: ${url}. Registered product name: ${epa.registeredName ?? name}. SDS: ${sdsUrl ?? 'not listed'}. Read and follow the linked manufacturer label for rates, PPE, use sites, and restrictions.`.trim(),
    status: epa.status,
  }
}

async function main() {
  const response = await fetch(LIST_URL)
  if (!response.ok) throw new Error(`${response.status} from ${LIST_URL}`)
  const html = await response.text()
  const paths = unique([...html.matchAll(/\/product\/[a-z0-9-]+\//g)].map(match => match[0]))
    .filter(path => !EXCLUDED_PATHS.has(path))
    .sort()
  if (paths.length < 30) throw new Error(`Expected at least 30 RightLine product pages; found ${paths.length}`)

  const products = []
  const failures = []
  for (let start = 0; start < paths.length; start += 4) {
    const batch = paths.slice(start, start + 4)
    const results = await Promise.all(batch.map(async path => {
      try { return { product: await buildProduct(new URL(path, SITE_ROOT).href) } }
      catch (error) { return { path, error: error.message } }
    }))
    for (const result of results) {
      if (result.product) {
        products.push(result.product)
        console.log(`verified ${result.product.product_name.padEnd(42)} ${result.product.epa_number ?? result.product.fertilizer_analysis}`)
      } else {
        failures.push(result)
        console.error(`failed   ${result.path}: ${result.error}`)
      }
    }
  }

  if (failures.length) {
    throw new Error(`${failures.length} RightLine product(s) could not be verified; seed was not written`)
  }

  const dataset = {
    version: 'rightline-2026-08-08',
    generatedAt: new Date().toISOString(),
    source: 'RightLine official product pages and labels; U.S. EPA PPLS',
    notes: 'Current products published by RightLine. Pesticide registration, status, ingredients, pests, and sites are verified with EPA PPLS. Manufacturer label links come from RightLine. HEROIC 450 and LIGHT IT UP are non-FIFRA nutrient products cataloged from their guaranteed-analysis labels.',
    products: products.sort((a, b) => a.product_name.localeCompare(b.product_name)),
  }
  writeFileSync(OUTPUT, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
  console.log(`\nWrote ${products.length} verified RightLine products to ${OUTPUT}`)
}

main().catch(error => {
  console.error(`\n${error.message}`)
  process.exitCode = 1
})
