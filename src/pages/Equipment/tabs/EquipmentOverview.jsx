// Equipment Overview — live section command center.
//
// Answers "what needs attention in the fleet today?" from real stores:
// equipment + maintenance (useEquipmentData) and open repairs
// (useRepairsData). Every figure is computed; no fabricated fleet data.

import { useMemo } from 'react'
import { useEquipmentData } from '../../../utils/equipment/equipmentStore'
import { useRepairsData } from '../../../utils/repairs/repairsStore'
import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

export default function EquipmentOverview() {
  const { equipment = [], serviceLog = [], loading } = useEquipmentData()
  const { repairs = [] } = useRepairsData()

  const o = useMemo(() => {
    const down = equipment.filter(e =>
      e.status === 'out-of-service' || e.status === 'down' || e.status === 'maintenance',
    )
    const operational = equipment.filter(e => e.status === 'available' || e.status === 'operational' || e.status === 'ready')
    const overdue = serviceLog.filter(l =>
      l.status === 'overdue' || (l.status === 'open' && l.priority === 'critical'),
    )
    const openRepairs = repairs.filter(r => r.status !== 'completed')
    return { down, operational, overdue, openRepairs, total: equipment.length }
  }, [equipment, serviceLog, repairs])

  if (loading && equipment.length === 0) {
    return <ModuleOverview><InfoCard title="Loading equipment…" rows={[]} /></ModuleOverview>
  }

  return (
    <ModuleOverview>
      <StatCard label="Total Units"   value={o.total} sub="Fleet records" />
      <StatCard label="Operational"   value={o.operational.length} color="#4ecb4e" sub="Ready to run" />
      <StatCard label="Down / Service" value={o.down.length} color={o.down.length > 0 ? '#e07070' : undefined} sub="Out of service" />
      <StatCard label="Overdue Service" value={o.overdue.length} color={o.overdue.length > 0 ? '#d4a43a' : undefined} sub="Maintenance flags" />

      <InfoCard title="Needs Attention">
        {o.down.length === 0 && o.overdue.length === 0 && o.openRepairs.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>
            Fleet is clear — no down units, overdue service, or open repairs.
          </p>
        ) : (
          <div>
            {o.down.slice(0, 4).map(e => (
              <div key={`d-${e.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>{e.name || `Unit ${e.id}`}</span>
                <Badge variant="red">{e.status}</Badge>
              </div>
            ))}
            {o.overdue.slice(0, 4).map(l => (
              <div key={`o-${l.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>{l.title || l.equipmentName || 'Service item'}</span>
                <Badge variant="yellow">{l.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      <InfoCard title="Active Repairs">
        {o.openRepairs.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>
            No open repairs. Repairs logged in Irrigation/Equipment appear here.
          </p>
        ) : (
          <div>
            {o.openRepairs.slice(0, 5).map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>{r.issueType || r.area || r.title || 'Repair'}</span>
                <Badge variant={r.priority === 'high' ? 'red' : 'yellow'}>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </InfoCard>
    </ModuleOverview>
  )
}
