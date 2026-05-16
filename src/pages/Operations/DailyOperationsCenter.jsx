// Phase 24A — Daily Operations Center.
//
// Operational morning-review workflow. Five compact sections in a 2-col
// responsive grid:
//
//   A. Weather + Course Status     useWeather() + local cart-status pill +
//                                  a 1-line superintendent note (local)
//   B. Crew Snapshot               useCrewData() + useAssignmentsData()
//   C. Spray Operations            useSpraysData() + useCalendarData()
//   D. Equipment Alerts            useEquipmentData()
//   E. Operational Priorities      local-only ordered checklist
//
// Read-only over existing stores — the page never writes to the worker.
// Cart status / note / priorities are persisted to localStorage under
// course-scoped keys so each course keeps its own state.
//
// No DB migration, no worker change, no AI.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeather } from '../../utils/weather/useWeather'
import { useCrewData } from '../../utils/crew/crewStore'
import { useAssignmentsData } from '../../utils/assignments/assignmentsStore'
import { useEquipmentData } from '../../utils/equipment/equipmentStore'
import { useCalendarData } from '../../utils/calendar/calendarStore'
import { useSpraysData } from '../../utils/sprays/spraysStore'
import { useSelectedCourse } from '../../utils/courses/courseStore'
import { useToast } from '../../utils/feedback/toastContext'
import { buildAttentionItems, highestAttentionSeverity } from '../../utils/operations/attentionEngine'
import { buildRoutingItems, highestRoutingSeverity } from '../../utils/operations/routingAwareness'
import { buildOperationalTimeline } from '../../utils/operations/operationalTimeline'
import {
  buildMorningBrief,
  buildBriefCsvRows,
  defaultBriefFilename,
} from '../../utils/operations/morningBrief'
import {
  serializeCsv,
  downloadBlob,
  copyToClipboard,
} from '../../utils/programIntelligence'
import WorkspaceSection from '../../components/shared/WorkspaceSection'
import styles from './DailyOperationsCenter.module.css'

const TODAY = () => new Date().toISOString().slice(0, 10)

const CART_OPTIONS = [
  { value: 'open',          label: 'Open',           tone: 'info' },
  { value: 'cart-path-only', label: 'Cart-path only', tone: 'warn' },
  { value: 'walking-only',  label: 'Walking only',   tone: 'warn' },
  { value: 'closed',        label: 'Closed',         tone: 'high' },
]

function fmtNum(v, suffix = '') {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `${Math.round(Number(v) * 10) / 10}${suffix}`
}

function fmtWind(current) {
  if (!current) return '—'
  const mph = current.wind
  if (mph == null) return '—'
  const dir = current.windDir ? ` ${current.windDir}` : ''
  return `${Math.round(mph)} mph${dir}`
}

function safeJsonParse(text, fallback) {
  try {
    const v = JSON.parse(text)
    return v == null ? fallback : v
  } catch {
    return fallback
  }
}

/**
 * Local-storage hook scoped by a key. Reads on mount, writes on change.
 * No cross-tab sync — this is a single-superintendent morning workflow.
 */
function useLocalState(key, initial) {
  const [value, setValue] = useState(() => {
    if (typeof localStorage === 'undefined' || !key) return initial
    const raw = localStorage.getItem(key)
    if (raw == null) return initial
    return safeJsonParse(raw, initial)
  })
  useEffect(() => {
    if (typeof localStorage === 'undefined' || !key) return
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
  }, [key, value])
  return [value, setValue]
}

export default function DailyOperationsCenter() {
  const navigate = useNavigate()
  const selectedCourse = useSelectedCourse()
  const toast = useToast()
  const courseId = selectedCourse?.id ?? 'default'

  // ── Data sources ──────────────────────────────────────────────────────
  const weather                          = useWeather()
  const { employees: crewEmployees }     = useCrewData()
  const { assignments, reservations }    = useAssignmentsData()
  const { equipment, serviceLog }        = useEquipmentData()
  const { events: calendarEvents }       = useCalendarData()
  const { records: sprayRecords }        = useSpraysData()

  // ── Local-only state (course-scoped) ──────────────────────────────────
  const [cartStatus, setCartStatus] = useLocalState(`turfintel:ops:cart:${courseId}`, 'open')
  const [todayNote,  setTodayNote]  = useLocalState(`turfintel:ops:note:${courseId}`, '')
  const [priorities, setPriorities] = useLocalState(`turfintel:ops:priorities:${courseId}`, [])
  const [newPriority, setNewPriority] = useState('')

  // ── Derived data ──────────────────────────────────────────────────────
  const today = TODAY()

  // Weather indicators — rain / frost / wind chips based on the current
  // bundle. Conservative thresholds; non-data states render no chip.
  const weatherChips = useMemo(() => {
    const c = weather.current
    if (!c) return []
    const out = []
    if (c.rainfall24h != null && c.rainfall24h >= 0.5) {
      out.push({ label: `Rain ${c.rainfall24h.toFixed(2)}″ / 24h`, tone: 'warn' })
    }
    if (c.currentTemp != null && c.currentTemp <= 33) {
      out.push({ label: 'Frost risk', tone: 'high' })
    } else if (c.currentTemp != null && c.currentTemp <= 40) {
      out.push({ label: 'Cool start', tone: 'info' })
    }
    if (c.wind != null && c.wind >= 15) {
      out.push({ label: 'High wind', tone: 'high' })
    } else if (c.wind != null && c.wind >= 8) {
      out.push({ label: 'Breezy', tone: 'warn' })
    }
    return out
  }, [weather.current])

  // Today's planned crew assignments — drives the "scheduled today" stat.
  const crewSnapshot = useMemo(() => {
    const todayAssignments = (assignments ?? []).filter(a => a?.date === today)
    const assignedIds = new Set(
      todayAssignments
        .map(a => a?.employeeId ?? a?.employee_id ?? a?.assigneeId)
        .filter(Boolean),
    )
    const activeEmployees = (crewEmployees ?? []).filter(e => e?.status !== 'inactive')
    const scheduled = activeEmployees.filter(e => assignedIds.has(e.id ?? e.employeeId))
    const unassigned = activeEmployees.length - scheduled.length
    return {
      scheduled:    scheduled.length,
      assignments:  todayAssignments.length,
      unassigned:   Math.max(0, unassigned),
      activeTotal:  activeEmployees.length,
    }
  }, [assignments, crewEmployees, today])

  // Spray-related calendar events from today onward (3-day window).
  const spraySchedule = useMemo(() => {
    const windowEnd = (() => {
      const d = new Date(today)
      d.setDate(d.getDate() + 3)
      return d.toISOString().slice(0, 10)
    })()
    const upcoming = (calendarEvents ?? [])
      .filter(e => e?.category === 'spray' && e?.date >= today && e?.date <= windowEnd)
      .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
      .slice(0, 5)
    const todayCount = upcoming.filter(e => e.date === today).length
    // Pending = spray_records with explicit pending/planned status.
    const pendingRecords = (sprayRecords ?? []).filter(r => {
      const s = String(r?.status ?? '').toLowerCase()
      return s === 'pending' || s === 'planned'
    })
    return {
      upcoming,
      todayCount,
      pending: pendingRecords.length,
    }
  }, [calendarEvents, sprayRecords, today])

  // Equipment alerts — out-of-service, overdue maintenance, double-booked
  // reservations on the same date.
  const equipmentAlerts = useMemo(() => {
    const oos = (equipment ?? []).filter(e => {
      const s = String(e?.status ?? '').toLowerCase()
      return s === 'out-of-service' || s === 'oos' || s === 'down'
    })
    const overdue = (equipment ?? []).filter(e => {
      const due = e?.nextServiceDate ?? e?.next_service_date
      return typeof due === 'string' && due !== '' && due < today
    })
    // Reservation conflicts: same equipment + same date with 2+ rows.
    const byKey = new Map()
    for (const r of reservations ?? []) {
      const k = `${r?.equipmentId ?? r?.equipment_id ?? ''}|${r?.date ?? ''}`
      if (!k.startsWith('|')) byKey.set(k, (byKey.get(k) ?? 0) + 1)
    }
    let conflicts = 0
    for (const count of byKey.values()) if (count > 1) conflicts += 1
    return {
      outOfService: oos.length,
      overdue:      overdue.length,
      conflicts,
    }
  }, [equipment, reservations, today])

  // ── Attention rollup (Phase 24B) ──────────────────────────────────────
  // Pure transform over the snapshots above. Re-runs only when one of its
  // inputs changes; the engine itself never reads stores or React state.
  const attentionItems = useMemo(() => buildAttentionItems({
    weather:         { current: weather.current },
    crewSnapshot,
    spraySchedule,
    equipmentAlerts,
    cartStatus,
    priorityCount:   priorities.length,
  }), [weather.current, crewSnapshot, spraySchedule, equipmentAlerts, cartStatus, priorities.length])

  // ── Routing context (Phase 25A) ───────────────────────────────────────
  // Today's calendar events drive the routing detectors: they carry
  // priority, location/tags, assignedStaff[], and equipment[] — all the
  // structure needed for the eight routing signals.
  const calendarEventsToday = useMemo(() => {
    return (calendarEvents ?? []).filter(ev => ev?.date === today)
  }, [calendarEvents, today])

  const oosEquipmentNames = useMemo(() => {
    return (equipment ?? [])
      .filter(eq => {
        const s = String(eq?.status ?? '').toLowerCase()
        return s === 'out-of-service' || s === 'oos' || s === 'down'
      })
      .map(eq => eq?.name)
      .filter(Boolean)
  }, [equipment])

  const routingItems = useMemo(() => buildRoutingItems({
    weatherCurrent:     weather.current,
    calendarEventsToday,
    oosEquipmentNames,
  }), [weather.current, calendarEventsToday, oosEquipmentNames])

  // Merge routing items into the Needs Attention rollup. De-dupe by code
  // (routing-* codes are distinct from attention-* codes by design, so
  // both lenses get to appear — but a future overlap won't double-render).
  const mergedAttentionItems = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const it of attentionItems) {
      if (seen.has(it.code)) continue
      seen.add(it.code)
      out.push(it)
    }
    for (const it of routingItems) {
      if (seen.has(it.code)) continue
      seen.add(it.code)
      out.push(it)
    }
    const SEV_ORDER = { high: 2, warn: 1, info: 0 }
    out.sort((a, b) => (SEV_ORDER[b.severity] ?? -1) - (SEV_ORDER[a.severity] ?? -1))
    return out
  }, [attentionItems, routingItems])

  const attentionSeverity = highestAttentionSeverity(mergedAttentionItems)
  const routingSeverity   = highestRoutingSeverity(routingItems)

  // ── Operational Timeline (Phase 25B) ──────────────────────────────────
  // Deterministic, chronologically-sorted view of how the day is expected
  // to unfold. Pure transform — feeds in the same data the rollups above
  // already render so the visual matches.
  const timelineItems = useMemo(() => buildOperationalTimeline({
    weatherCurrent:      weather.current,
    calendarEventsToday,
    equipmentAlerts,
    priorities,
    attentionItems,
    routingItems,
  }), [weather.current, calendarEventsToday, equipmentAlerts, priorities, attentionItems, routingItems])

  // ── Morning Brief (Phase 24C) ─────────────────────────────────────────
  // Pure transform over the snapshots above. Reuses the same data the
  // page renders, so what the superintendent sees on screen matches the
  // brief they print / copy / export.
  const brief = useMemo(() => buildMorningBrief({
    weatherCurrent:  weather.current,
    cartStatus,
    todayNote,
    crewSnapshot,
    spraySchedule,
    equipmentAlerts,
    priorities,
    attentionItems,
  }, {
    courseName:  selectedCourse?.shortName ?? selectedCourse?.name ?? null,
    generatedAt: today,
  }), [
    weather.current, cartStatus, todayNote, crewSnapshot, spraySchedule,
    equipmentAlerts, priorities, attentionItems, selectedCourse, today,
  ])

  function handlePrintBrief() {
    if (typeof window !== 'undefined') window.print()
  }

  async function handleCopyBrief() {
    const ok = await copyToClipboard(brief.textVersion)
    if (ok) toast?.success?.('Morning Brief copied to clipboard')
    else    toast?.error?.('Copy failed — your browser blocked clipboard access')
  }

  function handleExportBriefCsv() {
    const { headers, rows } = buildBriefCsvRows(brief)
    if (rows.length === 0) {
      toast?.info?.('Nothing to export — the brief is empty.')
      return
    }
    const text = serializeCsv({ headers, rows })
    const filename = defaultBriefFilename({
      courseName:  brief.courseName,
      generatedAt: brief.generatedAt,
    })
    downloadBlob(filename, 'text/csv;charset=utf-8', text)
  }

  // ── Priority handlers ─────────────────────────────────────────────────
  function addPriority() {
    const text = newPriority.trim()
    if (!text) return
    setPriorities(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, done: false },
    ])
    setNewPriority('')
  }

  function toggleDone(id) {
    setPriorities(prev => prev.map(p => p.id === id ? { ...p, done: !p.done } : p))
  }

  function removePriority(id) {
    setPriorities(prev => prev.filter(p => p.id !== id))
  }

  function move(id, dir) {
    setPriorities(prev => {
      const i = prev.findIndex(p => p.id === id)
      if (i === -1) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <WorkspaceSection
      title="Daily Operations Center"
      subtitle="Morning command view — weather, crew, sprays, equipment, and today's priorities at a glance."
    >
      <div className={styles.shell} data-print-region="ops-brief">

        {/* ── Print-only Morning Brief block (Phase 24C) ── */}
        <PrintableBrief brief={brief} />

        {/* ── Header row ── */}
        <div className={styles.headerRow}>
          <div className={styles.headerMeta}>
            <span>Today: <strong>{today}</strong></span>
            {selectedCourse?.name && <span>· {selectedCourse.shortName ?? selectedCourse.name}</span>}
          </div>
          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={handlePrintBrief}
              title="Open browser print dialog (print-friendly Morning Brief layout)"
            >
              Print Brief
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={handleCopyBrief}
              title="Copy the plain-text Morning Brief to clipboard"
            >
              Copy Brief
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={handleExportBriefCsv}
              title="Download the Morning Brief as a CSV file"
            >
              Export CSV
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              data-tone="primary"
              onClick={() => navigate('/display-board')}
              title="Open the Display Board for crew TV / tablet view"
            >
              Generate Display Board
            </button>
          </div>
        </div>

        {/* ── Needs Attention rollup (Phase 24B + 25A routing) ── */}
        <div className={styles.attentionCard} data-severity={attentionSeverity ?? 'clear'}>
          <div className={styles.attentionHeader}>
            <h3 className={styles.cardTitle}>Needs Attention</h3>
            <span className={styles.cardSub}>
              {mergedAttentionItems.length === 0
                ? 'All clear · informational only'
                : `${mergedAttentionItems.length} item${mergedAttentionItems.length === 1 ? '' : 's'} · informational only`}
            </span>
          </div>
          {mergedAttentionItems.length === 0 ? (
            <span className={styles.attentionClear}>
              Nothing requires attention right now. Weather, crew, sprays, equipment, routing, and priorities all look operational.
            </span>
          ) : (
            <div className={styles.attentionList}>
              {mergedAttentionItems.map((it, i) => {
                const act = it.action ?? it.quickAction ?? null
                return (
                  <div
                    key={`${it.code}-${i}`}
                    className={styles.attentionRow}
                    data-severity={it.severity}
                  >
                    <div className={styles.attentionBody}>
                      <span className={styles.attentionTitle}>{it.title}</span>
                      <span className={styles.attentionDetail}>{it.detail}</span>
                    </div>
                    {act && (
                      <button
                        type="button"
                        className={styles.attentionAction}
                        onClick={() => navigate(act.route)}
                      >
                        {act.label} →
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Operational Routing (Phase 25A) ── */}
        {routingItems.length > 0 && (
          <div className={styles.routingCard} data-severity={routingSeverity ?? 'clear'}>
            <div className={styles.attentionHeader}>
              <h3 className={styles.cardTitle}>Operational Routing</h3>
              <span className={styles.cardSub}>
                {routingItems.length} routing impact{routingItems.length === 1 ? '' : 's'} · informational
              </span>
            </div>
            <div className={styles.attentionList}>
              {routingItems.map((it, i) => {
                const act = it.quickAction ?? it.action ?? null
                return (
                  <div
                    key={`${it.code}-${i}`}
                    className={styles.attentionRow}
                    data-severity={it.severity}
                  >
                    <div className={styles.attentionBody}>
                      <span className={styles.attentionTitle}>{it.title}</span>
                      <span className={styles.attentionDetail}>{it.detail}</span>
                    </div>
                    {act && (
                      <button
                        type="button"
                        className={styles.attentionAction}
                        onClick={() => navigate(act.route)}
                      >
                        {act.label} →
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Operational Timeline (Phase 25B) ── */}
        <div className={styles.timelineCard}>
          <div className={styles.attentionHeader}>
            <h3 className={styles.cardTitle}>Operational Timeline</h3>
            <span className={styles.cardSub}>
              {timelineItems.length === 0
                ? 'Quiet day · no anchored events'
                : `${timelineItems.length} entr${timelineItems.length === 1 ? 'y' : 'ies'} · informational`}
            </span>
          </div>
          {timelineItems.length === 0 ? (
            <span className={styles.attentionClear}>
              Nothing to anchor to the day yet. Schedule applications or add priorities to populate the timeline.
            </span>
          ) : (
            <div className={styles.timelineList}>
              {timelineItems.map((it, i) => (
                <div
                  key={`${it.sourceCode}-${i}`}
                  className={styles.timelineRow}
                  data-severity={it.severity}
                >
                  <span className={styles.timelineTime}>{it.time}</span>
                  <span className={styles.timelineCategory} data-category={it.category}>
                    {it.category}
                  </span>
                  <span className={styles.timelineBody}>
                    <span className={styles.attentionTitle}>{it.title}</span>
                    <span className={styles.attentionDetail}>{it.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Grid ── */}
        <div className={styles.grid}>

          {/* A. Weather + course status (wide) */}
          <div className={`${styles.card} ${styles.gridWide}`}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Weather + Course Status</h3>
              <button
                type="button"
                className={styles.cardLink}
                onClick={() => navigate('/weather')}
              >Open Weather →</button>
            </div>
            <div className={styles.weatherStats}>
              <div className={styles.weatherStat}>
                <span className={styles.weatherStatLabel}>Temp</span>
                <span className={styles.weatherStatValue}>{fmtNum(weather.current?.currentTemp, '°F')}</span>
              </div>
              <div className={styles.weatherStat}>
                <span className={styles.weatherStatLabel}>Wind</span>
                <span className={styles.weatherStatValue}>{fmtWind(weather.current)}</span>
              </div>
              <div className={styles.weatherStat}>
                <span className={styles.weatherStatLabel}>Humidity</span>
                <span className={styles.weatherStatValue}>{fmtNum(weather.current?.humidity, '%')}</span>
              </div>
              <div className={styles.weatherStat}>
                <span className={styles.weatherStatLabel}>Rain 24h</span>
                <span className={styles.weatherStatValue}>{weather.current?.rainfall24h != null
                  ? `${weather.current.rainfall24h.toFixed(2)}″`
                  : '—'}</span>
              </div>
            </div>
            {weatherChips.length > 0 && (
              <div className={styles.indicatorRow}>
                {weatherChips.map((c, i) => (
                  <span key={i} className={styles.indicator} data-tone={c.tone}>{c.label}</span>
                ))}
              </div>
            )}
            <div className={styles.cartRow}>
              <span className={styles.cartLabel}>Course</span>
              {CART_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  className={styles.cartPill}
                  data-tone={o.tone}
                  aria-pressed={cartStatus === o.value}
                  onClick={() => setCartStatus(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <textarea
              className={styles.noteInput}
              value={todayNote}
              onChange={e => setTodayNote(e.target.value)}
              placeholder="Today summary — superintendent notes (stored locally)…"
              rows={2}
            />
          </div>

          {/* B. Crew snapshot */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Crew Snapshot</h3>
              <button
                type="button"
                className={styles.cardLink}
                onClick={() => navigate('/crew/assignments')}
              >Open Assignments →</button>
            </div>
            <div className={styles.miniStats}>
              <div className={styles.miniStat}>
                <span className={styles.miniStatLabel}>Scheduled</span>
                <span className={styles.miniStatValue}>{crewSnapshot.scheduled}</span>
              </div>
              <div className={styles.miniStat}>
                <span className={styles.miniStatLabel}>Tasks today</span>
                <span className={styles.miniStatValue}>{crewSnapshot.assignments}</span>
              </div>
              <div className={styles.miniStat}>
                <span className={styles.miniStatLabel}>Unassigned</span>
                <span
                  className={styles.miniStatValue}
                  data-tone={crewSnapshot.unassigned >= Math.max(1, Math.ceil(crewSnapshot.activeTotal / 3)) ? 'warn' : undefined}
                >{crewSnapshot.unassigned}</span>
              </div>
            </div>
            <span className={styles.cardSub}>
              {crewSnapshot.activeTotal === 0
                ? 'No active crew members configured yet.'
                : `${crewSnapshot.activeTotal} active crew member${crewSnapshot.activeTotal === 1 ? '' : 's'} total.`}
            </span>
          </div>

          {/* C. Spray operations */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Spray Operations</h3>
              <button
                type="button"
                className={styles.cardLink}
                onClick={() => navigate('/spray')}
              >Open Sprays →</button>
            </div>
            <div className={styles.miniStats}>
              <div className={styles.miniStat}>
                <span className={styles.miniStatLabel}>Today</span>
                <span className={styles.miniStatValue}>{spraySchedule.todayCount}</span>
              </div>
              <div className={styles.miniStat}>
                <span className={styles.miniStatLabel}>Upcoming 3d</span>
                <span className={styles.miniStatValue}>{spraySchedule.upcoming.length}</span>
              </div>
              <div className={styles.miniStat}>
                <span className={styles.miniStatLabel}>Pending</span>
                <span
                  className={styles.miniStatValue}
                  data-tone={spraySchedule.pending > 0 ? 'warn' : undefined}
                >{spraySchedule.pending}</span>
              </div>
            </div>
            {spraySchedule.upcoming.length === 0 ? (
              <span className={styles.empty}>No spray events in the next 3 days.</span>
            ) : (
              <div>
                {spraySchedule.upcoming.map(ev => (
                  <div key={ev.id} className={styles.listRow}>
                    <span className={styles.listRowLabel}>
                      {ev.title || ev.location || 'Spray application'}
                    </span>
                    <span className={styles.listRowMeta}>
                      {ev.date}{ev.startTime ? ` · ${ev.startTime}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* D. Equipment alerts */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Equipment Alerts</h3>
              <button
                type="button"
                className={styles.cardLink}
                onClick={() => navigate('/equipment')}
              >Open Equipment →</button>
            </div>
            <div className={styles.miniStats}>
              <div className={styles.miniStat}>
                <span className={styles.miniStatLabel}>Out of service</span>
                <span
                  className={styles.miniStatValue}
                  data-tone={equipmentAlerts.outOfService > 0 ? 'high' : undefined}
                >{equipmentAlerts.outOfService}</span>
              </div>
              <div className={styles.miniStat}>
                <span className={styles.miniStatLabel}>Overdue mx</span>
                <span
                  className={styles.miniStatValue}
                  data-tone={equipmentAlerts.overdue > 0 ? 'warn' : undefined}
                >{equipmentAlerts.overdue}</span>
              </div>
              <div className={styles.miniStat}>
                <span className={styles.miniStatLabel}>Conflicts</span>
                <span
                  className={styles.miniStatValue}
                  data-tone={equipmentAlerts.conflicts > 0 ? 'warn' : undefined}
                >{equipmentAlerts.conflicts}</span>
              </div>
            </div>
            <span className={styles.cardSub}>
              {(equipmentAlerts.outOfService + equipmentAlerts.overdue + equipmentAlerts.conflicts) === 0
                ? 'No equipment alerts.'
                : 'Review flagged items before crew dispatch.'}
            </span>
          </div>

          {/* E. Operational priorities (wide) */}
          <div className={`${styles.card} ${styles.gridWide}`}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Operational Priorities</h3>
              <span className={styles.cardSub}>{priorities.length} item{priorities.length === 1 ? '' : 's'} · stored locally per course</span>
            </div>

            {priorities.length === 0 ? (
              <span className={styles.empty}>No priorities yet — add the first item below.</span>
            ) : (
              <div className={styles.priorityList}>
                {priorities.map((p, i) => (
                  <div key={p.id} className={styles.priorityRow} data-done={p.done ? 'true' : 'false'}>
                    <span className={styles.priorityIndex}>{i + 1}.</span>
                    <span className={styles.priorityText}>{p.text}</span>
                    <span className={styles.priorityActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => move(p.id, -1)}
                        disabled={i === 0}
                        title="Move up"
                      >↑</button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => move(p.id, +1)}
                        disabled={i === priorities.length - 1}
                        title="Move down"
                      >↓</button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => toggleDone(p.id)}
                        title={p.done ? 'Mark not done' : 'Mark done'}
                      >{p.done ? '↺' : '✓'}</button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => removePriority(p.id)}
                        title="Remove"
                      >×</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.addPriorityRow}>
              <input
                type="text"
                className={styles.addPriorityInput}
                value={newPriority}
                onChange={e => setNewPriority(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPriority() } }}
                placeholder="Add a priority for today…"
              />
              <button
                type="button"
                className={styles.actionBtn}
                onClick={addPriority}
                disabled={!newPriority.trim()}
              >Add</button>
            </div>
          </div>

        </div>
      </div>
    </WorkspaceSection>
  )
}

// ── Printable Morning Brief (Phase 24C) ───────────────────────────────
//
// Rendered inside the print region but `display:none` on screen — print
// CSS reveals it and isolates it from the rest of the app. Severity-
// tinted attention rows are preserved.

function PrintableBrief({ brief }) {
  if (!brief) return null
  return (
    <section className={styles.printBrief} aria-hidden="true">
      <header className={styles.printBriefHeader}>
        {brief.courseName && <h1 className={styles.printBriefCourse}>{brief.courseName}</h1>}
        <h2 className={styles.printBriefTitle}>
          Morning Operations Brief — {brief.generatedAt}
        </h2>
      </header>

      <BriefSection title="Conditions"      section={brief.weatherSummary} />
      <BriefSection title="Operations"      section={brief.operationsSummary} />
      <BriefSection title="Crew"            section={brief.crewSummary} />
      <BriefSection title="Sprays"          section={brief.spraySummary} />
      <BriefSection title="Equipment"       section={brief.equipmentSummary} />
      <BriefSection title="Priorities"      section={brief.priorities} />

      {brief.attentionItems?.bullets?.length > 0 && (
        <div className={styles.printBriefSection}>
          <h3 className={styles.printBriefSectionTitle}>Needs Attention</h3>
          <ul className={styles.printBriefAttention}>
            {brief.attentionItems.bullets.map((b, i) => {
              // Strip the leading "[SEV] " tag to derive a tint class.
              const m = b.match(/^\[(INFO|WARN|HIGH)\]\s+(.*)$/i)
              const severity = m ? m[1].toLowerCase() : 'info'
              const text     = m ? m[2] : b
              return (
                <li key={i} className={styles.printBriefAttentionRow} data-severity={severity}>
                  {text}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

function BriefSection({ title, section }) {
  if (!section || !Array.isArray(section.bullets) || section.bullets.length === 0) return null
  return (
    <div className={styles.printBriefSection}>
      <h3 className={styles.printBriefSectionTitle}>{title}</h3>
      <ul className={styles.printBriefList}>
        {section.bullets.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    </div>
  )
}
