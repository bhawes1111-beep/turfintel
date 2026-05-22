// Morning Operations Brief v2 — superintendent's polished daily brief.
//
// Composes the full live picture into 7 sections via buildMorningBrief, with
// print / copy / CSV export and a Crew Message that posts to the Display
// Board (as a crew-visible operations_daily_note). Real persisted data only.
//
// PRIVACY: this surface is superintendent-facing and may DISPLAY the
// condition log's crew-safe Course Status. It never reads the condition
// log's private note field, and the Crew Message send carries only what the
// super types — private superintendent notes are never routed to the board.

import { useMemo, useState, useEffect } from 'react'
import { useAssignmentsData } from '../../utils/assignments/assignmentsStore'
import { useCrewData } from '../../utils/crew/crewStore'
import { useSpraysData } from '../../utils/sprays/spraysStore'
import { useEquipmentData } from '../../utils/equipment/equipmentStore'
import { useWeather } from '../../utils/weather/useWeather'
import { useMoistureData } from '../../utils/moisture/moistureStore'
import { useCulturalPractices } from '../../utils/culturalPractices/culturalPracticesStore'
import { categorizePractices, effectiveRecovery, RECOVERY_LABEL } from '../../utils/culturalPractices/recoveryState'
import { fetchConditionLogByDate } from '../../utils/conditionLog/conditionLogStore'
import { createOperationsNote } from '../../utils/operations/notesStore'
import { useSelectedCourse } from '../../utils/courses/courseStore'
import { useToast } from '../../utils/feedback/toastContext'
import { weatherImpacts } from '../../utils/weather/weatherImpacts'
import {
  buildMorningBrief,
  buildBriefCsvRows,
  defaultBriefFilename,
} from '../../utils/operations/morningBrief'
import { serializeCsv, downloadBlob, copyToClipboard } from '../../utils/programIntelligence'
import styles from './MorningBriefTab.module.css'

const todayIso = () => new Date().toISOString().slice(0, 10)

// Section render order + the brief keys they map to.
const SECTION_VIEW = [
  ['Course Status',   'courseStatus'],
  ['Weather Impacts', 'weatherImpacts'],
  ['Crew Plan',       'crewSummary'],
  ['Watch Areas',     'watchAreas'],
  ['Cultural Practices', 'culturalPractices'],
  ['Applications / Sprays', 'spraySummary'],
  ['Equipment Concerns',    'equipmentSummary'],
]

export default function MorningBriefTab() {
  const { crewAssignments } = useAssignmentsData()
  const { employees: crewEmployees } = useCrewData()
  const { records: sprays } = useSpraysData()
  const { practices: culturalPractices } = useCulturalPractices()
  const { serviceLog } = useEquipmentData()
  const weather = useWeather()
  const { observations: moistureObs } = useMoistureData()
  const selectedCourse = useSelectedCourse()
  const toast = useToast()

  const today = todayIso()
  const [conditionLog, setConditionLog] = useState(null)
  const [crewMessage, setCrewMessage]   = useState('')
  const [sending, setSending]           = useState(false)

  // Load today's condition log (crew-safe fields only are used downstream).
  useEffect(() => {
    let cancelled = false
    fetchConditionLogByDate(today)
      .then(res => { if (!cancelled) setConditionLog(res && !res.empty ? res : null) })
      .catch(() => { if (!cancelled) setConditionLog(null) })
    return () => { cancelled = true }
  }, [today])

  // ── Snapshot derivations (same shapes the existing brief expects) ───────
  const crewSnapshot = useMemo(() => {
    const todayAssignments = (crewAssignments ?? []).filter(a => a?.status !== 'cancelled')
    const ids = new Set(todayAssignments.map(a => a.employeeId || a.employeeName).filter(Boolean))
    const active = (crewEmployees ?? []).filter(e => e?.status !== 'inactive')
    return {
      scheduled:   ids.size,
      assignments: todayAssignments.length,
      unassigned:  Math.max(0, active.length - ids.size),
      activeTotal: active.length,
    }
  }, [crewAssignments, crewEmployees])

  const spraySchedule = useMemo(() => {
    const planned = (sprays ?? []).filter(s => s.status === 'planned' && (s.date ?? '') >= today)
    return {
      todayCount: planned.filter(s => s.date === today).length,
      upcoming:   planned.slice(0, 5),
      pending:    planned.length,
    }
  }, [sprays, today])

  const equipmentAlerts = useMemo(() => {
    const flagged = (serviceLog ?? []).filter(
      l => l.status === 'overdue' || (l.status === 'open' && l.priority === 'critical'),
    )
    return { outOfService: flagged.length, overdue: flagged.filter(l => l.status === 'overdue').length, conflicts: 0 }
  }, [serviceLog])

  const impacts = useMemo(() => weatherImpacts(weather.current ?? {}, weather.forecast ?? []), [weather.current, weather.forecast])

  const watchAreas = useMemo(() => {
    const nowMs = Date.parse(`${today}T23:59:59`)   // day-bounded; stable per render
    const seen = new Set()
    const out = []
    for (const o of moistureObs ?? []) {
      if (!o?.location || seen.has(o.location)) continue
      seen.add(o.location)
      const ageH = (nowMs - Date.parse(o.observedAt)) / 3_600_000
      if (!Number.isFinite(ageH) || ageH > 48) continue
      const flags = []
      if (o.handwaterRec) flags.push('Handwater')
      if (o.wiltStress)   flags.push('Wilt')
      if (o.drySpot)      flags.push('Dry spot')
      if (flags.length > 0) out.push({ id: o.id, location: o.location, flags })
    }
    return out.slice(0, 10)
  }, [moistureObs, today])

  // Cultural practices for the brief: today's planned work + recovery watch.
  // All fields are crew-safe (no private field on the practice record).
  const cpItems = useMemo(() => {
    const { upcoming, watch } = categorizePractices(culturalPractices, today)
    const titleCase = s => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ') : '')
    const out = []
    for (const p of upcoming.filter(x => x.practiceDate === today)) {
      out.push({ label: `${titleCase(p.practiceType)} planned${p.targetArea ? ` — ${p.targetArea}` : ''}`, detail: p.playabilityImpact || null })
    }
    for (const p of watch.slice(0, 4)) {
      out.push({ label: `${titleCase(p.practiceType)}${p.targetArea ? ` — ${p.targetArea}` : ''}`, detail: RECOVERY_LABEL[effectiveRecovery(p)] ?? null })
    }
    return out
  }, [culturalPractices, today])

  const brief = useMemo(() => buildMorningBrief({
    weatherCurrent:  weather.current,
    weatherImpacts:  impacts,
    conditionLog,                       // composer reads only safe fields
    crewSnapshot,
    spraySchedule,
    equipmentAlerts,
    watchAreas,
    culturalPractices: cpItems,
  }, {
    courseName:  selectedCourse?.shortName ?? selectedCourse?.name ?? null,
    generatedAt: today,
  }), [weather.current, impacts, conditionLog, crewSnapshot, spraySchedule, equipmentAlerts, watchAreas, cpItems, selectedCourse, today])

  // ── Actions ─────────────────────────────────────────────────────────────
  function handlePrint() { if (typeof window !== 'undefined') window.print() }

  async function handleCopy() {
    const ok = await copyToClipboard(brief.textVersion)
    toast?.[ok ? 'success' : 'error']?.(ok ? 'Brief copied' : 'Copy failed')
  }

  function handleExport() {
    const { headers, rows } = buildBriefCsvRows(brief)
    if (rows.length === 0) { toast?.info?.('Nothing to export — the brief is empty.'); return }
    downloadBlob(
      defaultBriefFilename({ courseName: brief.courseName, generatedAt: brief.generatedAt }),
      'text/csv;charset=utf-8',
      serializeCsv({ headers, rows }),
    )
  }

  async function handleSendCrewMessage() {
    const body = crewMessage.trim()
    if (!body) { toast?.info?.('Type a crew message first.'); return }
    setSending(true)
    try {
      // Crew-visible briefing note — the Display Board already renders these.
      // Only this typed message is sent; never private superintendent notes.
      await createOperationsNote({ body, priority: 'routine', noteDate: today, createdBy: brief.courseName ?? null })
      toast?.success?.('Crew message sent to Display Board')
      setCrewMessage('')
    } catch (err) {
      toast?.error?.(`Send failed: ${err.message}`)
    } finally {
      setSending(false)
    }
  }

  const dateLabel = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <div>
          <h2 className={styles.title}>Morning Operations Brief</h2>
          <p className={styles.date}>{dateLabel}</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.actionBtn} onClick={handleCopy}>Copy</button>
          <button type="button" className={styles.actionBtn} onClick={handlePrint}>Print</button>
          <button type="button" className={styles.actionBtn} onClick={handleExport}>Export CSV</button>
        </div>
      </div>

      {/* 7 sections — render each safe section; omit empties honestly. */}
      <div className={styles.sections}>
        {SECTION_VIEW.map(([label, key]) => {
          const section = brief[key]
          return (
            <section key={key} className={styles.section}>
              <h3 className={styles.sectionLabel}>{label}</h3>
              {section?.hasData ? (
                <ul className={styles.bullets}>
                  {section.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              ) : (
                <p className={styles.emptySection}>—</p>
              )}
            </section>
          )
        })}

        {/* Crew Message — section 7. Posts to the Display Board (crew-safe). */}
        <section className={styles.section}>
          <h3 className={styles.sectionLabel}>Crew Message</h3>
          <p className={styles.crewHint}>Shown to the crew on the Display Board. Never include private notes.</p>
          <textarea
            className={styles.crewInput}
            value={crewMessage}
            onChange={e => setCrewMessage(e.target.value)}
            rows={3}
            placeholder="e.g. Frost delay until 7:30 — greens mowing N–S after"
          />
          <button type="button" className={styles.sendBtn} onClick={handleSendCrewMessage} disabled={sending}>
            {sending ? 'Sending…' : 'Send to Display Board'}
          </button>
        </section>
      </div>
    </div>
  )
}
