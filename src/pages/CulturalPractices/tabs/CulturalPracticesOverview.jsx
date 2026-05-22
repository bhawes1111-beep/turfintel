// Cultural Practices Overview — real, D1-backed.
//
// Composes the live cultural_practices records into recent completed,
// upcoming planned, and recovery-watch views. Recovery state is user-set
// (explainable, never predicted). Honest empty state — no fabricated work.

import { useMemo } from 'react'
import { useCulturalPractices } from '../../../utils/culturalPractices/culturalPracticesStore'
import {
  categorizePractices,
  effectiveRecovery,
  RECOVERY_LABEL,
} from '../../../utils/culturalPractices/recoveryState'
import { EmptyState } from '../../../components/shared/EmptyState'
import { ModuleOverview, StatCard, InfoCard } from '../../../components/shared/ModuleOverview'

const titleCase = s => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ') : '')
const fmtDate = iso => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')

export default function CulturalPracticesOverview() {
  const { practices } = useCulturalPractices()
  const { recentCompleted, upcoming, watch } = useMemo(() => categorizePractices(practices), [practices])

  if ((practices ?? []).length === 0) {
    return (
      <EmptyState
        icon="🌾"
        title="No cultural practice records yet"
        description="Log aerification, topdressing, verticutting, rolling, sand, and other practices in the Practices tab. This overview will then show recent work, upcoming planned practices, recovery watch items, and playability impacts — from real records only."
      />
    )
  }

  return (
    <ModuleOverview>
      <StatCard label="Recent Completed" value={recentCompleted.length} sub="Logged practices" />
      <StatCard label="Upcoming"         value={upcoming.length} color={upcoming.length > 0 ? '#7dd3fc' : undefined} sub="Planned" />
      <StatCard label="Recovery Watch"   value={watch.length} color={watch.length > 0 ? '#fbbf24' : undefined} sub="Recovering / needs attention" />

      <InfoCard title="Recovery Watch">
        {watch.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>Nothing recovering or needing attention.</p>
        ) : (
          <div>
            {watch.slice(0, 5).map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>{titleCase(p.practiceType)}{p.targetArea ? ` — ${p.targetArea}` : ''}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{RECOVERY_LABEL[effectiveRecovery(p)] ?? ''}</span>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      <InfoCard title="Upcoming Practices">
        {upcoming.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>No planned practices scheduled.</p>
        ) : (
          <div>
            {upcoming.slice(0, 5).map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>{fmtDate(p.practiceDate)} — {titleCase(p.practiceType)}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{p.targetArea ?? ''}</span>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      <InfoCard title="Recent Completed">
        {recentCompleted.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>No completed practices yet.</p>
        ) : (
          <div>
            {recentCompleted.slice(0, 5).map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>{fmtDate(p.practiceDate)} — {titleCase(p.practiceType)}</span>
                {p.playabilityImpact && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>⛳</span>}
              </div>
            ))}
          </div>
        )}
      </InfoCard>
    </ModuleOverview>
  )
}
