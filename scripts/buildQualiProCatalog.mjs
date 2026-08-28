#!/usr/bin/env node

// Builds a complete Quali-Pro catalog seed from the manufacturer's current
// product listing. EPA registration/status is validated through PPLS; product
// use information and the distributor market label come from Quali-Pro.

import { writeFileSync } from 'node:fs'

const LIST_URL = 'https://www.controlsolutionsinc.com/quali-pro/products'
const SITE_ROOT = 'https://www.controlsolutionsinc.com'
const PPLS_ROOT = 'https://ordspub.epa.gov/ords/pesticides/cswu'
const EPA_LABEL_ROOT = 'https://www3.epa.gov/pesticides/chem_search/ppls'
const OUTPUT = 'worker/seeds/quali_pro_catalog_2026-08-06.json'

const PRODUCT_OVERRIDES = {
  '/quali-pro/products/foursome-plus': {
    epa_number: null,
    category: 'pigment',
    formulation: 'Turf pigment',
  },
  '/quali-pro/products/rimsulfuron-25-df': {
    epa_number: '66222-184',
    hrac_group: '2',
  },
  '/quali-pro/products/sedgemaster': {
    epa_number: '91234-31-53883',
    hrac_group: '2',
  },
}

const decodeHtml = value => String(value ?? '')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&reg;/gi, '')
  .replace(/&trade;/gi, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

const cleanText = value => decodeHtml(String(value ?? ''))
  .replace(/<br\s*\/?>/gi, ', ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[®™]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const unique = values => [...new Set(values.filter(Boolean))]

function extractField(html, className) {
  const match = html.match(new RegExp(`<div class="${className}[^\"]*"[\\s\\S]*?<span class="info">([\\s\\S]*?)<\\/span>`, 'i'))
  return cleanText(match?.[1])
}

function extractDownload(html, label) {
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    if (cleanText(match[2]).toLowerCase() !== label.toLowerCase()) continue
    const href = decodeHtml(match[1])
    return href ? new URL(href, SITE_ROOT).href : null
  }
  return null
}

function splitList(value) {
  return unique(String(value ?? '').split(/\s*[,;]\s*/).map(cleanText).filter(Boolean))
}

function parseActiveIngredients(value) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)%\s+(.+?)(?=\s+\d+(?:\.\d+)?%|$)/g)]
  if (matches.length) {
    return matches.map(match => ({ name: cleanText(match[2]), percentage: Number(match[1]) }))
  }
  return normalized ? [{ name: cleanText(normalized), percentage: null }] : []
}

function extractGroups(classification, prefix) {
  const values = []
  const matcher = new RegExp(`${prefix}\\s+([0-9A-Z]+(?:\\s*[,/]\\s*[0-9A-Z]+)*)`, 'gi')
  for (const match of classification.matchAll(matcher)) {
    values.push(...match[1].split(/\s*[,/]\s*/))
  }
  return unique(values).join(' + ') || null
}

function mapCategory(descriptor, classification) {
  const text = `${descriptor} ${classification}`.toLowerCase()
  if (text.includes('fungicide') || /\bfrac\b/.test(text)) return 'fungicide'
  if (text.includes('herbicide') || /\b(?:wssa|hrac)\b/.test(text)) return 'herbicide'
  if (text.includes('growth regulator') || /\bpgr\b/.test(text)) return 'pgr'
  if (text.includes('fertilizer')) return 'fertilizer'
  if (text.includes('biostimulant')) return 'biostimulant'
  if (/(insecticide|miticide|nematicide|termiticide)/.test(text) || /\birac\b/.test(text)) return 'insecticide'
  throw new Error(`Cannot map catalog category from '${descriptor}' / '${classification}'`)
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
    return {
      status: /active|registered/i.test(distributor.distributor_status ?? '') ? 'active' : 'discontinued',
      restrictedUse: String(distributor.rup_yn).toLowerCase() === 'yes',
      signalWord: master?.signal_word ?? null,
      formulation: unique((master?.formulations ?? []).map(row => row.formulation)).join('; ') || null,
      epaLabelUrl: latestEpaLabel(master?.pdffiles),
      registeredName: distributor.sec3prodname ?? master?.productname ?? null,
      manufacturer: distributor.companyinfonode?.[0]?.name ?? 'Control Solutions, Inc.',
    }
  }

  const master = (await fetchJson(`${PPLS_ROOT}/ppls/${epaNumber}`))?.items?.[0]
  if (!master) throw new Error(`No EPA product record for ${epaNumber}`)
  return {
    status: String(master.product_status).toLowerCase() === 'active' ? 'active' : 'discontinued',
    restrictedUse: String(master.rup_yn).toLowerCase() === 'yes',
    signalWord: master.signal_word ?? null,
    formulation: unique((master.formulations ?? []).map(row => row.formulation)).join('; ') || null,
    epaLabelUrl: latestEpaLabel(master.pdffiles),
    registeredName: master.productname ?? null,
    manufacturer: master.companyinfo?.[0]?.name ?? 'Control Solutions, Inc.',
  }
}

async function buildProduct(path) {
  const override = PRODUCT_OVERRIDES[path] ?? {}
  const productUrl = new URL(path, SITE_ROOT).href
  const response = await fetch(productUrl)
  if (!response.ok) throw new Error(`${response.status} from ${productUrl}`)
  const html = await response.text()

  const nameMatch = html.match(/<h1 class="hs-search-keyword">([\s\S]*?)<br\s*\/?>/i)
  const descriptorMatch = html.match(/class="generic-descriptor-text"[^>]*>([\s\S]*?)<\/span>/i)
  const productName = cleanText(nameMatch?.[1])
  const descriptor = cleanText(descriptorMatch?.[1])
  const activeText = extractField(html, 'active-ingredients')
  const classification = extractField(html, 'classification')
  const epaText = extractField(html, 'epa')
  const epaNumber = epaText.match(/\d+-\d+(?:-\d+)?/)?.[0] ?? override.epa_number ?? null
  if (!productName) throw new Error(`${path}: missing product name`)
  if (!epaNumber && !override.category) throw new Error(`${path}: missing EPA number`)

  const epa = epaNumber ? await getEpaRecord(epaNumber) : {
    status: 'active',
    restrictedUse: false,
    signalWord: null,
    formulation: override.formulation ?? null,
    epaLabelUrl: null,
    registeredName: null,
    manufacturer: 'Control Solutions, Inc.',
  }
  const marketLabel = extractDownload(html, 'Market Label')
  const sdsUrl = extractDownload(html, 'SDS Sheet')
  const targets = splitList(extractField(html, 'effective-against'))
  const turfSites = splitList(extractField(html, 'use-sites'))
  const category = override.category ?? mapCategory(descriptor, classification)

  return {
    product_name: productName,
    brand_owner: 'Quali-Pro',
    manufacturer: epa.manufacturer,
    epa_number: epaNumber,
    formulation: override.formulation ?? epa.formulation,
    category,
    frac_group: extractGroups(classification, 'FRAC'),
    hrac_group: override.hrac_group ?? extractGroups(classification, '(?:WSSA|HRAC)'),
    irac_group: extractGroups(classification, 'IRAC'),
    pgr_class: category === 'pgr' ? descriptor : null,
    active_ingredients: parseActiveIngredients(activeText),
    rates: [],
    targets,
    turf_sites: turfSites,
    restricted_use: epa.restrictedUse,
    signal_word: epa.signalWord,
    rei_hours: null,
    phi_hours: null,
    label_url: marketLabel ?? epa.epaLabelUrl,
    notes: `Quali-Pro product page: ${productUrl}. Registered product name: ${epa.registeredName ?? productName}. SDS: ${sdsUrl ?? 'not listed'}. Read and follow the linked market label for rates, REI, PPE, and restrictions.`,
    status: epa.status,
  }
}

async function main() {
  const listResponse = await fetch(LIST_URL)
  if (!listResponse.ok) throw new Error(`${listResponse.status} from ${LIST_URL}`)
  const listHtml = await listResponse.text()
  const paths = unique([...listHtml.matchAll(/\/quali-pro\/products\/[a-z0-9-]+/g)].map(match => match[0])).sort()
  if (paths.length < 60) throw new Error(`Expected the full Quali-Pro lineup; found only ${paths.length} product pages`)

  const products = []
  const failures = []
  for (let start = 0; start < paths.length; start += 6) {
    const batch = paths.slice(start, start + 6)
    const results = await Promise.all(batch.map(async path => {
      try { return { product: await buildProduct(path) } }
      catch (error) { return { path, error: error.message } }
    }))
    for (const result of results) {
      if (result.product) {
        products.push(result.product)
        console.log(`verified ${result.product.product_name.padEnd(32)} ${result.product.epa_number}`)
      } else {
        failures.push(result)
        console.error(`failed   ${result.path}: ${result.error}`)
      }
    }
  }

  if (failures.length) {
    throw new Error(`${failures.length} Quali-Pro product(s) could not be verified; seed was not written`)
  }

  const dataset = {
    version: 'quali-pro-2026-08-06',
    generatedAt: new Date().toISOString(),
    source: 'Quali-Pro / Control Solutions product listing and U.S. EPA PPLS',
    notes: 'Current products listed by Quali-Pro. Distributor registrations are validated with PPLS distributor records; master registrations are validated with PPLS product records. Market label and SDS links are taken from the official Quali-Pro product page.',
    products: products.sort((a, b) => a.product_name.localeCompare(b.product_name)),
  }
  writeFileSync(OUTPUT, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
  console.log(`\nWrote ${products.length} verified Quali-Pro products to ${OUTPUT}`)
}

main().catch(error => {
  console.error(`\n${error.message}`)
  process.exitCode = 1
})
