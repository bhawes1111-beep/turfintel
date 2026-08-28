#!/usr/bin/env node

// Build the Energy Plant Health catalog directly from the structured product
// list and product records shipped by the manufacturer's official site.

import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const ROOT = 'https://energyplanthealth.com'
const PRODUCTS_URL = `${ROOT}/products`
const OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../worker/seeds/energy_plant_health_catalog_2026-08-06.json',
)

const SDS_BY_PRODUCT = new Map([
  ['AmpliPhy', '/docs/sds/SDS_Energy_AmplipHy_18_1775571847986.pdf'],
  ['BackBone', '/docs/sds/SDS_Energy_Backbone_1775571847986.pdf'],
  ['Bio-Resonance', '/docs/sds/SDS_Bio_Resonance_1775571847983.pdf'],
  ['Bio Rhythm', '/docs/sds/SDS_Bio_Rhythem_1775571847984.pdf'],
  ['Bio Tone', '/docs/sds/SDS_Bio_Tone_1775571847985.pdf'],
  ['Double Bass BTH', '/docs/sds/SDS_Dual_Shield_1775571847985.pdf'],
  ['Green Vibe', '/docs/sds/SDS_GREEN_Vibe_4-0-0_w_Minors_1775571847994.pdf'],
  ['GrooveFe', '/docs/sds/SDS_Groove_Fe_15-0-0_with_Iron_1775571847982.pdf'],
  ['Harmony', '/docs/sds/SDS_Harmony_1775571847994.pdf'],
  ['HighNote', '/docs/sds/SDS_Energy_High_Note_UAN_32-0-0_1775571847987.pdf'],
  ['Kick Drum', '/docs/sds/SDS_Energy_Kick_Drum_1775571847988.pdf'],
  ['Micro Tone', '/docs/sds/SDS_Energy_Micro_Tone_1775571847989.pdf'],
  ['Power Chord', '/docs/sds/SDS_Energy_Low_End_0-0-26_1775571847989.pdf'],
  ['Resonance', '/docs/sds/SDS_Energy_Resonance_1775571847990.pdf'],
  ['Rhythm', '/docs/sds/SDS_Energy_Rhythm_18-3-6_with_minors_1775571847991.pdf'],
  ['Root Note', '/docs/sds/SDS_Energy_Root_Note_3-18-18_DKP_1775571847992.pdf'],
  ['Surf', '/docs/sds/SDS_Energy_Surf_1775571847992.pdf'],
  ['Tempo', '/docs/sds/SDS_Energy_Tempo_30-0-0_SRN_1775571847993.pdf'],
])

const CATEGORY_MAP = new Map([
  ['performance-nutrition', 'fertilizer'],
  ['bio-stimulants', 'biostimulant'],
  ['adjuvants', 'adjuvant'],
  ['surfactants', 'surfactant'],
  ['tank-additives', 'tank_additive'],
])

const absoluteUrl = value => value ? new URL(value, ROOT).href : null
const unique = values => [...new Set(values.filter(Boolean))]

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} from ${url}`)
  return response.text()
}

function extractOfficialList(html) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const data = JSON.parse(match[1])
    if (data?.['@type'] !== 'ItemList' || !Array.isArray(data.itemListElement)) continue
    return data.itemListElement.map(entry => ({
      name: entry?.item?.name,
      url: entry?.item?.url,
    })).filter(entry => entry.name && entry.url)
  }
  return []
}

function extractAssetUrl(html) {
  const source = html.match(/<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/i)?.[1]
  if (!source) throw new Error('Energy site application bundle was not found')
  return absoluteUrl(source)
}

function scanProductObjects(bundle) {
  const products = []
  let cursor = 0

  while ((cursor = bundle.indexOf('{id:"', cursor)) >= 0) {
    let depth = 0
    let quote = null
    let escaped = false
    let end = -1

    for (let index = cursor; index < bundle.length; index += 1) {
      const character = bundle[index]
      if (quote) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) quote = null
        continue
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character
        continue
      }
      if (character === '{' || character === '[' || character === '(') depth += 1
      if (character === '}' || character === ']' || character === ')') depth -= 1
      if (depth === 0) {
        end = index + 1
        break
      }
    }

    if (end < 0) throw new Error(`Unterminated product object at byte ${cursor}`)
    const source = bundle.slice(cursor, end)
    cursor = end
    if (!source.includes('categoryLabel:') || !source.includes('meta:[')) continue

    try {
      const value = vm.runInNewContext(`(${source})`, Object.create(null), { timeout: 50 })
      if (value?.id && value?.name && value?.category) products.push(value)
    } catch {
      // Other application objects can share this prefix; only complete product
      // records are required and are validated against the official ItemList.
    }
  }

  return products
}

function nutrientAnalysis(product) {
  const values = (product.meta ?? [])
    .filter(item => /(?:nitrogen|phosphate|potash|\bp2o5\b|\bk2o\b|sulfur|iron|manganese|magnesium|boron|calcium|copper|zinc|humic|kelp|molasses)/i.test(item.label))
    .map(item => `${item.label} ${item.value}`)
  return values.join('; ') || product.subtitle || null
}

function activeIngredients(product) {
  return (product.meta ?? []).flatMap(item => {
    if (/^(?:size|feature|application|use rate)$/i.test(item.label)) return []
    const percentage = String(item.value ?? '').match(/(-?\d+(?:\.\d+)?)\s*%/)
    if (!percentage) return []
    return [{ name: item.label, percentage: Number(percentage[1]) }]
  })
}

function mapCategory(product) {
  if (product.name === 'Energy Rain Pigment') return 'pigment'
  const category = CATEGORY_MAP.get(product.category)
  if (!category) throw new Error(`${product.name}: unknown category '${product.category}'`)
  return category
}

function buildProduct(product, official) {
  const category = mapCategory(product)
  const labelUrl = product.hasLabel && product.labelImage
    ? absoluteUrl(product.labelImage)
    : official.url
  const salesSheet = absoluteUrl(product.salesSheet)
  const sds = absoluteUrl(SDS_BY_PRODUCT.get(product.name))
  const metaSummary = (product.meta ?? [])
    .map(item => `${item.label}: ${item.value}`)
    .join('; ')

  return {
    product_name: product.name.toUpperCase(),
    brand_owner: 'Energy Fertilizer',
    manufacturer: 'Vereens',
    epa_number: null,
    formulation: 'Liquid',
    category,
    frac_group: null,
    hrac_group: null,
    irac_group: null,
    pgr_class: null,
    chemical_class: product.categoryLabel || null,
    fertilizer_analysis: category === 'fertilizer' || category === 'biostimulant'
      ? nutrientAnalysis(product)
      : null,
    active_ingredients: activeIngredients(product),
    rates: [],
    targets: [],
    turf_sites: ['Golf courses', 'Sports turf', 'Lawn care'],
    restricted_use: false,
    signal_word: null,
    rei_hours: null,
    phi_hours: null,
    label_url: labelUrl,
    notes: unique([
      product.description,
      product.subtitle,
      metaSummary,
      `Official product page: ${official.url}.`,
      salesSheet ? `Sales sheet: ${salesSheet}.` : null,
      sds ? `SDS: ${sds}.` : null,
      'No EPA pesticide registration is listed; follow the current manufacturer directions and compatibility guidance.',
    ]).join(' '),
    status: 'active',
  }
}

async function main() {
  const html = await fetchText(PRODUCTS_URL)
  const bundle = await fetchText(extractAssetUrl(html))
  const bundleProducts = scanProductObjects(bundle)
  const structuredList = extractOfficialList(html)
  const officialList = structuredList.length
    ? structuredList
    : bundleProducts.map(product => ({
        name: product.name,
        url: `${ROOT}/product/${product.id}`,
      }))
  if (officialList.length !== 34) {
    throw new Error(`Expected 34 official products, found ${officialList.length}`)
  }
  const byName = new Map(bundleProducts.map(product => [product.name, product]))
  const missing = officialList.filter(product => !byName.has(product.name))
  if (missing.length) throw new Error(`Missing bundle records: ${missing.map(item => item.name).join(', ')}`)

  const products = officialList.map(official => buildProduct(byName.get(official.name), official))
  const categories = Object.fromEntries(
    [...new Set(products.map(product => product.category))]
      .sort()
      .map(category => [category, products.filter(product => product.category === category).length]),
  )

  const seed = {
    version: 'energy-plant-health-2026-08-06',
    generatedAt: new Date().toISOString(),
    source: 'Energy Plant Health official product catalog and manufacturer resources',
    notes: 'Current Energy Fertilizer products published by Energy Plant Health. Product groups, guaranteed analyses, labels, sales sheets, and SDS links are derived from the official manufacturer site.',
    products,
  }
  await fs.writeFile(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ output: OUTPUT, products: products.length, categories }, null, 2))
}

main().catch(error => {
  console.error(error.stack || error.message)
  process.exit(1)
})
