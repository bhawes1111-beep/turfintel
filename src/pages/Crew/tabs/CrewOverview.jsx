import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

export default function CrewOverview() {
  return (
    <ModuleOverview>
      <StatCard label="Total Crew"      value="5"  sub="Active employees" />
      <StatCard label="Available Today" value="3"  color="#4ecb4e" sub="On site now" />
      <StatCard label="Off Today"       value="1"  sub="PTO / Sick" />
      <StatCard label="Open Tasks"      value="7"  color="#d4a43a" sub="2 overdue" />

      <InfoCard title="Crew Status Today" rows={[
        { label: 'Carlos M. — Equipment Operator', value: <Badge variant="green">Available</Badge> },
        { label: 'Juan R. — Grounds Crew',          value: <Badge variant="yellow">In at 10:00 AM</Badge> },
        { label: 'Miguel S. — Spray Tech',          value: <Badge variant="green">Available</Badge> },
        { label: 'Derek L. — Crew Lead',            value: <Badge variant="red">Off Today</Badge> },
        { label: 'James T. — Grounds Crew',         value: <Badge variant="green">Available</Badge> },
      ]} />

      <InfoCard title="This Week Summary" rows={[
        { label: 'Hours Logged',        value: '187 hrs' },
        { label: 'Overtime',            value: '12 hrs' },
        { label: 'Tasks Completed',     value: '14 / 21' },
        { label: 'Overdue Tasks',       value: '2' },
        { label: 'Next Scheduled Event',value: 'Safety Briefing — May 15' },
      ]} />
    </ModuleOverview>
  )
}
