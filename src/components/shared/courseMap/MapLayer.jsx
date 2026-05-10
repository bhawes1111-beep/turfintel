/**
 * MapLayer — converts a GeoJSON FeatureCollection into SVG primitives using
 * a projector + style spec from featureRegistry.
 *
 * Geometry support (Phase 1):
 *   - Polygon    → <path d="M ... Z">  (outer ring only; holes ignored for now)
 *   - LineString → <path d="M ... L">
 *   - Point      → <circle>
 *
 * Future (Phase 2+):
 *   - MultiPolygon, MultiLineString, MultiPoint
 *   - Holes (inner rings)
 *   - GeometryCollection
 */

import { isRenderableFeature, normalizeFeatureProperties } from '../../../utils/geo/geo'

function polygonPath(rings, project) {
  if (!rings || rings.length === 0) return ''
  // Use only the outer ring for Phase 1.
  const outer = rings[0]
  return outer
    .map(([lng, lat], i) => {
      const { x, y } = project({ lat, lng })
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ') + ' Z'
}

function lineStringPath(coords, project) {
  if (!coords || coords.length === 0) return ''
  return coords
    .map(([lng, lat], i) => {
      const { x, y } = project({ lat, lng })
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export default function MapLayer({
  layerKey,
  spec,
  featureCollection,
  project,
  onFeatureClick,
}) {
  const features = featureCollection?.features ?? []
  if (features.length === 0) return null

  const filterId = spec.glow ? `glow-${layerKey}` : null
  const groupStyle = { opacity: spec.opacity ?? 1 }

  return (
    <g
      data-layer={layerKey}
      style={groupStyle}
      filter={filterId ? `url(#${filterId})` : undefined}
    >
      {filterId && (
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}

      {features.filter(isRenderableFeature).map(f => {
        const props = normalizeFeatureProperties(f.properties)
        const common = {
          fill:             spec.fill,
          stroke:           spec.stroke,
          strokeWidth:      spec.strokeWidth,
          strokeDasharray:  spec.strokeDash,
          vectorEffect:     'non-scaling-stroke',
          onClick:          onFeatureClick ? () => onFeatureClick(f, layerKey) : undefined,
          style:            { cursor: onFeatureClick ? 'pointer' : 'default' },
        }

        const t = f.geometry.type

        if (t === 'Polygon') {
          return (
            <path
              key={props.id}
              data-feature-id={props.id}
              d={polygonPath(f.geometry.coordinates, project)}
              {...common}
            />
          )
        }

        if (t === 'LineString') {
          return (
            <path
              key={props.id}
              data-feature-id={props.id}
              d={lineStringPath(f.geometry.coordinates, project)}
              {...common}
              fill="none"
            />
          )
        }

        if (t === 'Point') {
          const [lng, lat] = f.geometry.coordinates
          const { x, y }   = project({ lat, lng })
          return (
            <circle
              key={props.id}
              data-feature-id={props.id}
              cx={x.toFixed(2)}
              cy={y.toFixed(2)}
              r={spec.pointRadius ?? 4}
              {...common}
            />
          )
        }

        return null
      })}
    </g>
  )
}
