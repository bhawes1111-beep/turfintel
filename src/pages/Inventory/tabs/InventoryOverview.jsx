// Inventory Overview — live section command center.
//
// Answers "what needs reordering / what moved?" from real persisted
// inventory (useInventoryData: items + usage). Every figure is computed;
// no fabricated counts or dollar values.

import { useMemo } from 'react'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { ModuleOverview, StatCard, InfoCard, Badge } from '../../../components/shared/ModuleOverview'

export default function InventoryOverview() {
  const { items = [], usage = [], loading } = useInventoryData()

  const o = useMemo(() => {
    const lowStock = items.filter(i =>
      typeof i.reorderLevel === 'number' && typeof i.quantity === 'number' && i.quantity <= i.reorderLevel,
    )
    const categories = new Set(items.map(i => i.category).filter(Boolean))
    const recentUsage = [...usage]
      .sort((a, b) => String(b.usedAt ?? b.createdAt ?? '').localeCompare(String(a.usedAt ?? a.createdAt ?? '')))
      .slice(0, 5)
    return { lowStock, categories: categories.size, recentUsage, total: items.length }
  }, [items, usage])

  if (loading && items.length === 0) {
    return <ModuleOverview><InfoCard title="Loading inventory…" rows={[]} /></ModuleOverview>
  }

  return (
    <ModuleOverview>
      <StatCard label="Items Tracked" value={o.total} sub="Across all categories" />
      <StatCard label="Categories"    value={o.categories} sub="Distinct categories" />
      <StatCard label="Low Stock"     value={o.lowStock.length} color={o.lowStock.length > 0 ? '#d4a43a' : undefined} sub="At/below reorder level" />
      <StatCard label="Usage Events"  value={usage.length} sub="Recorded deductions" />

      <InfoCard title="Needs Reorder">
        {o.lowStock.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>
            All tracked items are above their reorder level.
          </p>
        ) : (
          <div>
            {o.lowStock.slice(0, 6).map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>{i.name}</span>
                <Badge variant={i.quantity === 0 ? 'red' : 'yellow'}>
                  {i.quantity}{i.unit ? ` ${i.unit}` : ''}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      <InfoCard title="Recent Usage">
        {o.recentUsage.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>
            No usage recorded yet. Spray deductions and manual usage appear here.
          </p>
        ) : (
          <div>
            {o.recentUsage.map(u => (
              <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>{u.productName || u.name || 'Item'}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {u.quantityUsed != null ? `${u.quantityUsed}${u.unit ? ` ${u.unit}` : ''}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </InfoCard>
    </ModuleOverview>
  )
}
