import { REPORT_TYPE } from '../../utils/reports/reportSchemas'
import styles from './SprayIntelligencePreview.module.css'

// Phase 7E (2/?) — Spray Intelligence custom preview.
//
// Renders the spray-intelligence TurfReport with a header, summary
// tiles, and per-section card layouts that are mobile-first AND
// print-friendly. The generic FIELDS/TABLE renderer in
// ReportPreviewModal would surface the same data, but as dense tables
// — this view re-shapes the existing sections into chips + cards +
// lists without changing the underlying report model.
//
// Read-only by construction: every value comes from props.report.
// Stewardship-only language; the disclaimer is rendered prominently.

export const SUPPORTED_TYPE = REPORT_TYPE.SPRAY_INTELLIGENCE

const DEFAULT_DISCLAIMER = [
  'Read-only spray intelligence summary.',
  'Based on recorded applications and linked catalog or label data.',
  'This report does not recommend treatments.',
  'Missing intelligence means products could not be evaluated from available catalog or label data.',
].join(' ')

export default function SprayIntelligencePreview({ report }) {
  if (!report) return null

  const metadata = report.metadata ?? {}
  const totals   = metadata.totals ?? {}
  const notices  = Array.isArray(metadata.notices) ? metadata.notices : []
  const dateRange = metadata.dateRange ?? null
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

  // Pull sections by title (the builder uses titles, not ids). Wrap
  // lookup defensively so a future section rename doesn't crash the
  // preview — the corresponding card just hides.
  const byTitle = Object.fromEntries(
    (report.sections ?? []).map(s => [s.title, s]),
  )
  const overview     = byTitle['Overview']
  const chemistry    = byTitle['Chemistry Awareness']
  const rotation     = byTitle['Rotation Awareness']
  const interval     = byTitle['Interval Awareness']
  const missing      = byTitle['Missing Intelligence']

  return (
    <div className={styles.preview}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <h2 className={styles.title}>Spray Intelligence Report</h2>
        <p className={styles.subtitle}>Read-only spray intelligence summary</p>
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
          <Tile label="Sprays reviewed"      value={totals.spraysReviewed     ?? 0} />
          <Tile label="Products reviewed"    value={totals.productsReviewed   ?? 0} />
          <Tile label="With intelligence"    value={totals.productsWithIntel  ?? 0} tone="ok" />
          <Tile label="Missing intelligence" value={totals.missingIntelCount  ?? 0}
                tone={(totals.missingIntelCount ?? 0) > 0 ? 'warn' : 'muted'} />
          <Tile label="Restricted-use"       value={totals.restrictedUseCount ?? 0}
                tone={(totals.restrictedUseCount ?? 0) > 0 ? 'caution' : 'muted'} />
          <Tile label="Repeated groups"      value={totals.repeatedGroupCount ?? 0}
                tone={(totals.repeatedGroupCount ?? 0) > 0 ? 'caution' : 'muted'} />
          <Tile label="Interval matches"     value={totals.intervalMatchCount ?? 0} />
        </div>
      </section>

      {/* ── Chemistry Awareness ──────────────────────────────────────── */}
      {chemistry && (
        <SectionCard title="Chemistry Awareness">
          <ChemistryAwareness rows={chemistry.data?.rows ?? []} />
        </SectionCard>
      )}

      {/* ── Rotation Awareness ───────────────────────────────────────── */}
      {rotation && (
        <SectionCard title="Rotation Awareness">
          <RotationAwareness rows={rotation.data?.rows ?? []} />
        </SectionCard>
      )}

      {/* ── Interval Awareness ───────────────────────────────────────── */}
      {interval && (
        <SectionCard title="Interval Awareness">
          <IntervalAwareness rows={interval.data?.rows ?? []} lookbackDays={metadata.lookback?.intervalDays ?? null} />
        </SectionCard>
      )}

      {/* ── Missing Intelligence ─────────────────────────────────────── */}
      {missing && (
        <SectionCard title="Missing Intelligence">
          <MissingIntelligence rows={missing.data?.rows ?? []} />
        </SectionCard>
      )}

      {/* ── Notices (combined) ───────────────────────────────────────── */}
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

// ── Chemistry Awareness body ────────────────────────────────────────────
function ChemistryAwareness({ rows }) {
  const byKey = Object.fromEntries(rows.map(r => [r[0], r[1]]))
  const frac = String(byKey['FRAC'] ?? '—')
  const hrac = String(byKey['HRAC'] ?? '—')
  const irac = String(byKey['IRAC'] ?? '—')
  const pgr  = String(byKey['PGR']  ?? '—')
  const maxRei = byKey['Max REI (hours)'] ?? '—'
  const signal = byKey['Highest signal word'] ?? '—'
  const rup    = byKey['Restricted-use present'] ?? 'No'

  return (
    <div className={styles.cardBody}>
      <ChipRow label="FRAC" values={frac} tone="frac" />
      <ChipRow label="HRAC" values={hrac} tone="hrac" />
      <ChipRow label="IRAC" values={irac} tone="irac" />
      <ChipRow label="PGR"  values={pgr}  tone="pgr"  />
      <dl className={styles.kv}>
        <KV label="Max REI"             value={maxRei !== '—' ? `${maxRei} hrs` : '—'} />
        <KV label="Highest signal word" value={String(signal)} />
        <KV label="Restricted-use"      value={String(rup)} tone={rup === 'Yes' ? 'caution' : undefined} />
      </dl>
    </div>
  )
}

// ── Rotation Awareness body ─────────────────────────────────────────────
function RotationAwareness({ rows }) {
  const byKey = Object.fromEntries(rows.map(r => [r[0], r[1]]))
  return (
    <div className={styles.cardBody}>
      <ChipRow label="Repeated FRAC" values={byKey['FRAC'] ?? '—'} tone="frac" repeat />
      <ChipRow label="Repeated HRAC" values={byKey['HRAC'] ?? '—'} tone="hrac" repeat />
      <ChipRow label="Repeated IRAC" values={byKey['IRAC'] ?? '—'} tone="irac" repeat />
      <ChipRow label="Repeated PGR"  values={byKey['PGR']  ?? '—'} tone="pgr"  repeat />
      <dl className={styles.kv}>
        <KV label="Lookback window"     value={`${byKey['Lookback (days)'] ?? '—'} days`} />
        <KV label="Sprays in window"    value={String(byKey['Sprays in window'] ?? '—')} />
        <KV label="Missing historical intelligence"
            value={String(byKey['Missing historical intel'] ?? '—')}
            tone={(Number(byKey['Missing historical intel']) || 0) > 0 ? 'warn' : undefined} />
      </dl>
    </div>
  )
}

// ── Interval Awareness body ─────────────────────────────────────────────
function IntervalAwareness({ rows, lookbackDays }) {
  // Builder shape: [kind, match, lastSeen, date, sprayName]
  // The first row may be a placeholder of dashes when there are no matches.
  const realRows = rows.filter(r => r?.[0] !== '—' && r?.[0] != null && r[0] !== '')
  if (realRows.length === 0) {
    return (
      <p className={styles.empty}>
        No matches in the last {lookbackDays ?? '—'} days.
      </p>
    )
  }
  return (
    <ul className={styles.intervalList}>
      {realRows.map((r, i) => (
        <li key={`${r[0]}-${r[1]}-${i}`} className={styles.intervalItem}>
          <span className={`${styles.intervalKind} ${r[0] === 'Group' ? styles.intervalKindGroup : styles.intervalKindProduct}`}>
            {r[0]}
          </span>
          <span className={styles.intervalMatch}>{r[1]}</span>
          <span className={styles.intervalSince}>{r[2]}</span>
          <span className={styles.intervalDate}>{r[3]}</span>
          {r[4] && r[4] !== '—' && (
            <span className={styles.intervalSpray}>{r[4]}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

// ── Missing Intelligence body ──────────────────────────────────────────
function MissingIntelligence({ rows }) {
  // Builder shape: [date, sprayName, missingCount, productCount]
  // Placeholder row when nothing is missing.
  const realRows = rows.filter(r => Number(r?.[2]) > 0)
  if (realRows.length === 0) {
    return (
      <p className={styles.empty}>
        No missing-intelligence sprays in the report range.
      </p>
    )
  }
  return (
    <ul className={styles.missingList}>
      {realRows.map((r, i) => (
        <li key={`${r[0]}-${r[1]}-${i}`} className={styles.missingItem}>
          <div className={styles.missingHeader}>
            <span className={styles.missingDate}>{r[0]}</span>
            <span className={styles.missingSpray}>{r[1]}</span>
          </div>
          <div className={styles.missingMeta}>
            <span className={styles.missingCount}>
              {r[2]} of {r[3]} could not be evaluated
            </span>
            <span className={styles.missingReason}>
              No catalog link, no imported label data, or no resolvable product intelligence.
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Shared atoms ────────────────────────────────────────────────────────
function ChipRow({ label, values, tone, repeat }) {
  const list = String(values ?? '')
    .split(',').map(s => s.trim()).filter(s => s && s !== '—')
  if (list.length === 0) return null
  return (
    <div className={styles.chipRow}>
      <span className={styles.chipRowLabel}>{label}</span>
      <span className={styles.chipRowValues}>
        {list.map(v => (
          <span
            key={v}
            className={`${styles.chip} ${styles[`chip_${tone}`] ?? ''} ${repeat ? styles.chipRepeat : ''}`}
          >
            {v}
          </span>
        ))}
      </span>
    </div>
  )
}

function KV({ label, value, tone }) {
  return (
    <div className={`${styles.kvRow} ${tone ? styles[`kv_${tone}`] ?? '' : ''}`}>
      <dt className={styles.kvLabel}>{label}</dt>
      <dd className={styles.kvValue}>{value}</dd>
    </div>
  )
}
