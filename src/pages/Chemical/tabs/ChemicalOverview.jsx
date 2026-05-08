import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

export default function ChemicalOverview() {
  return (
    <ModuleOverview>
      <StatCard label="Total Products"     value="24" sub="In chemical library" />
      <StatCard label="Low Stock Alerts"   value="3"  color="#d4a43a" sub="Reorder needed" />
      <StatCard label="Apps This Month"    value="12" sub="Completed applications" />
      <StatCard label="REI Violations"     value="0"  color="#4ecb4e" sub="All entries clear" />

      <InfoCard title="Low Stock Items" rows={[
        { label: 'Daconil Ultrex',     value: <Badge variant="red">Critical</Badge> },
        { label: 'Primo Maxx',         value: <Badge variant="yellow">Low</Badge> },
        { label: 'Barricade 65WG',     value: <Badge variant="yellow">Low</Badge> },
      ]} />

      <InfoCard title="Recent Activity" rows={[
        { label: 'Last Application',   value: 'May 3 — Fairway Fungicide' },
        { label: 'Next Scheduled',     value: 'May 8 — Greens Biostimulant' },
        { label: 'Days Since Last App',value: '4 days' },
        { label: 'Products in Use',    value: '6 this month' },
        { label: 'Restricted Use',     value: '3 products on file' },
      ]} />
    </ModuleOverview>
  )
}
