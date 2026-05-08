import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

export default function InventoryOverview() {
  return (
    <ModuleOverview>
      <StatCard label="Total SKUs"      value="127" sub="Across all categories" />
      <StatCard label="Low Stock"       value="8"   color="#d4a43a" sub="Below reorder point" />
      <StatCard label="Critical"        value="2"   color="#e05050" sub="Immediate reorder" />
      <StatCard label="Pending Orders"  value="3"   color="#5ba8a0" sub="Awaiting delivery" />

      <InfoCard title="Critical & Low Stock" rows={[
        { label: 'Daconil Ultrex (Chemical)',   value: <Badge variant="red">Critical</Badge> },
        { label: '2-Cycle Engine Oil (Fuel)',   value: <Badge variant="red">Critical</Badge> },
        { label: 'Primo Maxx (Chemical)',        value: <Badge variant="yellow">Low</Badge> },
        { label: 'Barricade 65WG (Chemical)',   value: <Badge variant="yellow">Low</Badge> },
        { label: 'Hydraulic Fluid (Parts)',     value: <Badge variant="yellow">Low</Badge> },
      ]} />

      <InfoCard title="Inventory Summary" rows={[
        { label: 'Chemicals on Hand',   value: '24 products' },
        { label: 'Fertilizer Stock',    value: '8 products' },
        { label: 'Parts & Supplies',    value: '61 SKUs' },
        { label: 'Fuel on Hand',        value: '~340 gal diesel' },
        { label: 'Last Purchase',       value: 'May 4 — Fert. & Parts' },
      ]} />
    </ModuleOverview>
  )
}
