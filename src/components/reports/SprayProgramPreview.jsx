import { REPORT_TYPE } from '../../utils/reports/reportSchemas'
import styles from './SprayProgramPreview.module.css'

// Phase 7G (2/?) — Spray Program custom preview.
//
// Renders the spray-program TurfReport with a header, summary tiles,
// and per-section card layouts that are mobile-first AND
// print-friendly. The generic FIELDS/TABLE/TEXT renderer in
// ReportPreviewModal would surface the same data, but as dense tables
// — this view re-shapes the existing sections into cards + lists.
//
// Read-only by construction: every value comes from props.report.
// Stewardship-only language; the disclaimer is rendered prominently.

export const SUPPORTED_TYPE = REPORT_TYPE.SPRAY_PROGRAM

const DEFAULT_DISCLAIMER = [
  'Read-only spray program summary.',
  'Based on planned program items and linked completed spray records.',
  'This report does not recommend treatments.',
  'Missing links mean planned items could not be compared to completed records.',
].join(' ')

export default function SprayProgramPreview({ report }) {
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

  // Pull sections by title (builder uses titles). Defensive lookup so a
  // future section rename hides only its own card.
  const byTitle = Object.fromEntries(
    (report.sections ?? []).map(s => [s.title, s]),
  )
  const programSummary = byTitle['Program Summary']
  const planVsActual   = byTitle['Plan vs Actual']
  const unlinked       = byTitle['Unlinked Planned Items']
  const stale          = byTitle['Missing or Stale Links']

  return (
    <div className={styles.preview}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <h2 className={styles.title}>Spray Program Report</h2>
        <p className={styles.subtitle}>Read-only spray program summary</p>
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
      <section className={styles.tilesSection} aria-label="Report summary">
        <div className={styles.tiles}>
          <Tile label="Programs reviewed"        value={totals.programsReviewed        ?? 0} />
          <Tile label="Planned items"            value={totals.plannedItems            ?? 0} />
          <Tile label="Linked completed"         value={totals.linkedCompletedItems    ?? 0} tone="ok" />
          <Tile label="Unlinked planned"         value={totals.unlinkedPlannedItems    ?? 0}
                tone={(totals.unlinkedPlannedItems ?? 0) > 0 ? 'caution' : 'muted'} />
          <Tile label="Completed status"         value={totals.completedStatusItems    ?? 0} tone="ok" />
          <Tile label="Skipped"                  value={totals.skippedItems            ?? 0} tone="muted" />
          <Tile label="Canceled"                 value={totals.canceledItems           ?? 0} tone="muted" />
          <Tile label="Missing or stale links"   value={totals.missingActualLinks      ?? 0}
                tone={(totals.missingActualLinks ?? 0) > 0 ? 'warn' : 'muted'} />
        </div>
      </section>

      {/* ── Program Summary ──────────────────────────────────────────── */}
      {programSummary && (
        <SectionCard title="Program Summary">
          <ProgramSummaryList rows={programSummary.data?.rows ?? []} />
        </SectionCard>
      )}

      {/* ── Plan vs Actual ───────────────────────────────────────────── */}
      {planVsActual && (
        <SectionCard title="Plan vs Actual">
          <PlanVsActualList rows={planVsActual.data?.rows ?? []} />
        </SectionCard>
      )}

      {/* ── Unlinked Planned Items ───────────────────────────────────── */}
      {unlinked && (
        <SectionCard title="Unlinked Planned Items">
          <UnlinkedList rows={unlinked.data?.rows ?? []} />
        </SectionCard>
      )}

      {/* ── Missing or Stale Links ───────────────────────────────────── */}
      {stale && (
        <SectionCard title="Missing or Stale Links">
          <StaleList rows={stale.data?.rows ?? []} />
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

// ── Tiles ────────────────────────────────────────────────────────────────
function Tile({ label, value, tone = 'neutral' }) {
  return (
    <div className={`${styles.tile} ${styles[`tile_${tone}`] ?? ''}`}>
      <div className={styles.tileValue}>{value}</div>
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

// ── Program Summary list ────────────────────────────────────────────────
// Builder columns: [name, season, type, status, planned items, linked completed]
function ProgramSummaryList({ rows }) {
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
          <div className={styles.programCounts}>
            <span><strong>{r[4]}</strong> planned</span>
            <span><strong>{r[5]}</strong> linked completed</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Plan vs Actual list ─────────────────────────────────────────────────
// Builder columns: [program, planned product, linked spray, date, product, area, rate]
function PlanVsActualList({ rows }) {
  const real = rows.filter(r => r?.[0] && r[0] !== 'No linked planned items in range.')
  if (real.length === 0) {
    return <p className={styles.empty}>No linked planned items in range.</p>
  }
  return (
    <ul className={styles.pvaList}>
      {real.map((r, i) => (
        <li key={`${r[0]}-${r[1]}-${i}`} className={styles.pvaItem}>
          <div className={styles.pvaHeader}>
            <span className={styles.pvaProduct}>{r[1]}</span>
            <span className={styles.pvaProgram}>{r[0]}</span>
          </div>
          <div className={styles.pvaLinked}>Linked spray: {r[2]}</div>
          <dl className={styles.pvaKv}>
            <ComparisonRow label="Date"    value={r[3]} />
            <ComparisonRow label="Product" value={r[4]} />
            <ComparisonRow label="Area"    value={r[5]} />
            <ComparisonRow label="Rate"    value={r[6]} />
          </dl>
        </li>
      ))}
    </ul>
  )
}

function ComparisonRow({ label, value }) {
  return (
    <div className={`${styles.pvaKvRow} ${valueTone(value)}`}>
      <dt className={styles.pvaKvLabel}>{label}</dt>
      <dd className={styles.pvaKvValue}>{value ?? '—'}</dd>
    </div>
  )
}

// Tone tag derived purely from the helper's neutral language. We never
// flip "different" into a verdict — only choose color so the steward
// can scan quickly.
function valueTone(v) {
  if (v == null) return ''
  const s = String(v).toLowerCase()
  if (s.includes('inside planned window'))           return styles.pvaTone_ok
  if (s.includes('appears in completed record'))     return styles.pvaTone_ok
  if (s.includes('matches recorded'))                return styles.pvaTone_ok
  if (s.includes('outside planned window'))          return styles.pvaTone_warn
  if (s.includes('different recorded product'))      return styles.pvaTone_warn
  if (s.includes('differs from recorded'))           return styles.pvaTone_warn
  if (s.includes('not compared') || s.includes('no '))
    return styles.pvaTone_muted
  return ''
}

// ── Unlinked list ───────────────────────────────────────────────────────
// Builder columns: [program, planned product, area, planned window, status]
function UnlinkedList({ rows }) {
  const real = rows.filter(r => r?.[0] && r[0] !== 'No unlinked planned items.')
  if (real.length === 0) {
    return <p className={styles.empty}>No unlinked planned items.</p>
  }
  return (
    <ul className={styles.unlinkedList}>
      {real.map((r, i) => (
        <li key={`${r[0]}-${r[1]}-${i}`} className={styles.unlinkedItem}>
          <div className={styles.unlinkedHeader}>
            <span className={styles.unlinkedProduct}>{r[1]}</span>
            <span className={`${styles.itemStatusBadge} ${styles[`itemStatus_${r[4]}`] ?? ''}`}>
              {r[4]}
            </span>
          </div>
          <div className={styles.unlinkedMeta}>
            <span>{r[0]}</span>
            {r[2] !== '—' && <span>· 📍 {r[2]}</span>}
            {r[3] !== '—' && <span>· 🗓 {r[3]}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Stale link list ─────────────────────────────────────────────────────
// Builder columns: [program, planned product, stale id, status]
function StaleList({ rows }) {
  const real = rows.filter(r => r?.[0] && r[0] !== 'No missing or stale links.')
  if (real.length === 0) {
    return <p className={styles.empty}>No missing or stale links.</p>
  }
  return (
    <ul className={styles.staleList}>
      {real.map((r, i) => (
        <li key={`${r[0]}-${r[1]}-${i}`} className={styles.staleItem}>
          <div className={styles.staleHeader}>
            <span className={styles.staleProduct}>{r[1]}</span>
            <span className={`${styles.itemStatusBadge} ${styles[`itemStatus_${r[3]}`] ?? ''}`}>
              {r[3]}
            </span>
          </div>
          <div className={styles.staleMeta}>
            <span>{r[0]}</span>
          </div>
          <div className={styles.staleFk}>
            linked id: <span className={styles.staleFkMono}>{r[2]}</span>
            <span className={styles.staleReason}>
              · linked spray record could not be resolved
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
