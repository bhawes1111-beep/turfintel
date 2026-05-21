// Disease Overview — honest empty state.
//
// Disease tracking is not yet persistence-backed (no disease store/table).
// Rather than show fabricated outbreaks, this states plainly what will
// appear here once disease scouting/records are wired to D1. Weather-driven
// disease *pressure* already surfaces on the Dashboard intelligence cards.

import { EmptyState } from '../../../components/shared/EmptyState'

export default function DiseaseOverview() {
  return (
    <EmptyState
      icon="🔬"
      title="No disease records yet"
      description="Once disease scouting and treatment tracking are connected, this overview will summarize active issues, disease pressure, affected areas, and curative/preventive windows. Live weather-driven disease pressure already appears on the Dashboard."
    />
  )
}
