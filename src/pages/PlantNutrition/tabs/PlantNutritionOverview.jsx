// Plant Nutrition Overview — real seasonal nutrition picture.
//
// Composes the same explainable totals as the Applications tab: standalone
// nutrition records merged with fertilizer-spray-derived nutrients (live,
// deduped). Shows seasonal N-P-K, recent applications, nitrogen-source
// breakdown, and lab-report counts. Honest empty state — no fabricated
// fertility figures. Real persisted data only.

import { useMemo } from 'react'
import { useNutritionData } from '../../../utils/nutrition/nutritionStore'
import { useSpraysData } from '../../../utils/sprays/spraysStore'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { computeNutritionTotals } from '../../../utils/nutrition/nutritionTotals'
import {
  SOIL_REPORTS, TISSUE_REPORTS, WATER_REPORTS,
} from '../../../data/plantNutrition'
import { EmptyState } from '../../../components/shared/EmptyState'
import { ModuleOverview, StatCard, InfoCard } from '../../../components/shared/ModuleOverview'

const todayIso = () => new Date().toISOString().slice(0, 10)
const seasonStart = () => `${new Date().getFullYear()}-01-01`

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function PlantNutritionOverview() {
  const { applications: standalone } = useNutritionData()
  const { records: sprays } = useSpraysData()
  const { items: inventory } = useInventoryData()

  const inventoryById = useMemo(() => {
    const m = {}; for (const i of inventory ?? []) m[i.id] = i; return m
  }, [inventory])

  const result = useMemo(
    () => computeNutritionTotals({ standalone, sprays, inventoryById, from: seasonStart(), to: todayIso() }),
    [standalone, sprays, inventoryById],
  )

  // Nitrogen-source breakdown — from inventory nitrogen_source on contributing
  // products (real field; only shown when present).
  const nSources = useMemo(() => {
    const counts = {}
    for (const a of result.applications) {
      const inv = a.productId ? inventoryById[a.productId] : null
      const src = inv?.nitrogenSource
      if (src && a.nLb > 0) counts[src] = (counts[src] ?? 0) + a.nLb
    }
    return Object.entries(counts).sort((x, y) => y[1] - x[1])
  }, [result.applications, inventoryById])

  const labCounts = {
    soil: SOIL_REPORTS.length, tissue: TISSUE_REPORTS.length, water: WATER_REPORTS.length,
  }
  const hasLabs = labCounts.soil + labCounts.tissue + labCounts.water > 0

  if (!result.hasData && !hasLabs) {
    return (
      <EmptyState
        icon="🌱"
        title="No nutrition data yet this season"
        description="Seasonal N-P-K totals and recent applications appear here as you log nutrient applications (Applications tab) or apply fertilizer via Spray Records. Lab reports import from the Upload Center. No figures are shown until real records exist."
      />
    )
  }

  return (
    <ModuleOverview>
      <StatCard label="Season N"  value={`${result.totals.n} lb`} sub="Total nitrogen applied" color="#4ade80" />
      <StatCard label="Season P"  value={`${result.totals.p} lb`} sub="Total phosphorus" />
      <StatCard label="Season K"  value={`${result.totals.k} lb`} sub="Total potassium" />
      <StatCard label="Applications" value={result.applications.length} sub="This season" />

      <InfoCard title="Recent Applications">
        {result.applications.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>
            No nutrient applications yet — log one in the Applications tab or apply fertilizer via Spray Records.
          </p>
        ) : (
          <div>
            {result.applications.slice(0, 5).map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>{fmtDate(a.date)} — {a.productName}{a.source === 'spray' ? ' (spray)' : ''}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{a.nLb} N</span>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      {nSources.length > 0 && (
        <InfoCard title="Nitrogen Source Breakdown" rows={nSources.map(([src, lb]) => ({
          label: src, value: `${parseFloat(lb.toFixed(1))} lb N`,
        }))} />
      )}

      <InfoCard title="Lab Reports" rows={[
        { label: 'Soil',   value: labCounts.soil ? `${labCounts.soil} on file` : 'none yet' },
        { label: 'Tissue', value: labCounts.tissue ? `${labCounts.tissue} on file` : 'none yet' },
        { label: 'Water',  value: labCounts.water ? `${labCounts.water} on file` : 'none yet' },
      ]} />

      {result.unknowns.length > 0 && (
        <InfoCard title="Not totaled" rows={[
          { label: `${result.unknowns.length} application(s)`, value: 'missing analysis/rate/acreage' },
        ]} />
      )}
    </ModuleOverview>
  )
}
