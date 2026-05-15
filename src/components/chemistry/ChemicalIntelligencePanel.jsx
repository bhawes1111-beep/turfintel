// Phase 22B — Chemical Intelligence panel.
//
// Consumes the Phase 22A analyzeSprayDraft() result and renders a compact
// summary inside the Spray Builder Tank Summary aside. Three concerns:
//
//   1. Detected codes — one chip per FRAC/HRAC/IRAC group present in the
//      tank, color-coded by resistance risk from chemistryMetadata.
//   2. Warning lines — duplicate active ingredients, same-tank stacked
//      MOAs, repeated MOAs from recent history. Informational only —
//      never blocks save, never requires acknowledgment.
//   3. Positive intelligence — calls out low-risk multi-site partners
//      (e.g. FRAC M5) and MOA diversity when the tank looks healthy.
//
// All inputs arrive pre-computed via the `analysis` prop so the panel
// has no fetching or state. The wrapper in BuildSpraySheet does the data
// assembly + memoization.

import { useMemo } from 'react'
import { lookupGroup, RESISTANCE_RISK } from '../../utils/chemistry/chemistryMetadata.js'
import { highestSeverity, SEVERITY } from '../../utils/chemistry/chemistryWarnings.js'
import styles from './ChemicalIntelligencePanel.module.css'

// ── Per-warning severity → badge label mapping ──────────────────────────
const SEV_LABELS = {
  [SEVERITY.INFO]: 'Info',
  [SEVERITY.WARN]: 'Caution',
  [SEVERITY.HIGH]: 'High',
}

const RISK_LABELS = {
  [RESISTANCE_RISK.LOW]:     'low risk',
  [RESISTANCE_RISK.MEDIUM]:  'medium risk',
  [RESISTANCE_RISK.HIGH]:    'high risk',
  [RESISTANCE_RISK.UNKNOWN]: 'risk unknown',
}

// Codes considered "good rotation partners" — multi-site contact MOAs
// with documented low resistance risk. Used to surface positive
// intelligence when present in a tank.
const MULTI_SITE_GOOD_PARTNERS = new Set(['M3', 'M5', '29'])

/**
 * @typedef {Object} ChemIntelProps
 * @property {ReturnType<typeof import('../../utils/chemistry').analyzeSprayDraft>} analysis
 * @property {number} tankProductCount   — total products in the current tank
 * @property {number} labeledProductCount — how many of those have label data
 */

export default function ChemicalIntelligencePanel({
  analysis,
  tankProductCount = 0,
  labeledProductCount = 0,
}) {
  // ── Roll up the detected codes (with risk) for the chip strip ─────────
  const chips = useMemo(() => {
    if (!analysis?.summary?.tankCodes) return []
    const { tankCodes } = analysis.summary
    const out = []
    for (const type of /** @type {const} */ (['FRAC', 'HRAC', 'IRAC'])) {
      for (const entry of tankCodes[type]) {
        const meta = lookupGroup(type, entry.code)
        out.push({
          key:   `${type}-${entry.code}`,
          type,
          code:  entry.code,
          risk:  meta.riskLevel,
          name:  meta.name,
          shared: entry.products.length >= 2,
          sharedCount: entry.products.length,
        })
      }
    }
    return out
  }, [analysis])

  // ── Positive-intelligence findings ────────────────────────────────────
  // These are derived from the same `summary` the analyzer produces, but
  // they intentionally don't appear in `warnings` (positive findings are
  // not warnings). We synthesize them here so the UI can render them
  // alongside warnings without polluting the warning-severity roll-up.
  const positives = useMemo(() => {
    const out = []
    if (chips.length === 0) return out

    // Multi-site partner present?
    const fracCodes = chips.filter(c => c.type === 'FRAC').map(c => c.code)
    const partner   = fracCodes.find(c => MULTI_SITE_GOOD_PARTNERS.has(c))
    if (partner) {
      out.push({
        key:    `partner-${partner}`,
        title:  `Multi-site partner present (FRAC ${partner})`,
        detail: 'Tank includes a low-resistance-risk multi-site contact fungicide — good rotation hygiene.',
      })
    }

    // MOA diversity — 2+ distinct FRAC codes, with at least one not
    // overlapping the others' products.
    const fracEntries = analysis?.summary?.tankCodes?.FRAC ?? []
    if (fracEntries.length >= 2) {
      const allShared = fracEntries.every(e => e.products.length >= 2)
      if (!allShared) {
        out.push({
          key:    'moa-diversity',
          title:  `MOA diversity: ${fracEntries.length} distinct FRAC codes`,
          detail: 'Tank spans multiple fungicide modes of action — supports resistance stewardship.',
        })
      }
    }
    return out
  }, [chips, analysis])

  // ── Header state ──────────────────────────────────────────────────────
  const warnings = analysis?.warnings ?? []
  const topSeverity = highestSeverity(warnings)
  // Headline severity: warning roll-up if any, else "good" when there's
  // at least one detected code AND no warnings, else null (no codes yet).
  const headlineSeverity =
    topSeverity ?? (chips.length > 0 ? 'good' : null)

  const headlineLabel = topSeverity
    ? `${SEV_LABELS[topSeverity]} · ${warnings.length}`
    : chips.length > 0
      ? 'Clear'
      : null

  // ── Empty / missing-data states ───────────────────────────────────────
  if (tankProductCount === 0) {
    return (
      <div className={styles.panel}>
        <span className={styles.missingState}>
          Add products to the tank to see chemistry intelligence.
        </span>
      </div>
    )
  }

  if (labeledProductCount === 0) {
    return (
      <div className={styles.panel}>
        <span className={styles.missingState}>
          Label data missing for tank products. Import labels via Inventory → Add Chemical to unlock MOA, resistance-risk, and rotation analysis.
        </span>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      {/* ── Header — highest severity badge + chips ── */}
      <div className={styles.headerRow}>
        <span className={styles.warningTitle}>Chemistry signal</span>
        {headlineSeverity && headlineLabel && (
          <span className={styles.badge} data-severity={headlineSeverity}>
            {headlineLabel}
          </span>
        )}
      </div>

      {/* ── Detected code chips ── */}
      {chips.length > 0 && (
        <div className={styles.codeChipRow}>
          {chips.map(c => (
            <span
              key={c.key}
              className={styles.codeChip}
              data-risk={c.risk}
              title={c.name
                ? `${c.type} ${c.code} — ${c.name} (${RISK_LABELS[c.risk]})${c.shared ? ` · in ${c.sharedCount} tank products` : ''}`
                : `${c.type} ${c.code} — uncategorized code`}
            >
              <span className={styles.codeChipType}>{c.type}</span>
              {c.code}
              <span className={styles.codeChipRisk} data-risk={c.risk}>
                {RISK_LABELS[c.risk]}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* ── Warnings ── */}
      {warnings.length > 0 && (
        <div className={styles.warningList}>
          {warnings.map((w, i) => (
            <div key={`${w.code}-${i}`} className={styles.warning} data-severity={w.severity}>
              <span className={styles.warningTitle}>{w.title}</span>
              <span className={styles.warningDetail}>{w.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Positive intelligence ── */}
      {positives.length > 0 && (
        <div className={styles.warningList}>
          {positives.map(p => (
            <div key={p.key} className={styles.warning} data-severity="good">
              <span className={styles.warningTitle}>{p.title}</span>
              <span className={styles.warningDetail}>{p.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Clean-state callout when no warnings ── */}
      {warnings.length === 0 && chips.length > 0 && positives.length === 0 && (
        <div className={styles.cleanState}>
          No resistance-management concerns found for this tank.
        </div>
      )}

      {/* ── Footer meta — coverage hint ── */}
      <span className={styles.metaLine}>
        {labeledProductCount} of {tankProductCount} tank product{tankProductCount === 1 ? '' : 's'} have label data
        {analysis?.summary?.area
          ? ` · history scoped to ${analysis.summary.area}, last ${analysis.summary.lookbackDays}d`
          : ` · history across all areas, last ${analysis?.summary?.lookbackDays ?? 21}d`}
      </span>
    </div>
  )
}
