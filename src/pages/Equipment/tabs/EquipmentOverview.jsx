import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

export default function EquipmentOverview() {
  return (
    <ModuleOverview>
      <StatCard label="Total Units"      value="18" sub="Full fleet" />
      <StatCard label="Operational"      value="15" color="#4ecb4e" sub="Ready to run" />
      <StatCard label="In Service"       value="2"  color="#5ba8a0" sub="Scheduled maintenance" />
      <StatCard label="Maintenance Due"  value="3"  color="#d4a43a" sub="Within 2 weeks" />

      <InfoCard title="Service Schedule" rows={[
        { label: 'May 14 — Irrigation Audit',         value: <Badge variant="blue">Planned</Badge> },
        { label: 'May 29 — Pump Station Inspection',  value: <Badge variant="blue">Planned</Badge> },
        { label: 'Reel Mower A — 50hr service due',   value: <Badge variant="yellow">Due Soon</Badge> },
        { label: 'Utility Cart #3 — brake check',     value: <Badge variant="yellow">Due Soon</Badge> },
        { label: 'Fairway Mower #2 — repair',         value: <Badge variant="red">Down</Badge> },
      ]} />

      <InfoCard title="Fleet Summary" rows={[
        { label: 'Greens Mowers',      value: '3 units — all operational' },
        { label: 'Fairway Mowers',     value: '4 units — 1 down' },
        { label: 'Utility / Transport',value: '6 units — all operational' },
        { label: 'Spray Equipment',    value: '2 units — all operational' },
        { label: 'Last Fleet Service', value: 'May 6 — Mower fleet service' },
      ]} />
    </ModuleOverview>
  )
}
