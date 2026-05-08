import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

export default function PlantNutritionOverview() {
  return (
    <ModuleOverview>
      <StatCard label="Soil pH"            value="6.4"      sub="Target: 6.0 – 6.8" color="#4ecb4e" />
      <StatCard label="Nitrogen Index"     value="Adequate" sub="No deficiency noted" color="#4ecb4e" />
      <StatCard label="Pending Recs"       value="2"        color="#d4a43a" sub="Awaiting action" />
      <StatCard label="Last Soil Test"     value="Mar 15"   sub="Next due: June" />

      <InfoCard title="Open Recommendations" rows={[
        { label: 'Increase K on fairways (low K index)',  value: <Badge variant="yellow">Pending</Badge> },
        { label: 'Foliar Mn — greens showing pale tips',  value: <Badge variant="yellow">Pending</Badge> },
        { label: 'pH adjustment — tee boxes slightly high',value: <Badge variant="green">Resolved</Badge> },
      ]} />

      <InfoCard title="Recent & Upcoming" rows={[
        { label: 'Last Foliar Feed',      value: 'May 1 — Greens (N+K)' },
        { label: 'Next Scheduled',        value: 'May 9 — Foliar Feed Greens' },
        { label: 'Soil Sample Collection',value: 'May 22' },
        { label: 'Last Water Report',     value: 'April 28' },
        { label: 'Tissue Report Status',  value: 'Awaiting results' },
      ]} />
    </ModuleOverview>
  )
}
