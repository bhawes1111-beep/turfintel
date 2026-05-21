// Plant Nutrition Overview — honest empty state.
//
// The Plant Nutrition tabs read schema-documented arrays in
// data/plantNutrition.js that are intentionally EMPTY until live records
// are imported (not yet D1-backed). This overview reflects that truth: it
// counts whatever real records exist (currently none) and describes what
// will appear here once soil/tissue/water reports and programs are added —
// rather than the previous fabricated pH/index figures.

import { useMemo } from 'react'
import {
  SOIL_REPORTS,
  TISSUE_REPORTS,
  WATER_REPORTS,
  RECOMMENDATIONS,
} from '../../../data/plantNutrition'
import { EmptyState } from '../../../components/shared/EmptyState'
import { ModuleOverview, StatCard, InfoCard } from '../../../components/shared/ModuleOverview'

export default function PlantNutritionOverview() {
  const counts = useMemo(() => ({
    soil:   SOIL_REPORTS.length,
    tissue: TISSUE_REPORTS.length,
    water:  WATER_REPORTS.length,
    recs:   RECOMMENDATIONS.length,
  }), [])

  const hasAny = counts.soil + counts.tissue + counts.water + counts.recs > 0

  if (!hasAny) {
    return (
      <EmptyState
        icon="🌱"
        title="No nutrition records yet"
        description="Once soil, tissue, and water reports are imported, this overview will show active programs, recent nutrients applied, nitrogen totals, open recommendations, and upcoming applications. Import lab reports from the Upload Center to begin."
      />
    )
  }

  return (
    <ModuleOverview>
      <StatCard label="Soil Reports"   value={counts.soil} sub="On file" />
      <StatCard label="Tissue Reports" value={counts.tissue} sub="On file" />
      <StatCard label="Water Reports"  value={counts.water} sub="On file" />
      <StatCard label="Open Recs"      value={counts.recs} color={counts.recs > 0 ? '#d4a43a' : undefined} sub="Recommendations" />
      <InfoCard title="Programs & applications" rows={[
        { label: 'Recent nutrients applied', value: 'See Recommendations tab' },
        { label: 'Lab reports',              value: 'Soil / Tissue / Water tabs' },
      ]} />
    </ModuleOverview>
  )
}
