// Chemical Overview — live, and honest about scope.
//
// Chemical work is split across the app: applications live under Sprays,
// stock under Inventory. This overview surfaces what's genuinely owned here
// — imported product labels (useImportedLabels) — and points to the real
// homes for the rest rather than duplicating fabricated figures.

import { useMemo } from 'react'
import { useImportedLabels } from '../../../utils/inventory/labelImportStore'
import { ModuleOverview, StatCard, InfoCard } from '../../../components/shared/ModuleOverview'

export default function ChemicalOverview() {
  const { labels = [], loading } = useImportedLabels()

  const withRei = useMemo(
    () => labels.filter(l => l?.rei != null || l?.reEntryInterval != null).length,
    [labels],
  )

  if (loading && labels.length === 0) {
    return <ModuleOverview><InfoCard title="Loading labels…" rows={[]} /></ModuleOverview>
  }

  return (
    <ModuleOverview>
      <StatCard label="Imported Labels" value={labels.length} sub="Product labels on file" />
      <StatCard label="With REI Data"   value={withRei} sub="Re-entry interval parsed" />

      <InfoCard title="Where chemical work lives" rows={[
        { label: 'Spray applications & windows', value: 'Sprays' },
        { label: 'Product stock & reorder',      value: 'Inventory' },
        { label: 'Label PDFs & REI/PPE data',    value: 'Chemical → Labels' },
      ]} />

      <InfoCard title="Imported Labels">
        {labels.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>
            No labels imported yet. Use the Chemical Import Wizard (Inventory)
            to add a product label — parsed REI/PPE/rate data will appear here.
          </p>
        ) : (
          <div>
            {labels.slice(0, 6).map(l => (
              <div key={l.id ?? l.inventoryItemId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 13 }}>{l.productName || l.name || 'Label'}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {(l.rei ?? l.reEntryInterval) != null ? `REI ${l.rei ?? l.reEntryInterval}h` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </InfoCard>
    </ModuleOverview>
  )
}
