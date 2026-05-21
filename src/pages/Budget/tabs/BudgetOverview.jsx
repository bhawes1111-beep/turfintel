// Budget Overview — honest empty state.
//
// Budget tracking is not yet persistence-backed (no budget store/table).
// Rather than show fabricated spend figures, this states what will appear
// here once expense records are connected.

import { EmptyState } from '../../../components/shared/EmptyState'

export default function BudgetOverview() {
  return (
    <EmptyState
      icon="💵"
      title="No budget data yet"
      description="Once expense and budget records are connected, this overview will summarize YTD spend, monthly budget vs. actual, category breakdown, and projected year-end. No figures are shown until real records exist."
    />
  )
}
