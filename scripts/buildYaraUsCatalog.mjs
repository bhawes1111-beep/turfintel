#!/usr/bin/env node

// Build the current U.S. Yara fertilizer catalog from the official portfolio
// page and its linked product pages. The listing contains alternate legacy
// paths, so products are deduplicated by their final URL slug.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = 'https://www.yara.us'
const PORTFOLIO_URL = `${ROOT}/crop-nutrition/fertilizer-products/`
const OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../worker/seeds/yara_us_fertilizer_catalog_2026-08-17.json',
)

const EXISTING_DETAILED_SLUGS = new Set([
  'yaraliva-tropicote',
  'yaramila-turf-royale-21-7-14',
])

const FAMILY_NAMES = new Map([
  ['yarabela', 'YaraBela'],
  ['yaraliva', 'YaraLiva'],
  ['yaramila', 'YaraMila'],
  ['yararega', 'YaraRega'],
  ['yaravera', 'YaraVera'],
  ['yaravita', 'YaraVita'],
  ['yaravita2', 'YaraVita'],
  ['yaravita3', 'YaraVita'],
  ['other-fertilizers', 'Yara'],
  ['other-fertilizers2', 'Yara'],
])

const NUTRIENT_NAMES = new Map([
  ['N', 'Total Nitrogen (N)'],
  ['P2O5', 'Available Phosphate (P2O5)'],
  ['K2O', 'Soluble Potash (K2O)'],
  ['CA', 'Calcium (Ca)'],
  ['MG', 'Magnesium (Mg)'],
  ['S', 'Sulfur (S)'],
  ['B', 'Boron (B)'],
  ['CU', 'Copper (Cu)'],
  ['FE', 'Iron (Fe)'],
  ['MN', 'Manganese (Mn)'],
  ['MO', 'Molybdenum (Mo)'],
  ['ZN', 'Zinc (Zn)'],
])

const decodeHtml = value => String(value ?? '')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&nbsp;|&#xa0;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&ndash;/gi, '-')
  .replace(/&reg;/gi, '')
  .replace(/&trade;/gi, '')

const textOnly = html => decodeHtml(String(html ?? '')
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<sub>([\s\S]*?)<\/sub>/gi, '$1')
  .replace(/<sup>([\s\S]*?)<\/sup>/gi, '$1')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim()

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'TurfIntel catalog builder (official manufacturer data)' },
  })
  if (!response.ok) throw new Error(`${response.status} from ${url}`)
  return response.text()
}

function listingProducts(html) {
  const found = new Map()
  const productPath = /((?:https?:\/\/[^/"']+)?\/crop-nutrition\/fertilizer-products\/([^/"']+)\/([^/?#"']+)\/?)/gi
  for (const match of html.matchAll(productPath)) {
    const [, href, family, slug] = match
    if (!FAMILY_NAMES.has(family) || EXISTING_DETAILED_SLUGS.has(slug)) continue
    const url = new URL(href, ROOT).href
    const score = /(?:yaravita|other-fertilizers)\//.test(`${family}/`) && !/\d$/.test(family) ? 2 : 1
    if (!found.has(slug) || score > found.get(slug).score) {
      found.set(slug, { family, slug, url, score })
    }
  }
  return [...found.values()].sort((a, b) => a.slug.localeCompare(b.slug))
}

function nutrientBlock(html) {
  const clean = textOnly(html)
  const start = clean.indexOf('Nutrients')
  if (start < 0) return ''
  const tail = clean.slice(start + 'Nutrients'.length)
  const stops = ['Product and safety information', 'Product label', 'Safety data sheet', 'Product data sheet']
    .map(label => tail.indexOf(label))
    .filter(index => index >= 0)
  return tail.slice(0, stops.length ? Math.min(...stops) : 600)
}

function nutrientsFrom(html) {
  const block = nutrientBlock(html)
  const nutrients = []
  const pattern = /\b(P2O5|K2O|Ca|Mg|Cu|Fe|Mn|Mo|Zn|N|S|B)\s*(\d+(?:\.\d+)?)\s*%/gi
  for (const match of block.matchAll(pattern)) {
    const key = match[1].toUpperCase()
    const name = NUTRIENT_NAMES.get(key)
    if (!name || nutrients.some(item => item.name === name)) continue
    nutrients.push({ name, percentage: Number(match[2]) })
  }
  return nutrients
}

function fertilizerAnalysis(nutrients) {
  const byName = new Map(nutrients.map(item => [item.name, item.percentage]))
  const n = byName.get('Total Nitrogen (N)') ?? 0
  const p = byName.get('Available Phosphate (P2O5)') ?? 0
  const k = byName.get('Soluble Potash (K2O)') ?? 0
  const details = nutrients.map(item => `${item.name} ${item.percentage}%`).join('; ')
  return `${n}-${p}-${k}${details ? `; ${details}` : ''}`
}

function firstMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return decodeHtml(html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)`, 'i'))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["']`, 'i'))?.[1]
    ?? '')
}

function pageTitle(html, fallback) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  return (textOnly(h1) || fallback.replace(/-/g, ' '))
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function formulationFrom(html) {
  return nutrientBlock(html).match(/\bForm:\s*([^;]+?)(?=\s+(?:Chloride Free|Product|$))/i)?.[1]?.trim()
    ?? textOnly(html).match(/\bForm:\s*(Liquid|Prilled|Granular|Powder|Solution|Suspension|Water Soluble Powder)\b/i)?.[1]
    ?? null
}

function officialLabelUrl(html, pageUrl) {
  const links = [...html.matchAll(/<a\b[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(match => ({ href: match[1], text: textOnly(match[2]) }))
  const preferred = links.find(link => /^(?:product|bag|bulk|50\s*lb|55\s*lb).*label$/i.test(link.text))
    ?? links.find(link => /\blabel\b/i.test(link.text))
  return preferred ? new URL(preferred.href, pageUrl).href : pageUrl
}

function turfAdvice(html) {
  const clean = textOnly(html)
  const matches = []
  for (const heading of clean.matchAll(/Amenity (?:Turf|Grass)/gi)) {
    const nearby = clean.slice(heading.index + heading[0].length, heading.index + heading[0].length + 800)
    const start = nearby.search(/\bTurf:\s*/i)
    if (start < 0 || start > 120) continue
    let advice = nearby.slice(start).replace(/^Turf:\s*/i, '')
    const nextCrop = advice.search(/\s(?:Alfalfa|Almond|Apples?|Apricot|Barley|Beans|Broccoli|Cabbage|Corn|Cotton|Grapes?|Potato(?:es)?|Soybeans?|Strawberr(?:y|ies)|Tomato(?:es)?|Wheat)\b/i)
    if (nextCrop >= 0) advice = advice.slice(0, nextCrop)
    advice = advice.trim()
    if (advice && !matches.includes(advice)) matches.push(advice)
  }
  return matches.slice(0, 2)
}

function turfRates(advice) {
  const rates = []
  for (const text of advice) {
    const match = text.match(/(\d+(?:\.\d+)?(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?)\s*(fl\.?\s*oz\.?|oz\.?|pints?|quarts?|lb)\s*(?:per|\/)\s*(1,?000\s*sq\.?\s*ft|acre)/i)
    if (!match) continue
    const rateUnit = match[2].replace(/\s+/g, ' ').replace(/\.$/, '')
    rates.push({
      rate: `${match[1]} ${rateUnit}`,
      unit: /acre/i.test(match[3]) ? `${rateUnit}/acre` : `${rateUnit}/1,000 sq ft`,
      interval: text,
    })
  }
  return rates
}

function buildProduct(entry, html) {
  const nutrients = nutrientsFrom(html)
  const advice = turfAdvice(html)
  const title = pageTitle(html, entry.slug)
  const description = firstMeta(html, 'description')
  const brand = FAMILY_NAMES.get(entry.family)

  return {
    product_name: title,
    brand_owner: brand,
    manufacturer: 'Yara North America, Inc.',
    epa_number: null,
    formulation: formulationFrom(html),
    category: 'fertilizer',
    frac_group: null,
    hrac_group: null,
    irac_group: null,
    pgr_class: null,
    chemical_class: brand === 'YaraVita' ? 'Foliar and micronutrient fertilizer' : 'Commercial fertilizer',
    active_ingredients: nutrients,
    fertilizer_analysis: fertilizerAnalysis(nutrients),
    rates: turfRates(advice),
    targets: nutrients.map(item => item.name.replace(/\s*\([^)]*\).*$/, '') + ' nutrition'),
    turf_sites: advice.length ? ['Amenity turf', 'Golf course turf', 'Sports turf'] : [],
    restricted_use: false,
    signal_word: null,
    rei_hours: null,
    phi_hours: null,
    label_url: officialLabelUrl(html, entry.url),
    notes: [
      description,
      advice.length ? `Official turf directions: ${advice.join(' ')}` : null,
      `Official product page: ${entry.url}.`,
      'Use only according to the current product label and an appropriate nutrient-management recommendation.',
    ].filter(Boolean).join(' '),
    status: 'active',
  }
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length)
  let cursor = 0
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++
      results[index] = await mapper(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return results
}

async function main() {
  const listingHtml = await fetchText(PORTFOLIO_URL)
  const entries = listingProducts(listingHtml)
  if (entries.length < 45) throw new Error(`Expected at least 45 Yara products, found ${entries.length}`)

  const fetchedProducts = await mapWithConcurrency(entries, 6, async entry => {
    const html = await fetchText(entry.url)
    return buildProduct(entry, html)
  })
  const products = [...new Map(fetchedProducts.map(product => [product.product_name, product])).values()]

  const emptyNutrients = products.filter(product => product.active_ingredients.length === 0)
  const seed = {
    version: 'yara-us-fertilizer-portfolio-2026-08-17',
    generatedAt: new Date().toISOString(),
    source: 'Yara United States official fertilizer portfolio, product pages, labels, and application advice',
    notes: 'Current products listed in Yara\'s U.S. fertilizer portfolio. Alternate legacy URLs are deduplicated. Existing hand-verified Turf Royale and Tropicote seeds remain authoritative and are intentionally excluded.',
    products,
  }
  await fs.writeFile(OUTPUT, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    output: OUTPUT,
    products: products.length,
    withNutrients: products.length - emptyNutrients.length,
    withoutPublishedNutrients: emptyNutrients.map(product => product.product_name),
  }, null, 2))
}

main().catch(error => {
  console.error(error.stack || error.message)
  process.exit(1)
})
