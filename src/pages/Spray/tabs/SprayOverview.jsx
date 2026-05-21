// Spray Overview — live section command center.
//
// Answers "what matters in sprays today?" from real persisted spray records
// (useSpraysData). No fabricated figures: every number is computed from the
// store, and the panel degrades to honest empty states when there are none.

import { useMemo } from 'react'
import { useSpraysData } from '../../../utils/sprays/spraysStore'
import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

const todayIso = () => new Date().toISOString().slice(0, 10)

function monthKey(d) { return typeof d === 'string' ? d.slice(0, 7) : '' }

export default function SprayOverview() {
  const { records: sprays = [], loading } = useSpraysData()

  const o = useMemo(() => {
    const today = todayIso()
    const thisMonth = today.slice(0, 7)
    const live = sprays.filter(s => s.status !== 'deleted')

    const planned = live
      .filter(s => s.status === 'planned' && (s.date ?? '') >= today)
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    const completed = live
      .filter(s => s.status === 'completed')
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    const completedThisMonth = completed.filter(s => monthKey(s.date) === thisMonth)

    const productNames = new Set()
    for (const s of live) for (const p of s.products ?? []) if (p?.name) productNames.add(p.name)

    return { planned, completed, completedThisMonth, distinctProducts: productNames.size, total: live.length }
  }, [sprays])

  if (loading && sprays.length === 0) {
    return <ModuleOverview><InfoCard title="Loading sprays…" rows={[]} /></ModuleOverview>
  }

  return (
    <ModuleOverview>
      <StatCard label="Planned"           value={o.planned.length} color="#5ba8a0" sub="Upcoming applications" />
      <StatCard label="Completed (Month)" value={o.completedThisMonth.length} sub="This calendar month" />
      <StatCard label="Total Records"     value={o.total} sub="All spray records" />
      <StatCard label="Products Used"     value={o.distinctProducts} sub="Distinct across records" />

      <InfoCard title="Upcoming Applications">
        {o.planned.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>
            No planned sprays. Plan one in Spray Records and it will appear here.
          </p>
        ) : (
          <div>
            {o.planned.slice(0, 5).map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>
                  {s.date} — {s.applicationName || s.products?.[0]?.name || s.area || 'Spray'}
                </span>
                <Badge variant="blue">Planned</Badge>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      <InfoCard title="Recent Applications">
        {o.completed.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>
            No completed applications yet. Logged sprays will summarize here.
          </p>
        ) : (
          <div>
            {o.completed.slice(0, 5).map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>
                  {s.date} — {s.applicationName || s.products?.[0]?.name || s.area || 'Spray'}
                </span>
                {s.area && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{s.area}</span>}
              </div>
            ))}
          </div>
        )}
      </InfoCard>
    </ModuleOverview>
  )
}
