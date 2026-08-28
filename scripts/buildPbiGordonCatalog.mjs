#!/usr/bin/env node

// Builds the current PBI-Gordon catalog from the manufacturer's product
// listing, its linked CDMS specimen labels, and EPA PPLS registration data.

import { writeFileSync } from 'node:fs'
import { extractText, getDocumentProxy } from 'unpdf'

const LIST_URL = 'https://www.pbigordonturf.com/products/'
const SITE_ROOT = 'https://www.pbigordonturf.com'
const CDMS_ROOT = 'https://www.cdms.net'
const PPLS_ROOT = 'https://ordspub.epa.gov/ords/pesticides/cswu'
const EPA_LABEL_ROOT = 'https://www3.epa.gov/pesticides/chem_search/ppls'
const OUTPUT = 'worker/seeds/pbi_gordon_catalog_2026-08-17.json'

const PRODUCT_NAME_OVERRIDES = {
  '/products/herbicides/selective-herbicides/arkon-herbicide-liquid/': 'ARKON',
  '/products/herbicides/pre-emergent-herbicides/bensumec-4lf-pre-emergent-herbicide-poa-annua-goosegrass/': 'BENSUMEC 4L',
}

const decodeHtml = value => String(value ?? '')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#x2122;|&trade;/gi, '')
  .replace(/&reg;/gi, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

const cleanText = value => decodeHtml(String(value ?? ''))
  .replace(/<br\s*\/?>/gi, ', ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[®™]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const unique = values => [...new Set(values.filter(Boolean))]

function titleCase(value) {
  return String(value ?? '').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())
}

function productNameFromHtml(html) {
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map(match => cleanText(match[1]))
    .filter(Boolean)
  return headings.filter(heading => !/all products|product catalog/i.test(heading)).at(-1) ?? null
}

function categoryFromPath(path) {
  if (path.includes('/fungicides/')) return 'fungicide'
  if (path.includes('/insecticides/')) return 'insecticide'
  if (path.includes('/growth-regulators/')) return 'pgr'
  if (path.includes('/nutrients/')) return 'fertilizer'
  if (path.includes('/specialty/')) return 'tank_additive'
  if (path.includes('/herbicides/') || path.includes('/agricultural/')) return 'herbicide'
  throw new Error(`Cannot map category from ${path}`)
}

function latestEpaLabel(files = []) {
  const sorted = [...files].sort((a, b) =>
    (Date.parse(b?.pdffile_accepted_date ?? '') || 0) - (Date.parse(a?.pdffile_accepted_date ?? '') || 0))
  return sorted[0]?.pdffile ? `${EPA_LABEL_ROOT}/${sorted[0].pdffile}` : null
}

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} from ${url}`)
  return response.text()
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`${response.status} from ${url}`)
  return response.json()
}

function cdmsProductId(html) {
  const ids = unique([...html.matchAll(/DocumentList\?productId=(\d+)/gi)].map(match => match[1]))
  if (ids.length > 1) throw new Error(`Found multiple CDMS product IDs: ${ids.join(', ')}`)
  return ids[0] ?? null
}

async function cdmsLabel(productId) {
  if (!productId) return null
  const url = `${CDMS_ROOT}/labelssds/Home/DocumentList?productId=${productId}`
  const data = await fetchJson(url, { headers: { Authorization: url } })
  const documents = Array.isArray(data?.Lst) ? data.Lst : []
  const label = documents.find(document =>
    /specimen label/i.test(document?.DocType ?? '') &&
    (!Array.isArray(document.LanguageCodes) || document.LanguageCodes.includes('en')))
  if (!label?.FileName) return null
  return new URL(`${data.LabelFolder ?? 'ldat/'}${label.FileName}`, data.SiteUrl ?? CDMS_ROOT).href
}

async function pdfText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} from ${url}`)
  const pdf = await getDocumentProxy(new Uint8Array(await response.arrayBuffer()))
  const result = await extractText(pdf, { mergePages: true })
  return String(result.text ?? '').replace(/\s+/g, ' ')
}

function epaNumberFromLabel(text) {
  const patterns = [
    /EPA\s*Reg(?:istration)?\.?\s*(?:No\.?|Number)?\s*[:#]?\s*(\d{2,6}-\d{1,6}(?:-\d{1,6})?)/i,
    /EPA\s*No\.?\s*[:#]?\s*(\d{2,6}-\d{1,6}(?:-\d{1,6})?)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1]
  }
  return null
}

function resistanceGroup(text, category) {
  const kind = category === 'fungicide' ? 'FUNGICIDE'
    : category === 'herbicide' ? 'HERBICIDE'
      : category === 'insecticide' ? 'INSECTICIDE'
        : null
  if (!kind) return null
  const patterns = [
    new RegExp(`GROUP(?:S)?\\s+([0-9A-Z]+(?:\\s*[,/+&]\\s*[0-9A-Z]+)*)\\s+${kind}`, 'i'),
    new RegExp(`${kind}\\s+GROUP(?:S)?\\s+([0-9A-Z]+(?:\\s*[,/+&]\\s*[0-9A-Z]+)*)`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1].replace(/\s*[,/&]\s*/g, ' + ').replace(/\s*\+\s*/g, ' + ')
  }
  return null
}

function groupsFromIngredients(activeIngredients, category) {
  const mappings = category === 'herbicide' ? [
    [/pyrimisulfan|penoxsulam|flazasulfuron/i, '2'],
    [/bensulide/i, '3'],
    [/dicamba|2,4-d|2,4-dp|mcpp|mcpa|triclopyr|quinclorac/i, '4'],
    [/fluazifop/i, '1'],
    [/sulfentrazone|carfentrazone/i, '14'],
    [/dichlobenil/i, '20'],
  ] : category === 'fungicide' ? [
    [/tebuconazole/i, '3'],
    [/isofetamid|flutolanil/i, '7'],
    [/azoxystrobin/i, '11'],
    [/cyazofamid/i, '21'],
  ] : category === 'insecticide' ? [
    [/dinotefuran/i, '4A'],
  ] : []
  const groups = []
  for (const ingredient of activeIngredients) {
    for (const [pattern, group] of mappings) {
      if (pattern.test(ingredient.name) && !groups.includes(group)) groups.push(group)
    }
  }
  return groups.join(' + ') || null
}

async function epaRecord(epaNumber) {
  const parts = epaNumber.split('-')
  if (parts.length === 3) {
    const distributor = (await fetchJson(`${PPLS_ROOT}/pplsdist/${epaNumber}`))?.items?.[0]
    if (!distributor) throw new Error(`No EPA distributor record for ${epaNumber}`)
    const masterNumber = distributor.sec3rinum
    const master = masterNumber ? (await fetchJson(`${PPLS_ROOT}/ppls/${masterNumber}`))?.items?.[0] : null
    return { item: master, distributor }
  }
  const item = (await fetchJson(`${PPLS_ROOT}/ppls/${epaNumber}`))?.items?.[0]
  if (!item) throw new Error(`No EPA product record for ${epaNumber}`)
  return { item, distributor: null }
}

function pageList(html, headingPattern) {
  const heading = html.search(headingPattern)
  if (heading < 0) return []
  const tail = html.slice(heading)
  const nextHeading = tail.slice(1).search(/<h[1-5]\b/i)
  const section = nextHeading >= 0 ? tail.slice(0, nextHeading + 1) : tail.slice(0, 12000)
  return unique([...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(match => cleanText(match[1])))
}

async function buildProduct(path, labelProductIds) {
  const productUrl = new URL(path, SITE_ROOT).href
  const html = await fetchText(productUrl)
  const productName = PRODUCT_NAME_OVERRIDES[path] ?? productNameFromHtml(html)?.toUpperCase()
  if (!productName) throw new Error(`${path}: missing product name`)
  const category = categoryFromPath(path)
  const productId = cdmsProductId(html) ?? labelProductIds.get(path) ?? null
  const labelUrl = await cdmsLabel(productId)
  const labelText = labelUrl ? await pdfText(labelUrl) : ''
  const epaNumber = epaNumberFromLabel(labelText)
  const epa = epaNumber ? await epaRecord(epaNumber) : null
  const item = epa?.item
  const distributor = epa?.distributor
  const productStatus = distributor?.distributor_status ?? item?.product_status ?? 'active'
  const company = distributor?.companyinfonode?.[0]?.name ?? item?.companyinfo?.[0]?.name ?? 'PBI-Gordon Corporation'
  const classification = resistanceGroup(labelText, category)
  const activeIngredients = (item?.active_ingredients ?? []).map(ingredient => ({
    name: titleCase(ingredient.active_ing),
    percentage: Number(ingredient.active_ing_percent),
    pc_code: ingredient.pc_code ?? null,
    cas_number: ingredient.cas_number ?? null,
  }))
  const resistanceClassification = groupsFromIngredients(activeIngredients, category) ?? classification

  const fertilizerAnalysis = category === 'fertilizer'
    ? labelText.match(/\b(\d{1,2}-\d{1,2}-\d{1,2})\b/)?.[1] ?? productName.match(/\b(\d{1,2}-\d{1,2}-\d{1,2})\b/)?.[1] ?? null
    : null
  const pageTargets = pageList(html, /<h5\b[^>]*>[^<]*(?:controls|control)[^<]*<\/h5>/i)
  const pageSites = pageList(html, /<h5\b[^>]*>[^<]*(?:labeled|ideal)\s+for\s+use[^<]*<\/h5>/i)

  if (!epaNumber && !['fertilizer', 'tank_additive'].includes(category)) {
    throw new Error(`${productName}: no EPA registration found in the current specimen label`)
  }

  return {
    product_name: productName,
    brand_owner: 'PBI-Gordon',
    manufacturer: company,
    epa_number: epaNumber,
    formulation: unique((item?.formulations ?? []).map(row => row.formulation)).join('; ') || null,
    category,
    frac_group: category === 'fungicide' ? resistanceClassification : null,
    hrac_group: category === 'herbicide' ? resistanceClassification : null,
    irac_group: category === 'insecticide' ? resistanceClassification : null,
    pgr_class: category === 'pgr' ? 'Growth inhibitor (dikegulac)' : null,
    active_ingredients: activeIngredients,
    fertilizer_analysis: fertilizerAnalysis,
    rates: [],
    targets: unique((item?.pests ?? []).map(row => titleCase(row.pest))).filter(name => name !== 'No Pest').slice(0, 300).length
      ? unique((item?.pests ?? []).map(row => titleCase(row.pest))).filter(name => name !== 'No Pest').slice(0, 300)
      : pageTargets,
    turf_sites: unique((item?.sites ?? []).map(row => titleCase(row.site))).slice(0, 300).length
      ? unique((item?.sites ?? []).map(row => titleCase(row.site))).slice(0, 300)
      : pageSites,
    restricted_use: String(distributor?.rup_yn ?? item?.rup_yn).toLowerCase() === 'yes',
    signal_word: item?.signal_word ?? null,
    rei_hours: null,
    phi_hours: null,
    label_url: labelUrl ?? latestEpaLabel(item?.pdffiles),
    notes: `Official PBI-Gordon product page: ${productUrl}. CDMS product ID: ${productId ?? 'not listed'}. Registered product name: ${distributor?.sec3prodname ?? item?.productname ?? productName}. Read and follow the linked current specimen label for rates, REI, PPE, and restrictions.`,
    status: /active|registered/i.test(String(productStatus)) ? 'active' : 'discontinued',
  }
}

async function main() {
  const listHtml = await fetchText(LIST_URL)
  const labelsHtml = await fetchText(`${SITE_ROOT}/labels/`)
  const labelProductIds = new Map()
  for (const match of labelsHtml.matchAll(/window\.location=['"](https?:\/\/www\.pbigordonturf\.com(\/products\/[^'"]+))['"][\s\S]*?DocumentList\?productId=(\d+)/gi)) {
    labelProductIds.set(new URL(match[2], SITE_ROOT).pathname, match[3])
  }
  const paths = unique([...listHtml.matchAll(/href=["']([^"']*\/products\/(?:herbicides|fungicides|insecticides|nutrients|growth-regulators|agricultural|specialty)\/[^"'#?]+\/?)["']/gi)]
    .map(match => new URL(decodeHtml(match[1]), SITE_ROOT).pathname)
    .filter(path => !/\/(?:selective-herbicides|pre-emergent-herbicides)\/?$/i.test(path))
    .filter(path => path.split('/').filter(Boolean).length >= 3))
    .sort()
  if (paths.length < 38) throw new Error(`Expected at least 38 PBI-Gordon products; found ${paths.length}`)

  const products = []
  const failures = []
  for (let start = 0; start < paths.length; start += 3) {
    const results = await Promise.all(paths.slice(start, start + 3).map(async path => {
      try { return { product: await buildProduct(path, labelProductIds) } }
      catch (error) { return { path, error: error.message } }
    }))
    for (const result of results) {
      if (result.product) {
        products.push(result.product)
        console.log(`verified ${result.product.product_name.padEnd(62)} ${result.product.epa_number ?? 'non-EPA'}`)
      } else {
        failures.push(result)
        console.error(`failed   ${result.path}: ${result.error}`)
      }
    }
  }

  if (failures.length) throw new Error(`${failures.length} PBI-Gordon product(s) could not be verified; seed was not written`)

  const dataset = {
    version: 'pbi-gordon-2026-08-17',
    generatedAt: new Date().toISOString(),
    source: 'PBI-Gordon product listing, linked CDMS specimen labels, and U.S. EPA PPLS',
    notes: 'Current application products listed by PBI-Gordon. The Spred-Rite G Granule Spreader is equipment and is intentionally excluded from the product catalog.',
    products: products.sort((a, b) => a.product_name.localeCompare(b.product_name)),
  }
  writeFileSync(OUTPUT, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
  console.log(`\nWrote ${products.length} verified PBI-Gordon products to ${OUTPUT}`)
}

main().catch(error => {
  console.error(`\n${error.message}`)
  process.exitCode = 1
})
