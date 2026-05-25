import { useMemo, useState } from 'react'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { EmptyState } from '../../../components/shared/EmptyState'
import { useInventoryData, setInventoryCatalogLink } from '../../../utils/inventory/inventoryStore'
import { useProductCatalog } from '../../../utils/productCatalog/productCatalogStore'
import {
  buildLinkReviewBuckets,
  filterLinkReviewItems,
  sortLinkReviewItems,
  calculateLinkReviewProgress,
  LINK_REVIEW_FILTERS,
  LINK_REVIEW_SORTS,
} from '../../../utils/productCatalog/linkReview'
import CatalogLinkPicker from '../components/CatalogLinkPicker'
import inv    from '../Inventory.module.css'
import styles from './InventoryLinkReview.module.css'

// Phase 7C.2 (3/?) — Link Review workflow polish.
//
// Toolbar (search + filter pills + sort dropdown) drives a pure
// filter→sort pipeline over the same buckets used in Commit 2. When
// the filter is 'all', the page falls back to the collapsible-section
// view so the steward can scan the whole queue. Picking any specific
// filter switches to a single ranked list so the steward can work
// through one bucket at a time.
//
// All write paths remain unchanged: setInventoryCatalogLink (single
// narrow PATCH endpoint), invoked exclusively via the two-step
// CatalogLinkPicker. No bulk apply, no "accept all suggestions" — the
// helpers are bulk-ready, the UI deliberately isn't.

const FILTER_OPTIONS = [
  { value: LINK_REVIEW_FILTERS.ALL,       label: 'All reviewable' },
  { value: LINK_REVIEW_FILTERS.UNLINKED,  label: 'Unlinked' },
  { value: LINK_REVIEW_FILTERS.SUGGESTED, label: 'With exact-name suggestion' },
  { value: LINK_REVIEW_FILTERS.STALE,     label: 'Stale linked' },
  { value: LINK_REVIEW_FILTERS.LINKED,    label: 'Linked' },
]

const SORT_OPTIONS = [
  { value: LINK_REVIEW_SORTS.NAME,            label: 'Name A–Z' },
  { value: LINK_REVIEW_SORTS.STATUS,          label: 'Status' },
  { value: LINK_REVIEW_SORTS.SUGGESTED_FIRST, label: 'Suggested first' },
  { value: LINK_REVIEW_SORTS.STALE_FIRST,     label: 'Stale first' },
]

export default function InventoryLinkReview({ onOpenCatalog } = {}) {
  const { items, loading: invLoading, error: invError } = useInventoryData()
  const { products: catalogProducts, loading: catLoading, error: catError } = useProductCatalog()

  const buckets  = useMemo(
    () => buildLinkReviewBuckets(items ?? [], catalogProducts ?? []),
    [items, catalogProducts],
  )
  const progress = useMemo(() => calculateLinkReviewProgress(buckets), [buckets])

  // ── Toolbar state ─────────────────────────────────────────────────────
  const [filter, setFilter] = useState(LINK_REVIEW_FILTERS.ALL)
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState(LINK_REVIEW_SORTS.STATUS)

  const filtered = useMemo(
    () => filterLinkReviewItems(items ?? [], buckets, { filter, search }),
    [items, buckets, filter, search],
  )
  const filteredSorted = useMemo(
    () => sortLinkReviewItems(filtered, buckets, sortMode),
    [filtered, buckets, sortMode],
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

  // When the user picks a specific filter we ditch the section layout in
  // favor of a single ranked list. 'All' keeps the section view so the
  // user can still see the overall shape of the queue.
  const showSections = filter === LINK_REVIEW_FILTERS.ALL && search === ''

  return (
    <div className={inv.tabContent}>
      <WorkspaceSection
        title="Catalog link review"
        subtitle="Find inventory items that should carry catalog intelligence (FRAC/HRAC/IRAC, REI, label URL). No inventory stock changes. No automatic catalog links are applied."
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
            <ProgressSummary progress={progress} />

            <Toolbar
              filter={filter}    onFilterChange={setFilter}
              sortMode={sortMode} onSortChange={setSortMode}
              search={search}    onSearchChange={setSearch}
              filteredCount={filtered.length}
              totalReviewable={progress.total}
            />

            {showSections ? (
              <SectionedView
                buckets={buckets}
                onLink={openPickerFor}
                onUnlink={unlink}
                onOpenCatalog={onOpenCatalog}
              />
            ) : (
              <SingleListView
                items={filteredSorted}
                buckets={buckets}
                onLink={openPickerFor}
                onUnlink={unlink}
                onOpenCatalog={onOpenCatalog}
              />
            )}
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

// ── Progress summary ───────────────────────────────────────────────────────
function ProgressSummary({ progress }) {
  return (
    <div className={styles.progress}>
      <div className={styles.progressHeader}>
        <span className={styles.progressTitle}>Review progress</span>
        <span className={styles.progressPct}>{progress.percentLinked}% linked</span>
      </div>
      <div className={styles.progressBarWrap} aria-hidden>
        <div
          className={styles.progressBar}
          style={{ width: `${progress.percentLinked}%` }}
        />
      </div>
      <div className={styles.legend} aria-label="Review totals">
        <LegendStat label="Total"           value={progress.total}                  tone="total" />
        <LegendStat label="Linked"          value={progress.linked}                 tone="ok" />
        <LegendStat label="Unlinked"        value={progress.unlinked}               tone="unlinked" />
        <LegendStat label="With suggestion" value={progress.unlinkedWithSuggestion} tone="suggest" />
        <LegendStat label="Stale"           value={progress.stale}                  tone="warn" />
      </div>
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

// ── Toolbar (search + filter + sort) ───────────────────────────────────────
function Toolbar({ filter, onFilterChange, sortMode, onSortChange, search, onSearchChange, filteredCount, totalReviewable }) {
  return (
    <div className={styles.toolbar}>
      <input
        type="search"
        className={styles.searchInput}
        placeholder="Search inventory item name…"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        aria-label="Search inventory item name"
      />

      <div className={styles.filterRow}>
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            className={`${styles.filterBtn} ${filter === opt.value ? styles.filterBtnActive : ''}`}
            onClick={() => onFilterChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className={styles.sortRow}>
        <label className={styles.sortLabel}>
          Sort
          <select
            className={styles.sortSelect}
            value={sortMode}
            onChange={e => onSortChange(e.target.value)}
            aria-label="Sort"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <span className={styles.toolbarCount}>
          {filteredCount} of {totalReviewable}
        </span>
      </div>

      <p className={styles.stewardNote}>
        Exact-name suggestions only. Suggestions require confirmation. No inventory stock changes.
      </p>
    </div>
  )
}

// ── Sectioned view (default: 'all' filter + no search) ─────────────────────
function SectionedView({ buckets, onLink, onUnlink, onOpenCatalog }) {
  return (
    <>
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
            onLink={() => onLink(item)}
            onLinkSuggestion={() => onLink(item, buckets.suggestionsByItemId[item.id]?.id ?? null)}
            onUnlink={null}
            onOpenCatalog={onOpenCatalog}
          />
        ))}
      </ReviewSection>

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
            onLink={() => onLink(item)}
            onLinkSuggestion={null}
            onUnlink={() => onUnlink(item)}
            onOpenCatalog={onOpenCatalog}
          />
        ))}
      </ReviewSection>

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
            onLink={() => onLink(item)}
            onLinkSuggestion={null}
            onUnlink={() => onUnlink(item)}
            onOpenCatalog={onOpenCatalog}
          />
        ))}
      </ReviewSection>
    </>
  )
}

// ── Single ranked list (when any filter is active) ─────────────────────────
function SingleListView({ items, buckets, onLink, onUnlink, onOpenCatalog }) {
  if (items.length === 0) {
    return (
      <p className={styles.sectionEmpty}>
        No reviewable items match the current filter or search.
      </p>
    )
  }

  return (
    <div className={styles.cardGrid}>
      {items.map(item => {
        const fk = item.productCatalogId ?? null
        const status = !fk ? 'unlinked'
          : buckets.linked.some(l => l.id === item.id) ? 'linked'
          : 'stale'
        const suggestion = !fk ? (buckets.suggestionsByItemId[item.id] ?? null) : null

        return (
          <ReviewCard
            key={item.id}
            item={item}
            status={status}
            suggestion={suggestion}
            onLink={() => onLink(item)}
            onLinkSuggestion={suggestion
              ? () => onLink(item, suggestion.id)
              : null}
            onUnlink={fk ? () => onUnlink(item) : null}
            onOpenCatalog={onOpenCatalog}
          />
        )
      })}
    </div>
  )
}

// ── Existing pieces (unchanged from Commit 2) ──────────────────────────────
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
