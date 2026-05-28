import { REPORT_TYPE } from '../../utils/reports/reportSchemas'
import styles from './SprayProgramCostPreview.module.css'

// Phase 7I (4/?) — Spray Program Cost custom preview.
//
// Renders the spray-program-cost TurfReport with summary tiles + per-
// section card lists that are mobile-first AND print-friendly. The
// generic FIELDS/TABLE/TEXT renderer in ReportPreviewModal would
// surface the same data, but as dense tables — this view re-shapes
// the builder's existing rows into cards + lists.
//
// Read-only by construction: every value comes from props.report.
// No write actions, no buttons that mutate D1, no inventory deduction,
// no completed-spray creation, no product_catalog mutation, no budget
// or invoice or ledger workflows. Stewardship-only language; the
// disclaimer is rendered prominently.

export const SUPPORTED_TYPE = REPORT_TYPE.SPRAY_PROGRAM_COST

const DEFAULT_DISCLAIMER = [
  'Read-only spray program cost summary.',
  'Based on planned program items and inventory cost basis.',
  'This report does not create budget entries.',
  'Missing cost basis means no usable inventory cost is available.',
  'Inventory is not deducted from planned items.',
].join(' ')

const REASON_TONE = {
  'Estimated':            'ok',
  'Missing cost basis':   'warn',
  'Missing quantity':     'warn',
  'Unit mismatch':        'warn',
  'Cost basis found, conversion needed': 'caution',
  'Area needed for estimate':  'caution',
  'Unsupported rate unit':     'warn',
  'Unsupported cost unit':     'warn',
  'Invalid cost value':   'warn',
}

const GAP_STATUS_LABEL = {
  'missing-inventory-link':   'No inventory linked',
  'missing-inventory-item':   'Inventory item not found',
  'missing-cost-per-unit':    'Missing cost per unit',
  'missing-unit':             'Missing unit',
  'invalid-cost':             'Invalid cost value',
  'unused-in-programs':       'Unused in programs',
}

export default function SprayProgramCostPreview({ report }) {
  if (!report) return null

  const metadata   = report.metadata ?? {}
  const totals     = metadata.totals  ?? {}
  const notices    = Array.isArray(metadata.notices) ? metadata.notices : []
  const dateRange  = metadata.dateRange ?? null
  const disclaimer = metadata.disclaimer || DEFAULT_DISCLAIMER

  const generatedAt = (() => {
    const raw = report.createdAt ?? metadata.generatedAt
    if (!raw) return ''
    try {
      return new Date(raw).toLocaleString(undefined, {
        dateStyle: 'medium', timeStyle: 'short',
      })
    } catch { return String(raw) }
  })()

  const byId = Object.fromEntries(
    (report.sections ?? []).map(s => [s.id ?? s.title, s]),
  )
  const programSummary  = byId['program-cost-summary']  ?? byId['Program Cost Summary']
  const estimatedItems  = byId['estimated-items']       ?? byId['Estimated Items']
  const costBasisGaps   = byId['cost-basis-gaps']       ?? byId['Cost Basis Gaps']
  const conversionNeeded = byId['conversion-needed-items'] ?? byId['Cost Basis Found — Conversion Needed']
  const notEstimated    = byId['not-estimated-items']   ?? byId['Not Estimated Items']

  // Overview section was already used by the FIELDS path. We surface
  // its values as summary tiles instead — the same numbers come straight
  // from metadata.totals so we never desync.
  const estimatedTotalDisplay = (() => {
    const overviewFields = (byId['overview']?.data) ?? {}
    return overviewFields['Estimated total'] ?? formatCurrencyFallback(totals.estimatedTotal)
  })()

  return (
    <div className={styles.preview}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <h2 className={styles.title}>Spray Program Cost Report</h2>
        <p className={styles.subtitle}>Read-only spray program cost summary</p>
        <p className={styles.meta}>
          {generatedAt && <span>Generated {generatedAt}</span>}
          {dateRange && (
            <>
              <span aria-hidden> · </span>
              <span>Date range: {dateRange}</span>
            </>
          )}
        </p>
      </header>

      {/* ── Summary tiles ────────────────────────────────────────────── */}
      <section className={styles.tilesSection} aria-label="Cost summary tiles">
        <div className={styles.tiles}>
          <Tile label="Programs reviewed" value={totals.programsReviewed ?? 0} />
          <Tile label="Planned items"     value={totals.plannedItems     ?? 0} />
          <Tile label="Estimated items"   value={totals.estimatedItems   ?? 0} tone="ok" />
          <Tile
            label="Estimated total"
            value={estimatedTotalDisplay ?? '—'}
            tone="cost"
            emphasis
          />
          <Tile
            label="Missing cost basis"
            value={totals.missingCostBasis ?? 0}
            tone={(totals.missingCostBasis ?? 0) > 0 ? 'warn' : 'muted'}
          />
          <Tile
            label="Missing quantity"
            value={totals.missingQuantity ?? 0}
            tone={(totals.missingQuantity ?? 0) > 0 ? 'warn' : 'muted'}
          />
          <Tile
            label="Unit mismatch"
            value={totals.notComparableUnits ?? 0}
            tone={(totals.notComparableUnits ?? 0) > 0 ? 'warn' : 'muted'}
          />
          <Tile
            label="Conversion needed"
            value={totals.conversionNeeded ?? 0}
            tone={(totals.conversionNeeded ?? 0) > 0 ? 'caution' : 'muted'}
          />
          <Tile
            label="Area needed"
            value={totals.areaNeeded ?? 0}
            tone={(totals.areaNeeded ?? 0) > 0 ? 'caution' : 'muted'}
          />
          <Tile
            label="Unsupported unit"
            value={totals.unsupportedUnit ?? 0}
            tone={(totals.unsupportedUnit ?? 0) > 0 ? 'warn' : 'muted'}
          />
          <Tile
            label="Invalid cost"
            value={totals.invalidCost ?? 0}
            tone={(totals.invalidCost ?? 0) > 0 ? 'warn' : 'muted'}
          />
        </div>
      </section>

      {/* ── Program Cost Summary ─────────────────────────────────────── */}
      {programSummary && (
        <SectionCard title="Program Cost Summary">
          <ProgramCostList rows={programSummary.data?.rows ?? []} />
        </SectionCard>
      )}

      {/* ── Estimated Items ──────────────────────────────────────────── */}
      {estimatedItems && (
        <SectionCard title="Estimated Items">
          <EstimatedItemsList rows={estimatedItems.data?.rows ?? []} />
        </SectionCard>
      )}

      {/* ── Cost Basis Gaps ──────────────────────────────────────────── */}
      {costBasisGaps && (
        <SectionCard title="Cost Basis Gaps">
          <CostBasisGapList rows={costBasisGaps.data?.rows ?? []} />
        </SectionCard>
      )}

      {/* ── Cost Basis Found — Conversion Needed (Phase 7U.4) ────────── */}
      {conversionNeeded && (
        <SectionCard title="Cost Basis Found — Conversion Needed">
          <ConversionNeededList rows={conversionNeeded.data?.rows ?? []} />
        </SectionCard>
      )}

      {/* ── Not Estimated Items ──────────────────────────────────────── */}
      {notEstimated && (
        <SectionCard title="Not Estimated Items">
          <NotEstimatedList rows={notEstimated.data?.rows ?? []} />
        </SectionCard>
      )}

      {/* ── Notices ──────────────────────────────────────────────────── */}
      {notices.length > 0 && (
        <SectionCard title="Notices">
          <ul className={styles.noticeList}>
            {notices.map((n, i) => (
              <li
                key={`${n.type}-${n.label}-${i}`}
                className={`${styles.notice} ${styles[`notice_${n.type}`] ?? ''}`}
              >
                <span className={styles.noticeIcon} aria-hidden>
                  {n.type === 'warning' ? '⚠' : n.type === 'caution' ? '•' : '·'}
                </span>
                <span className={styles.noticeText}>
                  <strong>{n.label}:</strong> {n.value}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ── Disclaimer footer ────────────────────────────────────────── */}
      <footer className={styles.disclaimer}>
        <p>{disclaimer}</p>
      </footer>
    </div>
  )
}

// ── Atoms ──────────────────────────────────────────────────────────────
function Tile({ label, value, tone = 'neutral', emphasis = false }) {
  return (
    <div
      className={`${styles.tile} ${styles[`tile_${tone}`] ?? ''} ${emphasis ? styles.tileEmphasis : ''}`}
    >
      <div className={styles.tileValue}>{value ?? '—'}</div>
      <div className={styles.tileLabel}>{label}</div>
    </div>
  )
}
function SectionCard({ title, children }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  )
}

// ── Program Cost Summary ───────────────────────────────────────────────
// Builder columns:
// [program, season, type, status, est total, est items, missing basis,
//  missing quantity, unit mismatch]
function ProgramCostList({ rows }) {
  const real = rows.filter(r => r?.[0] && r[0] !== 'No programs in the report range.')
  if (real.length === 0) {
    return <p className={styles.empty}>No programs in the report range.</p>
  }
  return (
    <ul className={styles.programList}>
      {real.map((r, i) => (
        <li key={`${r[0]}-${i}`} className={styles.programCard}>
          <div className={styles.programHeader}>
            <span className={styles.programName}>{r[0]}</span>
            <span className={`${styles.programStatusBadge} ${styles[`programStatus_${r[3]}`] ?? ''}`}>
              {r[3]}
            </span>
          </div>
          <div className={styles.programMeta}>
            {r[2] !== '—' && <span className={styles.programType}>{r[2]}</span>}
            {r[1] !== '—' && <span>· {r[1]}</span>}
          </div>
          <div className={styles.programCostRow}>
            <span className={styles.programCost}>{r[4]}</span>
            <span className={styles.programCostLabel}>estimated total</span>
          </div>
          <div className={styles.programCounts}>
            <span><strong>{r[5]}</strong> estimated</span>
            {Number(r[6]) > 0 && <span className={styles.warnText}><strong>{r[6]}</strong> missing basis</span>}
            {Number(r[7]) > 0 && <span className={styles.warnText}><strong>{r[7]}</strong> missing qty</span>}
            {Number(r[8]) > 0 && <span className={styles.warnText}><strong>{r[8]}</strong> unit mismatch</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Estimated Items (Phase 7V.1) ───────────────────────────────────────
// Builder columns:
// [program, planned product, rate, est. quantity, unit cost basis,
//  area basis, estimated cost]
function EstimatedItemsList({ rows }) {
  const real = rows.filter(r => r?.[0] && r[0] !== 'No estimated items in the report range.')
  if (real.length === 0) {
    return <p className={styles.empty}>No estimated items in the report range.</p>
  }
  return (
    <ul className={styles.itemList}>
      {real.map((r, i) => (
        <li key={`${r[0]}-${r[1]}-${i}`} className={styles.itemCard}>
          <div className={styles.itemHeader}>
            <span className={styles.itemProduct}>{r[1]}</span>
            <span className={styles.itemCost}>{r[6]}</span>
          </div>
          <div className={styles.itemMeta}>
            <span>{r[0]}</span>
          </div>
          <dl className={styles.itemKv}>
            <KvRow label="Rate"            value={r[2]} />
            <KvRow label="Est. quantity"   value={r[3]} />
            <KvRow label="Unit cost basis" value={r[4]} />
            <KvRow label="Area basis"      value={r[5]} />
            <KvRow label="Estimated cost"  value={r[6]} valueClassName={styles.kvCost} />
          </dl>
        </li>
      ))}
    </ul>
  )
}

// ── Cost Basis Gaps ────────────────────────────────────────────────────
// Builder columns:
// [inventory item, issue, affected count, affected summary]
function CostBasisGapList({ rows }) {
  const real = rows.filter(r => r?.[0] && r[0] !== 'No cost basis gaps.')
  if (real.length === 0) {
    return <p className={styles.empty}>No cost basis gaps.</p>
  }
  return (
    <ul className={styles.gapList}>
      {real.map((r, i) => (
        <li key={`${r[0]}-${r[1]}-${i}`} className={styles.gapItem}>
          <div className={styles.gapHeader}>
            <span className={styles.gapInventory}>{r[0]}</span>
            <span className={styles.gapStatusBadge}>{GAP_STATUS_LABEL[r[1]] ?? r[1]}</span>
          </div>
          <div className={styles.gapMeta}>
            <strong>{r[2]}</strong> affected planned item{Number(r[2]) !== 1 ? 's' : ''}
          </div>
          {r[3] && r[3] !== '—' && (
            <ul className={styles.gapAffected}>
              {String(r[3]).split('|').map((s, j) => {
                const txt = s.trim()
                if (!txt) return null
                return <li key={`${txt}-${j}`} className={styles.gapAffectedRow}>{txt}</li>
              })}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

// ── Not Estimated Items ────────────────────────────────────────────────
// Builder columns: [program, planned product, reason, message]
function NotEstimatedList({ rows }) {
  const real = rows.filter(r => r?.[0] && r[0] !== 'No items are missing an estimate.')
  if (real.length === 0) {
    return <p className={styles.empty}>No items are missing an estimate.</p>
  }
  return (
    <ul className={styles.itemList}>
      {real.map((r, i) => {
        const tone = REASON_TONE[r[2]] ?? 'warn'
        return (
          <li
            key={`${r[0]}-${r[1]}-${i}`}
            className={`${styles.itemCard} ${styles[`itemCard_${tone}`] ?? ''}`}
          >
            <div className={styles.itemHeader}>
              <span className={styles.itemProduct}>{r[1]}</span>
              <span className={`${styles.reasonBadge} ${styles[`reason_${tone}`] ?? ''}`}>
                {r[2]}
              </span>
            </div>
            <div className={styles.itemMeta}>
              <span>{r[0]}</span>
            </div>
            {r[3] && r[3] !== '—' && (
              <p className={styles.itemMessage}>{r[3]}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ── Cost Basis Found — Conversion Needed (Phase 7U.4) ──────────────────
// Builder columns: [program, planned product, rate, unit cost basis, note]
function ConversionNeededList({ rows }) {
  const real = rows.filter(r => r?.[0] && r[0] !== 'No items need unit conversion.')
  if (real.length === 0) {
    return <p className={styles.empty}>No items need unit conversion.</p>
  }
  return (
    <ul className={styles.itemList}>
      {real.map((r, i) => (
        <li key={`${r[0]}-${r[1]}-${i}`} className={`${styles.itemCard} ${styles.itemCard_caution ?? ''}`}>
          <div className={styles.itemHeader}>
            <span className={styles.itemProduct}>{r[1]}</span>
            <span className={`${styles.reasonBadge} ${styles.reason_caution ?? ''}`}>
              Conversion needed
            </span>
          </div>
          <div className={styles.itemMeta}>
            <span>{r[0]}</span>
          </div>
          <dl className={styles.itemKv}>
            <KvRow label="Rate"            value={r[2]} />
            <KvRow label="Unit cost basis" value={r[3]} />
          </dl>
          {r[4] && r[4] !== '—' && <p className={styles.itemMessage}>{r[4]}</p>}
        </li>
      ))}
    </ul>
  )
}

function KvRow({ label, value, valueClassName }) {
  return (
    <div className={styles.kvRow}>
      <dt className={styles.kvLabel}>{label}</dt>
      <dd className={`${styles.kvValue} ${valueClassName ?? ''}`}>{value ?? '—'}</dd>
    </div>
  )
}

// Defensive currency fallback only used when the builder's overview
// field is missing (e.g. legacy report). Mirrors the Phase 7I.1
// formatEstimatedCost em-dash fallback.
function formatCurrencyFallback(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency: 'USD',
      maximumFractionDigits: 2, minimumFractionDigits: 2,
    }).format(Number(value))
  } catch {
    return `USD ${Number(value).toFixed(2)}`
  }
}
