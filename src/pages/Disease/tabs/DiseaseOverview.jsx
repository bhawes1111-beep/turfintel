import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

export default function DiseaseOverview() {
  return (
    <ModuleOverview>
      <StatCard label="Active Issues"     value="3"    color="#e05050" sub="Requires attention" />
      <StatCard label="Critical Alerts"   value="1"    color="#e05050" sub="Dollar Spot" />
      <StatCard label="Disease Pressure"  value="High" color="#d4a43a" sub="Conditions favorable" />
      <StatCard label="Last Scouting"     value="Today" color="#4ecb4e" sub="May 7" />

      <InfoCard title="Active Issues" rows={[
        { label: 'Dollar Spot — Fairways 7, 12, 15', value: <Badge variant="red">Critical</Badge> },
        { label: 'Pythium Risk — High humidity zone', value: <Badge variant="yellow">High</Badge> },
        { label: 'Anthracnose — Collar area watch',  value: <Badge variant="yellow">Monitoring</Badge> },
      ]} />

      <InfoCard title="Conditions & Treatment" rows={[
        { label: 'Consecutive Favorable Days', value: '6 days' },
        { label: 'Curative Window Opens',      value: 'Tomorrow (May 8)' },
        { label: 'Preventive Applied',         value: 'May 3 — Daconil' },
        { label: 'Areas Affected',             value: 'Fairways 7, 12, 15' },
        { label: 'Treatment Status',           value: 'Pending application' },
      ]} />
    </ModuleOverview>
  )
}
