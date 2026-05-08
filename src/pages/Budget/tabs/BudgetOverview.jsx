import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

export default function BudgetOverview() {
  return (
    <ModuleOverview>
      <StatCard label="YTD Spend"       value="$47,320" sub="Jan – May 7" />
      <StatCard label="Monthly Budget"  value="$12,000" sub="May allocation" />
      <StatCard label="May Spend"       value="$8,450"  color="#4ecb4e" sub="70% of budget used" />
      <StatCard label="Remaining"       value="$3,550"  color="#4ecb4e" sub="Est. 24 days left" />

      <InfoCard title="May Expense Breakdown" rows={[
        { label: 'Labor',            value: '$3,200' },
        { label: 'Chemicals',        value: '$2,150' },
        { label: 'Equipment / Fuel', value: '$1,800' },
        { label: 'Materials',        value: '$900' },
        { label: 'Miscellaneous',    value: '$400' },
      ]} />

      <InfoCard title="Budget Health" rows={[
        { label: 'YTD vs. Prior Year',    value: <Badge variant="green">–4.2% Under</Badge> },
        { label: 'Projected Year-End',    value: '$142,000' },
        { label: 'Annual Budget',         value: '$148,000' },
        { label: 'Largest May Expense',   value: 'Labor ($3,200)' },
        { label: 'Next Budget Review',    value: 'May 28' },
      ]} />
    </ModuleOverview>
  )
}
