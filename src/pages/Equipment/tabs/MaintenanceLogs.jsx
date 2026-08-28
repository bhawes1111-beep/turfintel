import { useState, useMemo, useEffect, useRef } from 'react'
import { useEquipmentData, patchMaintenance } from '../../../utils/equipment/equipmentStore'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { openMechanicWorkOrder } from '../../../utils/equipment/maintenanceTicketPdf'
import { useToast } from '../../../utils/feedback/toastContext'
import { createEquipmentReservation } from '../../../utils/assignments/assignmentsStore'
import { createCalendarEvent } from '../../../utils/calendar/calendarStore'
import { buildMaintenanceLogReport } from '../../../utils/reports/reportBuilder'
import { createAttachmentRef } from '../../../utils/reports/reportSchemas'
import { getMediaByModule, getThumbnailBlob } from '../../../utils/media/mediaStore'
import ContextActions from '../../../components/contextActions/ContextActions'
import ExpandableSection from '../../../components/expandable/ExpandableSection'
import exStyles from '../../../components/expandable/expandable.module.css'
import UploadCenter from '../../../components/uploads/UploadCenter'
import ReportPreviewModal from '../../../components/reports/ReportPreviewModal'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import SideDrawer from '../../../components/primitives/SideDrawer'
import StatusBoard from '../../../components/primitives/StatusBoard'
import styles from '../Equipment.module.css'

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7)
}

function text(value) {
  return value == null ? '' : String(value)
}

function safeLower(value) {
  return text(value).toLowerCase()
}

function numberValue(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatHours(value) {
  const n = numberValue(value)
  return n == null ? '-' : `${n.toLocaleString()} hrs`
}

function formatMoney(value) {
  const n = numberValue(value)
  return n == null ? '$0' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatMoneyFixed(value) {
  const n = numberValue(value)
  return n == null ? '$0.00' : `$${n.toFixed(2)}`
}

function ticketStageLabel(value, status) {
  const stage = text(value || '').toLowerCase()
  const labels = {
    needs_service:  'Needs service',
    parts_ordered:  'Parts ordered',
    being_repaired: 'Being repaired',
    resolved:       'Resolved',
  }
  if (labels[stage]) return labels[stage]
  if (String(status || '').toLowerCase() === 'completed') return 'Resolved'
  return 'Needs service'
}

function partsFor(log) {
  return Array.isArray(log?.partsUsed) ? log.partsUsed : []
}

function normalizePartUsed(part) {
  const quantity = numberValue(part?.quantity) ?? numberValue(part?.qty) ?? 0
  const savedTotal = numberValue(part?.cost)
  const unitCost = numberValue(part?.unitCost) ?? (savedTotal != null && quantity > 0 ? savedTotal / quantity : 0)
  return {
    ...part,
    part:      part?.part || part?.name || 'Part',
    partNumber: part?.partNumber || '-',
    quantity,
    unitCost,
    totalCost: savedTotal ?? quantity * unitCost,
  }
}

function partCost(part) {
  const normalized = normalizePartUsed(part)
  return numberValue(normalized.totalCost) ?? 0
}

function escapeHtml(value) {
  return text(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

function printableTicketHtml(log, unit) {
  const parts = partsFor(log).map(normalizePartUsed)
  const partsCost = parts.reduce((sum, part) => sum + partCost(part), 0)
  const totalCost = numberValue(log.cost) ?? 0
  const laborCost = Math.max(0, totalCost - partsCost)
  const date = log.completedDate || log.date || ''
  const equipmentName = log.equipmentName || unit?.name || 'Equipment'
  const ticketId = `${equipmentName} - ${date || 'No date'}`
  const stageLabel = ticketStageLabel(log.ticketStage, log.status)
  const partsRows = parts.length
    ? parts.map(part => `
      <tr>
        <td>${escapeHtml(part.part)}</td>
        <td>${escapeHtml(part.partNumber)}</td>
        <td class="num">${escapeHtml(part.quantity)}</td>
        <td class="num">${formatMoneyFixed(part.unitCost)}</td>
        <td class="num">${formatMoneyFixed(partCost(part))}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="5" class="empty">No parts recorded.</td></tr>'

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Maintenance Ticket - ${escapeHtml(equipmentName)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef3ec; color: #1d2a22; font: 14px/1.45 Arial, sans-serif; }
    .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 12px; background: #0f2f1b; border-bottom: 1px solid #274e2f; }
    .toolbar button { border: 1px solid #78b878; border-radius: 6px; background: #2f7d3f; color: white; font-weight: 700; padding: 8px 12px; cursor: pointer; }
    .page { width: min(880px, calc(100% - 32px)); margin: 24px auto; background: #fffdf8; border: 1px solid #d6dfd2; box-shadow: 0 12px 40px rgba(29,42,34,.12); padding: 34px; }
    header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 4px solid #cfae5b; padding-bottom: 18px; }
    h1 { margin: 0; font-size: 25px; color: #16361f; }
    h2 { margin: 24px 0 10px; font-size: 13px; color: #286b38; letter-spacing: .08em; text-transform: uppercase; }
    .muted { color: #637361; }
    .ticketId { text-align: right; font-size: 12px; color: #637361; }
    .progress { margin-top: 18px; border: 1px solid #c7d7c2; background: #f4f8f0; padding: 14px 16px; }
    .progress .label { color: #286b38; }
    .progress strong { display: block; margin-top: 4px; color: #16361f; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 18px; }
    .field { border-bottom: 1px solid #e4eadd; padding-bottom: 8px; }
    .label { display: block; color: #667764; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
    .value { display: block; margin-top: 4px; font-weight: 700; color: #1d2a22; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #e4eadd; padding: 9px 10px; text-align: left; vertical-align: top; }
    th { background: #eef4eb; color: #38503b; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .empty { color: #667764; text-align: center; }
    .totals { margin-left: auto; width: min(360px, 100%); }
    .totals div { display: flex; justify-content: space-between; border-bottom: 1px solid #e4eadd; padding: 8px 0; }
    .totals strong { font-size: 17px; color: #16361f; }
    .notes { white-space: pre-wrap; border: 1px solid #e4eadd; background: #f9fbf5; padding: 12px; min-height: 72px; }
    @media print {
      body { background: white; }
      .toolbar { display: none; }
      .page { width: auto; margin: 0; border: 0; box-shadow: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print</button>
    <button onclick="window.print()">Save as PDF</button>
  </div>
  <main class="page">
    <header>
      <div>
        <h1>Maintenance Ticket</h1>
        <div class="muted">${escapeHtml(equipmentName)} - ${escapeHtml(log.serviceType || 'Maintenance')}</div>
      </div>
      <div class="ticketId">
        <div>Ticket ID</div>
        <strong>${escapeHtml(ticketId)}</strong>
      </div>
    </header>

    <section class="progress">
      <span class="label">Ticket progress</span>
      <strong>${escapeHtml(stageLabel)}</strong>
    </section>

    <section class="grid">
      <div class="field"><span class="label">Equipment</span><span class="value">${escapeHtml(equipmentName)}</span></div>
      <div class="field"><span class="label">Type</span><span class="value">${escapeHtml(log.category || unit?.type || unit?.category || 'Equipment')}</span></div>
      <div class="field"><span class="label">Status</span><span class="value">${escapeHtml(log.status || '-')}</span></div>
      <div class="field"><span class="label">Date</span><span class="value">${escapeHtml(date || '-')}</span></div>
      <div class="field"><span class="label">Technician</span><span class="value">${escapeHtml(log.technician || 'Unassigned')}</span></div>
      <div class="field"><span class="label">Labor hours</span><span class="value">${escapeHtml(log.laborHours ?? '-')}</span></div>
      <div class="field"><span class="label">Hours at service</span><span class="value">${escapeHtml(log.hoursAtService ?? '-')}</span></div>
      <div class="field"><span class="label">Priority</span><span class="value">${escapeHtml(log.priority || '-')}</span></div>
    </section>

    <h2>Parts Used</h2>
    <table>
      <thead>
        <tr><th>Part</th><th>Part #</th><th class="num">Qty</th><th class="num">Unit Cost</th><th class="num">Total</th></tr>
      </thead>
      <tbody>${partsRows}</tbody>
    </table>

    <h2>Cost Summary</h2>
    <div class="totals">
      <div><span>Labor / Other</span><span>${formatMoneyFixed(laborCost)}</span></div>
      <div><span>Parts</span><span>${formatMoneyFixed(partsCost)}</span></div>
      <div><strong>Total</strong><strong>${formatMoneyFixed(totalCost)}</strong></div>
    </div>

    <h2>Notes</h2>
    <div class="notes">${escapeHtml(log.notes || 'No notes recorded.')}</div>
  </main>
</body>
</html>`
}

const STATUS_FILTERS   = ['All', 'Open', 'In Progress', 'Overdue', 'Completed']
const PRIORITY_FILTERS = ['All', 'Critical', 'High', 'Routine']

const STATUS_META = {
  'completed':   { label: 'Completed',   cls: styles.mlStatusCompleted  },
  'open':        { label: 'Open',        cls: styles.mlStatusOpen       },
  'in-progress': { label: 'In Progress', cls: styles.mlStatusInProgress },
  'overdue':     { label: 'Overdue',     cls: styles.mlStatusOverdue    },
}

const PRIORITY_META = {
  'critical': { label: 'Critical', cls: styles.mlPriorityCritical },
  'high':     { label: 'High',     cls: styles.mlPriorityHigh     },
  'routine':  { label: 'Routine',  cls: styles.mlPriorityRoutine  },
}

const SERVICE_TYPE_COLORS = {
  'Preventive': { bg: 'rgba(74,158,74,0.12)',  color: '#4ecb4e', border: 'rgba(74,158,74,0.28)'  },
  'Repair':     { bg: 'rgba(220,80,80,0.12)',  color: '#e07070', border: 'rgba(220,80,80,0.28)'  },
  'Inspection': { bg: 'rgba(80,140,220,0.12)', color: '#6aabee', border: 'rgba(80,140,220,0.28)' },
  'Adjustment': { bg: 'rgba(91,168,160,0.12)', color: '#5ba8a0', border: 'rgba(91,168,160,0.28)' },
  'Overhaul':   { bg: 'rgba(150,80,220,0.12)', color: '#a060e0', border: 'rgba(150,80,220,0.28)' },
}

const SORT_STATUS    = { overdue: 0, open: 1, 'in-progress': 2, completed: 3 }
const SORT_PRIORITY  = { critical: 0, high: 1, routine: 2 }
const PRIORITY_CYCLE = { critical: 'high', high: 'routine', routine: 'critical' }
const PRIORITY_COLOR = { critical: '#e05050', high: '#d4883a', routine: '#4ecb4e' }

const FILTER_STATUS_KEY = {
  'Open':        'open',
  'In Progress': 'in-progress',
  'Overdue':     'overdue',
  'Completed':   'completed',
}

export default function MaintenanceLogs({ initialSearch = null } = {}) {
  const { equipment, serviceLog }    = useEquipmentData()
  const { items: inventoryItems }    = useInventoryData()
  const toast                        = useToast()
  // Seed search filter when arriving via Phase 3.4 click-through.
  const [search,      setSearch]    = useState(initialSearch ?? '')
  const [staFilter,   setStaFilter] = useState('All')
  const [priFilter,   setPriFilter] = useState('All')
  const [selected,       setSelected]      = useState(null)
  const [selectedSection,setSelectedSection]= useState(null)
  const [activeReport,   setActiveReport]  = useState(null)
  const [reportLoading,  setReportLoading] = useState(false)
  const [hoveredId,      setHoveredId]     = useState(null)
  const [expandedId,     setExpandedId]    = useState(null)
  const [reportThumbs,   setReportThumbs]  = useState([])
  const attachSectionRef                    = useRef(null)

  function closeModal() {
    setSelected(null)
    setSelectedSection(null)
  }

  useEffect(() => {
    if (selected && selectedSection === 'attachments' && attachSectionRef.current) {
      const timer = setTimeout(() => {
        attachSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [selected, selectedSection])

  // ── Inline action handlers ─────────────────────────────────────────────────

  function handleMarkComplete(log, e) {
    e.stopPropagation()
    const isCompleted = log.status === 'completed'
    if (isCompleted) {
      patchMaintenance(log.id, { status: 'open', ticketStage: 'needs_service', completedDate: null })
        .then(() => toast.info('Service record reopened'))
        .catch(err => toast.error?.(`Save failed: ${err.message}`))
    } else {
      patchMaintenance(log.id, {
        status:        'completed',
        ticketStage:   'resolved',
        completedDate: new Date().toISOString().slice(0, 10),
      })
        .then(() => toast.success('Service marked complete ✓'))
        .catch(err => toast.error?.(`Save failed: ${err.message}`))
    }
  }

  function handleCyclePriority(log, e) {
    e.stopPropagation()
    const next = PRIORITY_CYCLE[log.priority] || 'routine'
    patchMaintenance(log.id, { priority: next })
      .then(() => toast.info(`Priority set to ${next}`))
      .catch(err => toast.error?.(`Save failed: ${err.message}`))
  }

  function handleInlineSchedule(log, e) {
    e.stopPropagation()
    handleScheduleService(log)
  }

  function handleInlineReport(log, e) {
    e.stopPropagation()
    generateMaintenanceReport(log)
  }

  function handleOpenAttachments(log, e) {
    e.stopPropagation()
    setSelected(log)
    setSelectedSection('attachments')
  }

  function handleOpenTicketPdf(log, e) {
    e?.stopPropagation?.()
    const win = window.open('', '_blank', 'width=920,height=1000')
    if (!win) {
      toast.error?.('Popup blocked. Allow popups to view the ticket PDF.')
      return
    }
    win.document.open()
    win.document.write(printableTicketHtml(log, resolveEquipment(log)))
    win.document.close()
    win.focus()
  }

  function handlePrintWorkOrder(log, e) {
    e?.stopPropagation?.()
    openMechanicWorkOrder(
      log,
      resolveEquipment(log),
      inventoryItems,
      () => toast.error?.('Popup blocked. Allow popups to print the work order.'),
    )
  }

  function handleScheduleService(log) {
    const equipmentName = log.equipmentName || 'Equipment'
    const serviceType = log.serviceType || 'Maintenance'
    log = {
      ...log,
      equipmentName,
      serviceType,
      date: log.date || new Date().toISOString().slice(0, 10),
      category: log.category || 'Equipment',
      hoursAtService: numberValue(log.hoursAtService) ?? 0,
    }
    const evtPriority = log.priority === 'critical' ? 'high' : (log.priority || 'routine')
    const evtStatus   = log.status === 'completed' ? 'completed'
                      : log.status === 'in-progress' ? 'in-progress'
                      : 'scheduled'

    // Phase 5.4c — both the calendar event and its equipment reservation
    // persist to D1. Worker-side dedupe keeps both writes idempotent:
    // calendar_events on (source_id + event_type + start_date), and
    // equipment_reservations on (calendar_event_id + equipment_name).
    createCalendarEvent({
      title:         `${log.serviceType} — ${log.equipmentName}`,
      date:          log.date,
      category:      'maintenance',
      priority:      evtPriority,
      status:        evtStatus,
      location:      'Maintenance Shop',
      assignedStaff: log.technician ? [log.technician] : [],
      equipment:     [log.equipmentName],
      tags:          [log.serviceType, log.category],
      notes:         log.notes || '',
      sourceModule:  'equipment',
      sourceId:      log.id,
    }).then(savedEvent => {
      createEquipmentReservation({
        calendarEventId: savedEvent.id,
        equipmentId:     log.equipmentId ?? null,
        equipmentName:   log.equipmentName,
        notes:           `${log.serviceType} service — ${log.hoursAtService.toLocaleString()} hrs`,
      }).catch(() => {})
    }).catch(() => {})

    toast.success('Service event added to Operations Calendar')
  }

  function handleCloseReport() {
    reportThumbs.forEach(url => URL.revokeObjectURL(url))
    setReportThumbs([])
    setActiveReport(null)
  }

  function resolveEquipment(log) {
    return equipment.find(e => e.id === log.equipmentId)
      ?? {
        name: log.equipmentName || 'Equipment',
        type: log.category || 'Equipment',
        category: log.category || 'Equipment',
        model: '',
        status: log.status || 'open',
      }
  }

  function normalizeLog(l) {
    return {
      date:        l.completedDate ?? l.date,
      type:        l.serviceType,
      description: l.notes || `${l.serviceType} — ${l.equipmentName}`,
      technician:  l.technician || 'Unassigned',
      cost:        l.cost,
    }
  }

  void normalizeLog

  function normalizeLogSafe(l) {
    const serviceType = l.serviceType || 'Maintenance'
    const equipmentName = l.equipmentName || 'Equipment'
    return {
      date:        l.completedDate ?? l.date ?? '',
      stage:       ticketStageLabel(l.ticketStage, l.status),
      type:        serviceType,
      description: l.notes || `${serviceType} - ${equipmentName}`,
      technician:  l.technician || 'Unassigned',
      cost:        numberValue(l.cost) ?? 0,
    }
  }

  async function generateMaintenanceReport(log) {
    setReportLoading(true)
    try {
      const [photos, docs] = await Promise.all([
        getMediaByModule(log.id).catch(() => []),
        getMediaByModule(`${log.id}-docs`).catch(() => []),
      ])
      const allMedia  = [...photos, ...docs]
      const thumbUrls = []

      await Promise.all(allMedia.map(async rec => {
        let thumbnailUrl = null
        if (rec.type === 'image') {
          try {
            const blob = await getThumbnailBlob(rec.id)
            if (blob) {
              thumbnailUrl = URL.createObjectURL(blob)
              thumbUrls.push(thumbnailUrl)
            }
          } catch { /* thumbnail optional — ignore */ }
        }
        return createAttachmentRef({
          id:           rec.id,
          filename:     rec.filename,
          type:         rec.type,
          thumbnailUrl,
          size:         rec.size,
        })
      }))

      const equipment = resolveEquipment(log)
      setReportThumbs(thumbUrls)
      setActiveReport(buildMaintenanceLogReport(
        { ...equipment, type: equipment.category ?? equipment.type },
        [normalizeLogSafe(log)],
        { dateRange: log.completedDate ?? log.date },
      ))
    } finally {
      setReportLoading(false)
    }
  }

  function generateEquipmentHistory(log) {
    const unit = resolveEquipment(log)
    const logs = serviceLog
      .filter(l => l.equipmentId === log.equipmentId)
      .map(normalizeLogSafe)
    setActiveReport(buildMaintenanceLogReport(
      { ...unit, type: unit.category ?? unit.type },
      logs,
      { dateRange: 'All Time' },
    ))
  }

  // Server is the source of truth (Phase 5.0). The local-overlay
  // mergeServiceLogs() pattern is no longer used by this consumer;
  // mutations flow through patchMaintenance() and the store re-syncs.
  const mergedLogs = useMemo(() => Array.isArray(serviceLog) ? serviceLog : [], [serviceLog])

  const counts = useMemo(() => {
    const thisMonth = currentMonthKey()
    let open = 0, completedMonth = 0, overdue = 0, totalCost = 0
    mergedLogs.forEach(log => {
      if (log.status === 'open' || log.status === 'in-progress') open++
      if (log.status === 'overdue') overdue++
      if (log.status === 'completed' && log.completedDate?.startsWith(thisMonth)) completedMonth++
      totalCost += numberValue(log.cost) ?? 0
    })
    return { open, completedMonth, overdue, totalCost }
  }, [mergedLogs])

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    return mergedLogs
      .filter(log => {
        const matchSta = staFilter === 'All' || log.status === FILTER_STATUS_KEY[staFilter]
        const matchPri = priFilter === 'All' || log.priority === priFilter.toLowerCase()
        const matchSearch = !q ||
          safeLower(log.equipmentName).includes(q) ||
          safeLower(log.category).includes(q) ||
          safeLower(log.serviceType).includes(q) ||
          safeLower(log.technician).includes(q) ||
          safeLower(log.notes).includes(q)
        return matchSta && matchPri && matchSearch
      })
      .sort((a, b) =>
        (SORT_STATUS[a.status] ?? 9) - (SORT_STATUS[b.status] ?? 9) ||
        (SORT_PRIORITY[a.priority] ?? 9) - (SORT_PRIORITY[b.priority] ?? 9)
      )
  }, [search, staFilter, priFilter, mergedLogs])

  const totalPartsOnLog = log =>
    partsFor(log).reduce((sum, p) => sum + partCost(p), 0)

  return (
    <div className={styles.eqRoot}>
      <WorkspaceSection
        title="Work Orders & History"
        subtitle="Service history, repairs, and inspections — newest urgency first."
      >

      {/* ── Stat row ── */}
      <StatusBoard columns={4}>
        <StatusBoard.Tile value={counts.open}            label="Open Services"         tone="info" />
        <StatusBoard.Tile value={counts.completedMonth}  label="Completed This Month"  tone="ok" />
        <StatusBoard.Tile value={counts.overdue}         label="Overdue"               tone="critical" />
        <StatusBoard.Tile
          value={
            <span style={{ fontSize: '1.5rem', letterSpacing: '-0.02em' }}>
              ${counts.totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          }
          label="Total Service Cost"
          tone="neutral"
        />
      </StatusBoard>

      {/* ── Toolbar ── */}
      <div className={styles.eqToolbar}>
        <input
          type="search"
          className={styles.eqSearch}
          placeholder="Search equipment, service type, technician…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search maintenance logs"
        />
        <div className={styles.eqFilterRow}>
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              className={`${styles.eqFilterBtn} ${staFilter === s ? styles.eqFilterBtnActive : ''}`}
              onClick={() => setStaFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className={styles.eqFilterRow}>
          {PRIORITY_FILTERS.map(p => (
            <button
              key={p}
              className={`${styles.eqFilterBtn} ${priFilter === p ? styles.eqFilterBtnActive : ''}`}
              onClick={() => setPriFilter(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.eqCount}>
        {visible.length} record{visible.length !== 1 ? 's' : ''}
        {(staFilter !== 'All' || priFilter !== 'All' || search) ? ' (filtered)' : ''}
      </p>

      {/* ── Log list ── */}
      {visible.length === 0 ? (
        serviceLog.length === 0 ? (
          <EmptyState
            title="No maintenance records yet."
            description="Service log entries, repairs, and inspections will appear here once recorded."
          />
        ) : (
          <EmptyState
            compact
            title="No matches."
            description="No maintenance records match the current filters."
          />
        )
      ) : (
        <div className={styles.eqList}>
          {visible.map(log => {
            const equipmentName = log.equipmentName || 'Equipment'
            const serviceType = log.serviceType || 'Maintenance'
            const category = log.category || 'Equipment'
            const status = log.status || 'open'
            const stageLabel = ticketStageLabel(log.ticketStage, status)
            const priority = log.priority || 'routine'
            const parts = partsFor(log)
            const statusMeta   = STATUS_META[status] || { label: status }
            const priorityMeta = PRIORITY_META[priority] || { label: priority }
            const typeColors   = SERVICE_TYPE_COLORS[serviceType] || SERVICE_TYPE_COLORS.Inspection
            const hasParts     = parts.length > 0
            const priorityCls  = `mlCard_${priority}`
            const completed    = log.status === 'completed'
            const accentColor  = PRIORITY_COLOR[priority] || '#4ecb4e'
            const cost = numberValue(log.cost) ?? 0
            const nextDueHours = numberValue(log.nextDueHours)
            log = {
              ...log,
              equipmentName,
              serviceType,
              category,
              status,
              ticketStage: log.ticketStage || (status === 'completed' ? 'resolved' : 'needs_service'),
              priority,
              partsUsed: parts.map(normalizePartUsed),
              hoursAtService: numberValue(log.hoursAtService) ?? 0,
              nextDueHours,
              cost,
            }
            return (
              <div
                key={log.id}
                className={`${styles.mlCard} ${styles[priorityCls]}`}
                onClick={() => setSelected(log)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelected(log) }}
                aria-label={`View details for ${equipmentName} ${serviceType}`}
                onMouseEnter={() => setHoveredId(log.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div className={styles.mlCardRow}>
                {/* Left: equipment + service info */}
                <div className={styles.eqCardMain}>
                  <div className={styles.eqCardTitleRow}>
                    <span className={styles.eqCardName}>{equipmentName}</span>
                    <span
                      className={styles.mlTypeBadge}
                      style={{ background: typeColors.bg, color: typeColors.color, borderColor: typeColors.border }}
                    >
                      {serviceType}
                    </span>
                    <span className={styles.eqCategoryPill}>{category}</span>
                  </div>

                  <div className={styles.mlCardMeta}>
                    <span className={styles.mlCardDate}>{log.date || '-'}</span>
                    {log.technician
                      ? <span className={styles.eqOperatorBadge}>{log.technician}</span>
                      : <span className={styles.mlUnassigned}>Unassigned</span>
                    }
                    <span className={styles.mlHoursAtService}>{formatHours(log.hoursAtService)}</span>
                  </div>

                  <div className={styles.eqCardBadgeRow}>
                    <span className={`${styles.eqStatusBadge} ${statusMeta.cls || ''}`}>
                      {statusMeta.label}
                    </span>
                    <span className={styles.mlStageBadge}>{stageLabel}</span>
                    <span className={`${styles.mlPriorityBadge} ${priorityMeta.cls || ''}`}>
                      {priorityMeta.label}
                    </span>
                    {hasParts && (
                      <span className={styles.mlPartsBadge}>
                        {parts.length} part{parts.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {log.notes && <span className={styles.mlHasNotes}>Note</span>}
                  </div>

                  {/* ── Inline actions ── */}
                  <div className={styles.mlCardActions}>
                    <ContextActions
                      hovered={hoveredId === log.id}
                      actions={[
                        {
                          id: 'complete',
                          label: completed ? '↩ Reopen' : '✓ Complete',
                          variant: completed ? 'muted' : 'green',
                          onClick: e => handleMarkComplete(log, e),
                          title: completed ? 'Reopen service record' : 'Mark as completed',
                        },
                        ...(!completed ? [{
                          id: 'priority',
                          label: `Change ${priorityMeta.label}`,
                          style: { color: accentColor, borderColor: accentColor },
                          onClick: e => handleCyclePriority(log, e),
                          title: 'Cycle priority: critical → high → routine',
                        }] : []),
                        ...(!completed ? [{
                          id: 'schedule',
                          label: '📅 Schedule',
                          onClick: e => handleInlineSchedule(log, e),
                          title: 'Add to Operations Calendar',
                        }] : []),
                        {
                          id: 'ticket-pdf',
                          label: 'View PDF',
                          onClick: e => handleOpenTicketPdf(log, e),
                          title: 'Open printable ticket PDF',
                        },
                        {
                          id: 'work-order',
                          label: 'Print Work Order',
                          onClick: e => handlePrintWorkOrder(log, e),
                          title: 'Print mechanic work order with available parts',
                        },
                        {
                          id: 'report',
                          label: '📄 Report',
                          onClick: e => handleInlineReport(log, e),
                          disabled: reportLoading,
                          title: 'Generate service report',
                        },
                        {
                          id: 'attachments',
                          label: '📎 Attachments',
                          onClick: e => handleOpenAttachments(log, e),
                          title: 'View attachments',
                        },
                      ]}
                    />
                  </div>
                </div>

                {/* Right: cost */}
                <div className={styles.eqCardRight}>
                  {cost > 0 ? (
                    <>
                      <span className={styles.mlBigCost}>
                        {formatMoney(cost)}
                      </span>
                      <span className={styles.eqHoursLabel}>cost</span>
                    </>
                  ) : (
                    <>
                      <span className={`${styles.mlBigCost} ${styles.mlCostPending}`}>—</span>
                      <span className={styles.eqHoursLabel}>
                        {status === 'completed' ? 'no cost' : 'pending'}
                      </span>
                    </>
                  )}
                  {nextDueHours != null && (
                    <span className={styles.eqNextService}>
                      Next: {formatHours(nextDueHours)}
                    </span>
                  )}
                  <span className={styles.eqViewDetail}>Details →</span>
                  <button
                    type="button"
                    className={styles.mlPdfButton}
                    onClick={e => handleOpenTicketPdf(log, e)}
                  >
                    View PDF
                  </button>
                  <button
                    type="button"
                    className={styles.mlPdfButton}
                    onClick={e => handlePrintWorkOrder(log, e)}
                  >
                    Print Work Order
                  </button>
                  <button
                    className={`${exStyles.esToggleBtn} ${expandedId === log.id ? exStyles.esToggleBtnOpen : ''}`}
                    onClick={e => { e.stopPropagation(); setExpandedId(prev => prev === log.id ? null : log.id) }}
                    aria-expanded={expandedId === log.id}
                    aria-label={expandedId === log.id ? 'Collapse details' : 'Show details'}
                  >
                    {expandedId === log.id ? '▲' : '▼'}
                  </button>
                </div>
                </div>{/* end mlCardRow */}

                {/* ── Expandable detail ── */}
                <ExpandableSection expanded={expandedId === log.id}>
                  <div className={exStyles.esBody}>
                    <div className={exStyles.esGrid}>
                      <div className={exStyles.esField}>
                        <span className={exStyles.esLabel}>Service Date</span>
                        <span className={exStyles.esValue}>{log.date}</span>
                      </div>
                      <div className={exStyles.esField}>
                        <span className={exStyles.esLabel}>Hours at Service</span>
                        <span className={exStyles.esValue}>{log.hoursAtService.toLocaleString()} hrs</span>
                      </div>
                      {log.nextDueHours && (
                        <div className={exStyles.esField}>
                          <span className={exStyles.esLabel}>Next Due</span>
                          <span className={exStyles.esValue}>{log.nextDueHours.toLocaleString()} hrs</span>
                        </div>
                      )}
                      {log.cost > 0 && (
                        <div className={exStyles.esField}>
                          <span className={exStyles.esLabel}>Cost</span>
                          <span className={exStyles.esValue}>{formatMoneyFixed(log.cost)}</span>
                        </div>
                      )}
                      {log.completedDate && (
                        <div className={exStyles.esField}>
                          <span className={exStyles.esLabel}>Completed</span>
                          <span className={exStyles.esValue}>{log.completedDate}</span>
                        </div>
                      )}
                    </div>
                    {log.notes && <p className={exStyles.esNote}>{log.notes}</p>}
                    {log.partsUsed.length > 0 && (
                      <div className={exStyles.esPartsList}>
                        <span className={exStyles.esLabel}>Parts Used</span>
                        {log.partsUsed.map((p, i) => (
                          <div key={i} className={exStyles.esPartsItem}>
                            <span className={exStyles.esPartsBadge}>×{p.quantity}</span>
                            <span>{p.part}</span>
                            {p.unitCost > 0 && (
                              <span className={exStyles.esPartsItemCost}>${p.unitCost.toFixed(2)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </ExpandableSection>
              </div>
            )
          })}
        </div>
      )}

      </WorkspaceSection>

      {/* ── Detail drawer ── */}
      {(() => {
        if (!selected) return null
        const safeSelected = {
          ...selected,
          equipmentName: selected.equipmentName || 'Equipment',
          serviceType: selected.serviceType || 'Maintenance',
          category: selected.category || 'Equipment',
          status: selected.status || 'open',
          ticketStage: selected.ticketStage || (selected.status === 'completed' ? 'resolved' : 'needs_service'),
          priority: selected.priority || 'routine',
          hoursAtService: numberValue(selected.hoursAtService) ?? 0,
          nextDueHours: numberValue(selected.nextDueHours),
          cost: numberValue(selected.cost) ?? 0,
          partsUsed: partsFor(selected).map(normalizePartUsed),
        }
        const statusMeta   = STATUS_META[safeSelected.status]   || { label: safeSelected.status }
        const priorityMeta = PRIORITY_META[safeSelected.priority] || { label: safeSelected.priority }
        const typeColors   = SERVICE_TYPE_COLORS[safeSelected.serviceType] || SERVICE_TYPE_COLORS.Inspection
        const accentColors = {
          critical: '#e05050',
          high:     '#d4883a',
          routine:  '#4ecb4e',
        }
        const partsCost  = totalPartsOnLog(safeSelected)
        const laborCost  = Math.max(0, safeSelected.cost - partsCost)
        return (
          <SideDrawer
            open={!!selected}
            onClose={closeModal}
            accentColor={accentColors[safeSelected.priority] || '#4a9e4a'}
            ariaLabel="Maintenance log details"
          >
            <SideDrawer.Header
              title={`${safeSelected.equipmentName} - ${safeSelected.serviceType}`}
              subtitle={
                `${safeSelected.category} - ${safeSelected.date || '-'}` +
                (safeSelected.technician ? ` - ${safeSelected.technician}` : '')
              }
              status={
                <span className={`${styles.eqStatusBadge} ${statusMeta.cls || ''}`}>
                  {statusMeta.label}
                </span>
              }
              onClose={closeModal}
            />

            <SideDrawer.Body>

                {/* Service Overview */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Service Overview</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Service Type</span>
                      <span
                        className={styles.mlTypeBadge}
                        style={{
                          background:  typeColors.bg,
                          color:       typeColors.color,
                          borderColor: typeColors.border,
                          fontSize:    '0.82rem',
                          padding:     '4px 10px',
                        }}
                      >
                          {safeSelected.serviceType}
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Priority</span>
                      <span className={`${styles.mlPriorityBadge} ${priorityMeta.cls || ''}`}>
                        {priorityMeta.label}
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Status</span>
                      <span className={`${styles.eqStatusBadge} ${statusMeta.cls || ''}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Ticket Progress</span>
                      <span className={styles.mlStageBadge}>
                        {ticketStageLabel(safeSelected.ticketStage, safeSelected.status)}
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Technician</span>
                      <span className={styles.eqModalFieldValue}>
                        {safeSelected.technician || 'Unassigned'}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Equipment Information */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Equipment Information</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Equipment</span>
                      <span className={styles.eqModalFieldValue}>{safeSelected.equipmentName}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Category</span>
                      <span className={styles.eqModalFieldValue}>{safeSelected.category}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Hours at Service</span>
                      <span className={`${styles.eqModalFieldValue} ${styles.eqModalHoursBig}`}>
                        {formatHours(safeSelected.hoursAtService)}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Service Timeline */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Service Timeline</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Date Opened</span>
                      <span className={styles.eqModalFieldValue}>{safeSelected.date || '-'}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Completed Date</span>
                      <span className={styles.eqModalFieldValue}>
                        {safeSelected.completedDate || '-'}
                      </span>
                    </div>
                    {safeSelected.nextDueHours != null && (
                      <div className={styles.eqModalField}>
                        <span className={styles.eqModalFieldLabel}>Next Service At</span>
                        <span className={styles.eqModalFieldValue}>
                          {formatHours(safeSelected.nextDueHours)}
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                {/* Parts Used */}
                {safeSelected.partsUsed.length > 0 ? (
                  <section className={styles.eqModalSection}>
                    <h3 className={styles.eqModalSectionTitle}>Parts Used</h3>
                    <div className={styles.mlPartsTable}>
                      <div className={styles.mlPartsHeader}>
                        <span>Part</span>
                        <span>Part #</span>
                        <span className={styles.mlPartsQty}>Qty</span>
                        <span className={styles.mlPartsCost}>Unit Cost</span>
                        <span className={styles.mlPartsCost}>Total</span>
                      </div>
                      {safeSelected.partsUsed.map((p, i) => (
                        <div key={i} className={styles.mlPartsRow}>
                          <span className={styles.mlPartName}>{p.part}</span>
                          <span className={styles.mlPartNumber}>{p.partNumber}</span>
                          <span className={styles.mlPartsQty}>{p.quantity}</span>
                          <span className={styles.mlPartsCost}>{formatMoneyFixed(p.unitCost)}</span>
                          <span className={styles.mlPartsCost}>{formatMoneyFixed(partCost(p))}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className={styles.eqModalSection}>
                    <h3 className={styles.eqModalSectionTitle}>Parts Used</h3>
                    <p className={styles.eqModalServiceNote}>No parts recorded for this service.</p>
                  </section>
                )}

                {/* Cost Breakdown */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Cost Breakdown</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Parts Cost</span>
                      <span className={styles.eqModalFieldValue}>
                        {partsCost > 0 ? `$${partsCost.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Labor / Other</span>
                      <span className={styles.eqModalFieldValue}>
                        {laborCost > 0 ? `$${laborCost.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Total Cost</span>
                      <span className={`${styles.eqModalFieldValue} ${styles.mlTotalCost}`}>
                        {safeSelected.cost > 0
                          ? formatMoneyFixed(safeSelected.cost)
                          : safeSelected.status === 'completed' ? '$0.00' : 'Pending'
                        }
                      </span>
                    </div>
                  </div>
                </section>

                {/* Technician Notes */}
                {safeSelected.notes && (
                  <section className={styles.eqModalSection}>
                    <h3 className={styles.eqModalSectionTitle}>Technician Notes</h3>
                    <p className={styles.eqModalNotes}>{safeSelected.notes}</p>
                  </section>
                )}

                {/* Attachments */}
                <section className={styles.eqModalSection} ref={attachSectionRef}>
                  <h3 className={styles.eqModalSectionTitle}>Attachments</h3>
                  <UploadCenter
                    module={safeSelected.id}
                    type="image"
                    tags={[safeSelected.category, safeSelected.serviceType, safeSelected.priority].filter(Boolean)}
                    title="Photos"
                  />
                  <UploadCenter
                    module={`${safeSelected.id}-docs`}
                    type="document"
                    tags={[safeSelected.category, safeSelected.serviceType, safeSelected.priority].filter(Boolean)}
                    title="Documents"
                  />
                </section>

            </SideDrawer.Body>

            <SideDrawer.Footer>
              <button
                className="opActionBtn"
                onClick={e => handleOpenTicketPdf(safeSelected, e)}
              >
                View PDF
              </button>
              <button
                className="opActionBtn"
                onClick={e => handlePrintWorkOrder(safeSelected, e)}
              >
                Print Work Order
              </button>
              <button
                className="opActionBtn"
                onClick={() => generateMaintenanceReport(safeSelected)}
                disabled={reportLoading}
              >
                {reportLoading ? 'Loading…' : 'Generate Report'}
              </button>
              <button
                className="opActionBtn"
                onClick={() => generateEquipmentHistory(safeSelected)}
                disabled={reportLoading}
              >
                Equipment History
              </button>
              <button
                className="opActionBtn"
                onClick={() => { handleScheduleService(safeSelected); closeModal() }}
              >
                + Add to Operations Calendar
              </button>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                Reserves {safeSelected.equipmentName} - adds maintenance event
              </span>
            </SideDrawer.Footer>
          </SideDrawer>
        )
      })()}

      <ReportPreviewModal
        report={activeReport}
        onClose={handleCloseReport}
      />

    </div>
  )
}
