import { useMemo, useState } from 'react'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { EmptyState } from '../../../components/shared/EmptyState'
import { useInventoryData, setInventoryCatalogLink } from '../../../utils/inventory/inventoryStore'
import { useProductCatalog } from '../../../utils/productCatalog/productCatalogStore'
import { buildLinkReviewBuckets } from '../../../utils/productCatalog/linkReview'
import CatalogLinkPicker from '../components/CatalogLinkPicker'
import inv    from '../Inventory.module.css'
import styles from './InventoryLinkReview.module.css'

// Phase 7C.2 (2/?) — Catalog Link Review tab.
//
// Stewardship surface: helps the superintendent find inventory items
// that should be linked to the global product_catalog, surface
// deterministic exact-name match hints, and apply / change / remove
// links through the existing two-step CatalogLinkPicker.
//
// Read-only over the catalog. No auto-link, no fuzzy-apply: a
// suggestion is just a visible hint until the user confirms via the
// picker. The picker calls setInventoryCatalogLink which is the only
// write path into inventory_items.product_catalog_id.

export default function InventoryLinkReview({ onOpenCatalog } = {}) {
  const { items, loading: invLoading, error: invError } = useInventoryData()
  const { products: catalogProducts, loading: catLoading, error: catError } = useProductCatalog()

  const buckets = useMemo(
    () => buildLinkReviewBuckets(items ?? [], catalogProducts ?? []),
    [items, catalogProducts],
  )

  // ── Picker state ──────────────────────────────────────────────────────
  const [pickerItem, setPickerItem] = useState(null)
  const [pickerSeedId, setPickerSeedId] = useState(null)

  function openPickerFor(item, seedId = null) {
    setPickerItem(item)
    setPickerSeedId(seedId ?? item.productCatalogId ?? null)
  }
  function closePicker() {
    setPickerItem(null)
    setPickerSeedId(null)
  }
  async function commitLink(productCatalogId) {
    if (!pickerItem) return
    await setInventoryCatalogLink(pickerItem.id, productCatalogId)
    closePicker()
  }
  async function unlink(item) {
    try { await setInventoryCatalogLink(item.id, null) } catch { /* surfaced by store error */ }
  }

  const error = invError || catError
  const loadingFirst = (invLoading && (items?.length ?? 0) === 0)
                    || (catLoading && (catalogProducts?.length ?? 0) === 0)

  return (
    <div className={inv.tabContent}>
      <WorkspaceSection
        title="Catalog link review"
        subtitle="Find inventory items that should carry catalog intelligence (FRAC/HRAC/IRAC, REI, label URL). Linking attaches reference data only — it does not change inventory stock."
      >
        {error && (
          <EmptyState
            title="Could not load review data."
            description={error}
          />
        )}

        {!error && loadingFirst && (
          <EmptyState compact title="Loading review data…" />
        )}

        {!error && !loadingFirst && (
          <>
            <ReviewLegend totals={buckets.totals} />

            {/* ── Unlinked ───────────────────────────────────────────────── */}
            <ReviewSection
              title="Unlinked"
              hint={
                buckets.totals.unlinkedWithSuggestion > 0
                  ? `${buckets.totals.unlinkedWithSuggestion} item${buckets.totals.unlinkedWithSuggestion !== 1 ? 's' : ''} have an exact-name match in the catalog. Suggestions are not applied until you confirm them.`
                  : 'Suggestions appear only on exact normalized-name matches.'
              }
              count={buckets.totals.unlinked}
              emptyLabel="All reviewable inventory items are linked or marked stale."
            >
              {buckets.unlinked.map(item => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  status="unlinked"
                  suggestion={buckets.suggestionsByItemId[item.id] ?? null}
                  onLink={() => openPickerFor(item)}
                  onLinkSuggestion={() =>
                    openPickerFor(item, buckets.suggestionsByItemId[item.id]?.id ?? null)
                  }
                  onUnlink={null}
                  onOpenCatalog={onOpenCatalog}
                />
              ))}
            </ReviewSection>

            {/* ── Stale linked ───────────────────────────────────────────── */}
            <ReviewSection
              title="Stale links"
              hint="These rows point at a catalog id that isn't in the current cache. The Spray Builder falls back to name-match → label → legacy. Remove or change the link to clean up."
              count={buckets.totals.stale}
              emptyLabel="No stale catalog links."
              tone="warn"
            >
              {buckets.stale.map(item => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  status="stale"
                  suggestion={null}
                  onLink={() => openPickerFor(item)}
                  onLinkSuggestion={null}
                  onUnlink={() => unlink(item)}
                  onOpenCatalog={onOpenCatalog}
                />
              ))}
            </ReviewSection>

            {/* ── Linked ─────────────────────────────────────────────────── */}
            <ReviewSection
              title="Linked"
              hint="These rows carry catalog intelligence. The 📋 chip appears on the matching Products/Chemicals/Fertilizer card."
              count={buckets.totals.linked}
              emptyLabel="No linked catalog items yet."
              collapsedByDefault
            >
              {buckets.linked.map(item => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  status="linked"
                  suggestion={null}
                  onLink={() => openPickerFor(item)}
                  onLinkSuggestion={null}
                  onUnlink={() => unlink(item)}
                  onOpenCatalog={onOpenCatalog}
                />
              ))}
            </ReviewSection>
          </>
        )}
      </WorkspaceSection>

      {pickerItem && (
        <CatalogLinkPicker
          inventoryItem={pickerItem}
          initialProductCatalogId={pickerSeedId}
          onCancel={closePicker}
          onConfirm={commitLink}
        />
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
function ReviewLegend({ totals }) {
  return (
    <div className={styles.legend} aria-label="Link review totals">
      <LegendStat label="Unlinked" value={totals.unlinked} tone="unlinked" />
      <LegendStat label="With suggestion" value={totals.unlinkedWithSuggestion} tone="suggest" />
      <LegendStat label="Stale" value={totals.stale} tone="warn" />
      <LegendStat label="Linked" value={totals.linked} tone="ok" />
    </div>
  )
}

function LegendStat({ label, value, tone }) {
  return (
    <div className={`${styles.legendStat} ${styles[`legendStat_${tone}`]}`}>
      <div className={styles.legendValue}>{value}</div>
      <div className={styles.legendLabel}>{label}</div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
function ReviewSection({ title, hint, count, emptyLabel, tone, collapsedByDefault, children }) {
  const [collapsed, setCollapsed] = useState(!!collapsedByDefault)
  const isEmpty = count === 0

  return (
    <section className={`${styles.section} ${tone ? styles[`section_${tone}`] : ''}`}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <span className={styles.sectionTitle}>{title}</span>
        <span className={styles.sectionCount}>{count}</span>
        <span className={styles.sectionToggle} aria-hidden>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <>
          {hint && <p className={styles.sectionHint}>{hint}</p>}
          {isEmpty
            ? <p className={styles.sectionEmpty}>{emptyLabel}</p>
            : <div className={styles.cardGrid}>{children}</div>
          }
        </>
      )}
    </section>
  )
}

// ───────────────────────────────────────────────────────────────────────────
function ReviewCard({ item, status, suggestion, onLink, onLinkSuggestion, onUnlink, onOpenCatalog }) {
  return (
    <div className={`${styles.card} ${styles[`card_${status}`]}`}>
      <div className={styles.cardMain}>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardName}>{item.name}</span>
          <StatusBadge status={status} fk={item.productCatalogId} />
        </div>
        <div className={styles.cardSub}>
          {(item.category || item.kind) && <span>{item.category || item.kind}</span>}
          {item.quantity != null && (
            <span className={styles.cardStock}>
              · {item.quantity} {item.unit ?? ''}
            </span>
          )}
        </div>

        {/* Suggestion hint (read-only) */}
        {suggestion && (
          <div className={styles.suggestion}>
            <span className={styles.suggestionLabel}>Possible match (exact name):</span>
            <span className={styles.suggestionName}>{suggestion.productName}</span>
            {suggestion.category && (
              <span className={styles.suggestionCat}>{suggestion.category}</span>
            )}
            {(suggestion.fracGroup || suggestion.hracGroup || suggestion.iracGroup || suggestion.pgrClass) && (
              <span className={styles.suggestionChips}>
                {suggestion.fracGroup && <span className={`${styles.chip} ${styles.chipFrac}`}>FRAC {suggestion.fracGroup}</span>}
                {suggestion.hracGroup && <span className={`${styles.chip} ${styles.chipHrac}`}>HRAC {suggestion.hracGroup}</span>}
                {suggestion.iracGroup && <span className={`${styles.chip} ${styles.chipIrac}`}>IRAC {suggestion.iracGroup}</span>}
                {suggestion.pgrClass  && <span className={`${styles.chip} ${styles.chipPgr}`}>PGR {suggestion.pgrClass}</span>}
              </span>
            )}
            <span className={styles.suggestionGuard}>
              Suggestions are not applied until you confirm them.
            </span>
          </div>
        )}

        {/* Stale FK display */}
        {status === 'stale' && item.productCatalogId && (
          <div className={styles.staleFk}>linked id: <span className={styles.fkMono}>{item.productCatalogId}</span></div>
        )}
      </div>

      <div className={styles.cardActions}>
        {status === 'unlinked' && suggestion && (
          <button type="button" className={styles.btnPrimary} onClick={onLinkSuggestion}>
            Review suggested match
          </button>
        )}
        {status === 'unlinked' && !suggestion && (
          <button type="button" className={styles.btnPrimary} onClick={onLink}>
            📋 Link catalog intelligence
          </button>
        )}
        {status === 'linked' && (
          <>
            {item.productCatalogId && onOpenCatalog && (
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => onOpenCatalog(item.productCatalogId)}
                title="Open in Catalog tab"
              >
                Open in Catalog
              </button>
            )}
            <button type="button" className={styles.btnSecondary} onClick={onLink}>
              Change link
            </button>
            <button type="button" className={styles.btnDanger} onClick={onUnlink}
              title="Inventory stock remains unchanged.">
              Remove link
            </button>
          </>
        )}
        {status === 'stale' && (
          <>
            <button type="button" className={styles.btnSecondary} onClick={onLink}>
              Change link
            </button>
            <button type="button" className={styles.btnDanger} onClick={onUnlink}>
              Remove link
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status, fk }) {
  const meta = {
    linked:   { label: 'Linked',   cls: styles.badgeLinked },
    unlinked: { label: 'Unlinked', cls: styles.badgeUnlinked },
    stale:    { label: 'Stale',    cls: styles.badgeStale },
  }[status] || { label: status, cls: '' }
  return (
    <span className={`${styles.badge} ${meta.cls}`} title={fk ? `id: ${fk}` : undefined}>
      {meta.label}
    </span>
  )
}
