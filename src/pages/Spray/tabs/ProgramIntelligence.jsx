// Phase 23A — Spray Program Intelligence page.
//
// Read-only seasonal analytics view rendered as a new tab inside the
// Sprays workspace. Reads from the existing spray + label stores —
// nothing here mutates, nothing fetches new endpoints.
//
// Five sections (compact, no chart library):
//   1. Headline stats — total apps, FRAC diversity score, multi-site %,
//                       distinct FRAC codes.
//   2. FRAC usage     — horizontal bars, risk-tinted.
//   3. Family usage   — horizontal bars by AI family.
//   4. Streaks + gaps + surface usage (right column compactly).
//   5. Chronological chain + drift findings.

import { useMemo, useState } from 'react'
import { useSpraysData } from '../../../utils/sprays/spraysStore'
import { useImportedLabels } from '../../../utils/inventory/labelImportStore'
import {
  buildProgramSummary,
  filterRecordsByDateRange,
  filterRecordsBySurface,
  filterRecordsByPressure,
  filterProgramSummary,
  describeActiveFilters,
  DATE_PRESETS,
  SURFACE_OPTS,
  CHEMISTRY_TYPE_OPTS,
  PRESSURE_OPTS,
} from '../../../utils/programIntelligence'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import sprayStyles from '../Spray.module.css'
import styles from './ProgramIntelligence.module.css'

const SURFACE_LABELS = {
  greens:      'Greens',
  tees:        'Tees',
  fairways:    'Fairways',
  rough:       'Rough',
  native:      'Native',
  practice:    'Practice',
  approach:    'Approaches',
  collar:      'Collars',
  bunker:      'Bunker surrounds',
  unspecified: 'Unspecified',
}

function fmtPct(x) {
  if (x == null || Number.isNaN(x)) return '—'
  return `${Math.round(x * 100)}%`
}

function fmtScore(x) {
  if (x == null || Number.isNaN(x)) return '—'
  return x.toFixed(2)
}

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

export default function ProgramIntelligence() {
  const { records: sprayHistory, loading: sprayLoading } = useSpraysData()
  const { labels: importedLabels }                       = useImportedLabels()

  // Build the inventory-item-id → label lookup once; identical to the
  // memo BuildSpraySheet uses so the analytics see the same data.
  const labelsByItemId = useMemo(() => {
    const out = {}
    for (const lbl of importedLabels ?? []) {
      if (lbl?.inventoryItemId) out[lbl.inventoryItemId] = lbl
    }
    return out
  }, [importedLabels])

  // ── Filter state (Phase 23B) ───────────────────────────────────────────
  // Page-local — no URL/localStorage persistence yet. Default to current
  // season + everything else "all" so the page boots to the same view
  // Phase 23A shipped.
  const [filters, setFilters] = useState({
    dateRange:     'currentSeason',
    surface:       'all',
    chemistryType: 'all',
    pressure:      'all',
    customStart:   '',
    customEnd:     '',
  })
  function patchFilters(patch) {
    setFilters(prev => ({ ...prev, ...patch }))
  }

  // Filter the input records before building the summary. Order matters
  // for cost (date → surface → pressure) — date is the cheapest cut and
  // typically slices the deepest, pressure needs label lookups per row.
  const filteredRecords = useMemo(() => {
    const inDate    = filterRecordsByDateRange(sprayHistory ?? [], filters.dateRange, {
      referenceDate: TODAY_ISO(),
      customStart:   filters.customStart || null,
      customEnd:     filters.customEnd   || null,
    })
    const onSurface = filterRecordsBySurface(inDate, filters.surface)
    const byPress   = filterRecordsByPressure(onSurface, labelsByItemId, filters.pressure)
    return byPress
  }, [sprayHistory, labelsByItemId, filters.dateRange, filters.surface, filters.pressure, filters.customStart, filters.customEnd])

  // Two-stage summary pipeline: aggregate filtered records, then apply
  // the chemistry-type VIEW filter on top.
  const summary = useMemo(() => {
    const built = buildProgramSummary(filteredRecords, labelsByItemId)
    return filterProgramSummary(built, { chemistryType: filters.chemistryType })
  }, [filteredRecords, labelsByItemId, filters.chemistryType])

  const activeFilterLabel = useMemo(() => describeActiveFilters(filters), [filters])

  // Coverage hint — how many of the FILTERED records had at least one
  // label-resolved FRAC/HRAC/IRAC code. Lets the user judge whether the
  // current view's analytics are well-attributed.
  const labeledFraction = useMemo(() => {
    const total = filteredRecords.length
    if (total === 0) return { total: 0, resolved: 0, share: 0 }
    let resolved = 0
    for (const entry of summary.chain) {
      const hasCode =
        entry.codes.FRAC.length > 0 ||
        entry.codes.HRAC.length > 0 ||
        entry.codes.IRAC.length > 0
      if (hasCode) resolved += 1
    }
    return { total, resolved, share: total > 0 ? resolved / total : 0 }
  }, [filteredRecords, summary])

  // Is there ANY chemistry resolved under the current filters? Drives the
  // "no label-resolved chemistry" empty state.
  const hasResolvedChemistry =
    summary.fracUsage.length > 0 ||
    summary.hracUsage.length > 0 ||
    summary.iracUsage.length > 0

  const total = summary.totalApplications
  const fracTopApps = summary.fracUsage[0]?.applications ?? 0
  const hasAnyRecords = (sprayHistory?.length ?? 0) > 0

  return (
    <div className={sprayStyles.tabContent}>
      <WorkspaceSection
        title="Program Intelligence"
        subtitle="Seasonal chemistry analytics from logged spray applications. Read-only — no recommendations or scheduling."
      >
        {sprayLoading ? (
          <p className={styles.empty}>Loading spray history…</p>
        ) : !hasAnyRecords ? (
          <p className={styles.empty}>
            No spray applications logged yet. Commit applications from the New Application tab to populate program analytics.
          </p>
        ) : (
          <>
            {/* ── Filter strip (Phase 23B) ── */}
            <FilterStrip filters={filters} patchFilters={patchFilters} />
            {activeFilterLabel && (
              <div className={styles.activeFilterLine}>{activeFilterLabel}</div>
            )}

            {total === 0 ? (
              <p className={styles.empty}>
                No applications fall within the selected filters. Widen the date range or surface to see analytics.
              </p>
            ) : !hasResolvedChemistry ? (
              <>
                <div className={styles.statsRow}>
                  <Stat label="Total applications" value={total} sub="in range" />
                  <Stat label="With label data" value={labeledFraction.resolved} sub={fmtPct(labeledFraction.share)} />
                  <Stat label="FRAC diversity" value="—" sub="no chemistry" />
                  <Stat label="Multi-site rate" value="—" sub="no chemistry" />
                </div>
                <p className={styles.empty}>
                  No label-resolved chemistry under the current filters. Import labels via Inventory → Add Chemical to unlock FRAC/family analytics for these applications.
                </p>
              </>
            ) : (
            <>
            {/* ── Headline stats ── */}
            <div className={styles.statsRow}>
              <Stat
                label="Total applications"
                value={total}
                sub="this season"
              />
              <Stat
                label="FRAC diversity"
                value={fmtScore(summary.diversity.score)}
                sub={summary.diversity.distinctCodes != null
                  ? `${summary.diversity.distinctCodes} distinct code${summary.diversity.distinctCodes === 1 ? '' : 's'}`
                  : '—'}
              />
              <Stat
                label="Multi-site rate"
                value={fmtPct(summary.multiSite.rate)}
                sub={`${summary.multiSite.withPartner} of ${summary.multiSite.totalApplications} apps`}
              />
              <Stat
                label="Distinct FRAC"
                value={summary.fracUsage.length}
                sub="codes used"
              />
            </div>

            <div className={styles.metaLine}>
              {labeledFraction.resolved} of {labeledFraction.total} application
              {labeledFraction.total === 1 ? '' : 's'} carry resolved label data
              {' '}({fmtPct(labeledFraction.share)}). Apps without imported labels
              are counted in totals but contribute no FRAC/family signal.
            </div>

            <div className={styles.layout}>
              {/* ── Left column ── */}
              <div className={styles.column}>
                <BarCard
                  title="FRAC usage"
                  sub="apps per code"
                  entries={summary.fracUsage}
                  max={fracTopApps}
                  emptyText="No FRAC-resolved applications yet."
                />

                <BarCard
                  title="Active-ingredient families"
                  sub={summary.familyUsage.unresolvedApplications > 0
                    ? `${summary.familyUsage.unresolvedApplications} apps have no family attribution`
                    : 'apps per family'}
                  entries={summary.familyUsage.families.map(f => ({
                    code:        f.family?.name ?? f.code,
                    applications: f.applications,
                    meta:        { riskLevel: 'unknown', recognized: !!f.family },
                  }))}
                  max={summary.familyUsage.families[0]?.applications ?? 0}
                  emptyText="No family-attributable applications yet."
                />

                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Chronological MOA chain</h3>
                    <span className={styles.cardSub}>oldest → newest</span>
                  </div>
                  {summary.chain.length === 0 ? (
                    <span className={styles.empty}>No applications.</span>
                  ) : (
                    <div className={styles.chainList}>
                      {summary.chain.map((entry) => (
                        <div key={entry.id ?? `${entry.date}-${entry.area}`} className={styles.chainEntry}>
                          <span className={styles.chainDate}>{entry.dateLabel}</span>
                          <span className={styles.chainBody}>
                            <span className={styles.chainCodes}>
                              {[...entry.codes.FRAC.map(c => `F${c}`),
                                ...entry.codes.HRAC.map(c => `H${c}`),
                                ...entry.codes.IRAC.map(c => `I${c}`)
                              ].join(' · ') || '—'}
                            </span>
                            {entry.productNames.length > 0 && (
                              <>
                                {' '}<span className={styles.chainMeta}>
                                  · {entry.productNames.join(', ')}
                                </span>
                              </>
                            )}
                            {entry.area && (
                              <>
                                {' '}<span className={styles.chainMeta}>· {entry.area}</span>
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Right column ── */}
              <div className={styles.column}>
                <DiversityCard diversity={summary.diversity} />

                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Longest MOA streaks</h3>
                    <span className={styles.cardSub}>per surface</span>
                  </div>
                  {summary.longestFracStreaks.filter(s => s.streak >= 2).length === 0 ? (
                    <span className={styles.empty}>No consecutive-application streaks ≥ 2.</span>
                  ) : (
                    <div className={styles.streakList}>
                      {summary.longestFracStreaks
                        .filter(s => s.streak >= 2)
                        .slice(0, 6)
                        .map(s => (
                          <div key={`${s.code}-${s.surface}`} className={styles.streakRow}>
                            <span className={styles.streakLabel}>
                              FRAC {s.code}
                              {s.meta?.recognized ? ` · ${s.meta.name}` : ''}
                            </span>
                            <span className={styles.streakDetail}>
                              {s.streak} in a row · {SURFACE_LABELS[s.surface] ?? s.surface}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Surface usage</h3>
                  </div>
                  {summary.surfaceUsage.surfaces.length === 0 ? (
                    <span className={styles.empty}>No applications.</span>
                  ) : (
                    <div className={styles.barList}>
                      {summary.surfaceUsage.surfaces.map(s => (
                        <div key={s.surface} className={styles.barRow}>
                          <span className={styles.barLabel}>
                            {SURFACE_LABELS[s.surface] ?? s.surface}
                          </span>
                          <span className={styles.barTrack}>
                            <span
                              className={styles.barFill}
                              data-risk="unknown"
                              style={{ width: `${total > 0 ? (s.applications / total) * 100 : 0}%` }}
                            />
                          </span>
                          <span className={styles.barValue}>{s.applications}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Program drift</h3>
                    <span className={styles.cardSub}>informational only</span>
                  </div>
                  {summary.drift.length === 0 ? (
                    <span className={styles.empty}>No drift findings.</span>
                  ) : (
                    <div className={styles.findingList}>
                      {summary.drift.map((f, i) => (
                        <div key={`${f.code}-${i}`} className={styles.finding} data-severity={f.severity}>
                          <span className={styles.findingTitle}>{f.title}</span>
                          <span className={styles.findingDetail}>{f.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            </>
            )}
          </>
        )}
      </WorkspaceSection>
    </div>
  )
}

// ── Small subcomponents ───────────────────────────────────────────────

function FilterStrip({ filters, patchFilters }) {
  return (
    <div className={styles.filterStrip}>
      <FilterSelect
        label="Date range"
        value={filters.dateRange}
        options={DATE_PRESETS}
        onChange={v => patchFilters({ dateRange: v })}
      />
      {filters.dateRange === 'custom' && (
        <>
          <FilterDate
            label="From"
            value={filters.customStart}
            onChange={v => patchFilters({ customStart: v })}
          />
          <FilterDate
            label="To"
            value={filters.customEnd}
            onChange={v => patchFilters({ customEnd: v })}
          />
        </>
      )}
      <FilterSelect
        label="Surface"
        value={filters.surface}
        options={SURFACE_OPTS}
        onChange={v => patchFilters({ surface: v })}
      />
      <FilterSelect
        label="Chemistry"
        value={filters.chemistryType}
        options={CHEMISTRY_TYPE_OPTS}
        onChange={v => patchFilters({ chemistryType: v })}
      />
      <FilterSelect
        label="Pressure"
        value={filters.pressure}
        options={PRESSURE_OPTS}
        onChange={v => patchFilters({ pressure: v })}
      />
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className={styles.filterField}>
      <span className={styles.filterLabel}>{label}</span>
      <select
        className={styles.filterControl}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

function FilterDate({ label, value, onChange }) {
  return (
    <label className={styles.filterField}>
      <span className={styles.filterLabel}>{label}</span>
      <input
        type="date"
        className={styles.filterControl}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  )
}

function BarCard({ title, sub, entries, max, emptyText }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{title}</h3>
        {sub && <span className={styles.cardSub}>{sub}</span>}
      </div>
      {entries.length === 0 ? (
        <span className={styles.empty}>{emptyText}</span>
      ) : (
        <div className={styles.barList}>
          {entries.slice(0, 8).map(e => {
            const risk = e.meta?.riskLevel ?? 'unknown'
            const pct  = max > 0 ? (e.applications / max) * 100 : 0
            return (
              <div key={e.code} className={styles.barRow}>
                <span className={styles.barLabel}>{e.code}</span>
                <span className={styles.barTrack}>
                  <span
                    className={styles.barFill}
                    data-risk={risk}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className={styles.barValue}>{e.applications}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DiversityCard({ diversity }) {
  const v = diversity.score
  const pct = v == null ? 0 : Math.max(0, Math.min(100, v * 100))
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>FRAC diversity score</h3>
        <span className={styles.cardSub}>Shannon entropy · 0–1</span>
      </div>
      <span className={styles.diversityValue}>{fmtScore(v)}</span>
      <div className={styles.diversityBar}>
        <span className={styles.diversityBarFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.metaLine}>
        {diversity.distinctCodes != null
          ? `${diversity.distinctCodes} distinct FRAC code${diversity.distinctCodes === 1 ? '' : 's'} across ${diversity.totalApplications} application${diversity.totalApplications === 1 ? '' : 's'}.`
          : 'Score unavailable — no FRAC-resolved applications yet.'}
      </span>
    </div>
  )
}

