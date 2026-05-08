import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

export default function CulturalPracticesOverview() {
  return (
    <ModuleOverview>
      <StatCard label="Next Aerification" value="May 13"  sub="Greens — 6 days away" color="#5ba8a0" />
      <StatCard label="Mowing Height"     value='0.125"'  sub="Greens — current setting" />
      <StatCard label="Last Topdressing"  value="Apr 20"  sub="17 days ago" />
      <StatCard label="Open Work Orders"  value="4"       color="#d4a43a" sub="Pending scheduling" />

      <InfoCard title="Upcoming Practices" rows={[
        { label: 'May 13 — Aerification (Greens)',    value: <Badge variant="blue">Planned</Badge> },
        { label: 'May 20 — Topdressing',              value: <Badge variant="blue">Planned</Badge> },
        { label: 'May 27 — Verticutting (Fairways)',  value: <Badge variant="blue">Planned</Badge> },
        { label: 'Rolling',                           value: <Badge variant="green">Biweekly</Badge> },
      ]} />

      <InfoCard title="Current Programs" rows={[
        { label: 'Mowing Frequency',       value: 'Daily (Mon – Sat)' },
        { label: 'Rolling Frequency',      value: 'Tues / Fri' },
        { label: 'Topdressing Interval',   value: 'Every 4 weeks' },
        { label: 'Aerification — Greens',  value: '2× per year' },
        { label: 'Aerification — Fairways',value: '1× per year (fall)' },
      ]} />
    </ModuleOverview>
  )
}
