// Cultural Practices Overview — honest empty state.
//
// The Cultural Practices tabs read schema-documented arrays in
// data/culturalPractices.js that are intentionally EMPTY until live records
// are logged (not yet D1-backed). This overview counts whatever real events
// exist (currently none) and describes what will appear once aerification /
// topdressing / verticutting work is recorded — replacing the previous
// fabricated dates and work-order counts.

import { useMemo } from 'react'
import {
  AERIFICATION_EVENTS,
  TOPDRESS_EVENTS,
  VERTICUT_EVENTS,
  CALENDAR_EVENTS,
} from '../../../data/culturalPractices'
import { EmptyState } from '../../../components/shared/EmptyState'
import { ModuleOverview, StatCard, InfoCard } from '../../../components/shared/ModuleOverview'

export default function CulturalPracticesOverview() {
  const counts = useMemo(() => ({
    aer:      AERIFICATION_EVENTS.length,
    topdress: TOPDRESS_EVENTS.length,
    verticut: VERTICUT_EVENTS.length,
    upcoming: CALENDAR_EVENTS.length,
  }), [])

  const hasAny = counts.aer + counts.topdress + counts.verticut + counts.upcoming > 0

  if (!hasAny) {
    return (
      <EmptyState
        icon="🌾"
        title="No cultural practice records yet"
        description="Once aerification, topdressing, verticutting, rolling, and mowing work is logged, this overview will show upcoming practices, recent work, and recovery notes. Record events in the practice tabs to begin."
      />
    )
  }

  return (
    <ModuleOverview>
      <StatCard label="Aerification" value={counts.aer} sub="Events logged" />
      <StatCard label="Topdressing"  value={counts.topdress} sub="Events logged" />
      <StatCard label="Verticutting" value={counts.verticut} sub="Events logged" />
      <StatCard label="Upcoming"     value={counts.upcoming} color={counts.upcoming > 0 ? '#5ba8a0' : undefined} sub="On the calendar" />
      <InfoCard title="Where the detail lives" rows={[
        { label: 'Recent work & recovery', value: 'Per-practice tabs' },
        { label: 'Scheduled practices',    value: 'Practice Calendar tab' },
      ]} />
    </ModuleOverview>
  )
}
