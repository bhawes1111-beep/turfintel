import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import {
  GREEN_MAP_LOGICAL_SIZE,
  GREEN_MAP_TILE_SIZE,
  buildGreenProjection,
  compareGreenNames,
  greenAerialFilename,
} from '../src/utils/moisture/greenMaps.js'

const SOURCE_URL = 'https://coast.noaa.gov/arcgis/rest/services/Imagery/4Band_RGBN_8Bit_Imagery/ImageServer/exportImage'
const SOURCE_MOSAIC_RULE = {
  where: "dataset_id = '2622' AND Resolution = 0.15",
  mosaicMethod: 'esriMosaicNorthwest',
}
const OUTPUT_SIZE = 1600
const WEB_MERCATOR_HALF_WORLD_METERS = 20037508.342789244
const outputDirectory = new URL('../public/data/green-aerial/', import.meta.url)
const boundaryFile = new URL('../public/data/crosswinds-greens.geojson', import.meta.url)

function webMercatorCenter(lat, lng) {
  const latitudeRadians = lat * Math.PI / 180
  return {
    x: lng * WEB_MERCATOR_HALF_WORLD_METERS / 180,
    y: WEB_MERCATOR_HALF_WORLD_METERS
      * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))
      / Math.PI,
  }
}

function imageryBounds(project) {
  const center = webMercatorCenter(project.center.lat, project.center.lng)
  const worldWidth = WEB_MERCATOR_HALF_WORLD_METERS * 2
  const viewportWidth = (worldWidth / (2 ** project.zoom)) * (GREEN_MAP_LOGICAL_SIZE / GREEN_MAP_TILE_SIZE)
  const halfViewport = viewportWidth / 2
  return [
    center.x - halfViewport,
    center.y - halfViewport,
    center.x + halfViewport,
    center.y + halfViewport,
  ]
}

async function fetchAerial(feature) {
  const name = feature.properties?.name
  const ring = feature.geometry?.coordinates?.[0] ?? []
  const project = buildGreenProjection(ring)
  if (!name || !project) throw new Error('Every green needs a name and polygon')

  const source = new URL(SOURCE_URL)
  source.searchParams.set('bbox', imageryBounds(project).join(','))
  source.searchParams.set('bboxSR', '3857')
  source.searchParams.set('imageSR', '3857')
  source.searchParams.set('size', `${OUTPUT_SIZE},${OUTPUT_SIZE}`)
  source.searchParams.set('format', 'jpg')
  source.searchParams.set('compressionQuality', '100')
  source.searchParams.set('interpolation', 'RSP_BilinearInterpolation')
  source.searchParams.set('mosaicRule', JSON.stringify(SOURCE_MOSAIC_RULE))
  source.searchParams.set('f', 'image')

  let response
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      response = await fetch(source, {
        headers: { Accept: 'image/jpeg,image/*;q=0.8' },
        signal: AbortSignal.timeout(30000),
      })
      if (response.ok && response.headers.get('Content-Type')?.toLowerCase().startsWith('image/')) break
    } catch (error) {
      if (attempt === 5) throw error
    }
    if (attempt < 5) await new Promise(resolve => setTimeout(resolve, attempt * 2000))
  }

  if (!response?.ok || !response.headers.get('Content-Type')?.toLowerCase().startsWith('image/')) {
    throw new Error(`NOAA imagery failed for ${name}: ${response?.status ?? 'network error'}`)
  }

  const filename = greenAerialFilename(name)
  const sourceBytes = Buffer.from(await response.arrayBuffer())
  const bytes = await sharp(sourceBytes)
    .sharpen({ sigma: .8, m1: .8, m2: 1.5 })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4', progressive: true })
    .toBuffer()
  await writeFile(new URL(filename, outputDirectory), bytes)
  return {
    name,
    file: filename,
    center: project.center,
    zoom: project.zoom,
    bytes: bytes.byteLength,
  }
}

const boundaries = JSON.parse(await readFile(boundaryFile, 'utf8'))
const features = [...(boundaries.features ?? [])]
  .filter(feature => feature.properties?.name && feature.geometry?.coordinates?.[0]?.length)
  .sort((left, right) => compareGreenNames(left.properties.name, right.properties.name))

await mkdir(outputDirectory, { recursive: true })
const queue = [...features]
const images = []
await Promise.all(Array.from({ length: 1 }, async () => {
  while (queue.length) {
    const feature = queue.shift()
    const image = await fetchAerial(feature)
    images.push(image)
    process.stdout.write(`Saved ${image.name} (${Math.round(image.bytes / 1024)} KB)\n`)
  }
}))

images.sort((left, right) => compareGreenNames(left.name, right.name))
await writeFile(new URL('manifest.json', outputDirectory), `${JSON.stringify({
  source: '2012-2013 Coastal Georgia 6-inch orthophotography via NOAA Digital Coast',
  sourceUrl: SOURCE_URL,
  imageSize: OUTPUT_SIZE,
  logicalViewportSize: GREEN_MAP_LOGICAL_SIZE,
  images,
}, null, 2)}\n`)

const totalBytes = images.reduce((sum, image) => sum + image.bytes, 0)
console.log(`Saved ${images.length} static green aerials (${(totalBytes / 1024 / 1024).toFixed(2)} MB total).`)
