import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

export default function SprayOverview() {
  return (
    <ModuleOverview>
      <StatCard label="Apps This Month"  value="8"    sub="Completed" />
      <StatCard label="Planned This Week"value="3"    color="#5ba8a0" sub="Upcoming" />
      <StatCard label="Acres Treated"    value="42"   sub="Month to date" />
      <StatCard label="Today's Window"   value="Marginal" color="#d4a43a" sub="Wind 8 mph SSW" />

      <InfoCard title="Upcoming Applications" rows={[
        { label: 'May 8  — Greens Biostimulant',   value: <Badge variant="blue">Planned</Badge> },
        { label: 'May 9  — Foliar Feed Greens',    value: <Badge variant="blue">Planned</Badge> },
        { label: 'May 19 — Rough Herbicide',       value: <Badge variant="blue">Planned</Badge> },
        { label: 'May 26 — Collar Pre-emergent',   value: <Badge variant="blue">Planned</Badge> },
      ]} />

      <InfoCard title="Recent Summary" rows={[
        { label: 'Last Application',    value: 'May 3 — Fairway Fungicide' },
        { label: 'Last Spray Tech',     value: 'Miguel S.' },
        { label: 'Products Used (May)', value: '6 products' },
        { label: 'Total Volume (May)',  value: '218 gal' },
        { label: 'Avg Wind at Spray',   value: '5.2 mph' },
      ]} />
    </ModuleOverview>
  )
}
