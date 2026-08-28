import { useState, useMemo, useEffect, useRef } from 'react'
import { useRepairsData, patchRepair, createRepair, deleteRepair } from '../../../utils/repairs/repairsStore'
import { refreshInventoryData, useInventoryData } from '../../../utils/inventory/inventoryStore'
import { useToast } from '../../../utils/feedback/toastContext'
import { createAlert } from '../../../utils/alerts/alertsStore'
import { createCalendarEvent } from '../../../utils/calendar/calendarStore'
import ContextActions from '../../../components/contextActions/ContextActions'
import ExpandableSection from '../../../components/expandable/ExpandableSection'
import exStyles from '../../../components/expandable/expandable.module.css'
import UploadCenter from '../../../components/uploads/UploadCenter'
import { buildIrrigationRepairReport, buildIrrigationRepairSummaryReport } from '../../../utils/reports/reportBuilder'
import { createAttachmentRef } from '../../../utils/reports/reportSchemas'
import { getMediaByModule, getThumbnailBlob } from '../../../utils/media/mediaStore'
import ReportPreviewModal from '../../../components/reports/ReportPreviewModal'
import { EmptyState } from '../../../components/shared/EmptyState'
import styles from '../Irrigation.module.css'

const STATUS_FILTERS = [
  { label: 'All',          value: 'All'          },
  { label: 'Open',         value: 'open'         },
  { label: 'In Progress',  value: 'in-progress'  },
  { label: 'Parts Needed', value: 'parts-needed' },
  { label: 'Completed',    value: 'completed'    },
]

const PRIORITY_FILTERS = [
  { label: 'All',    value: 'All'    },
  { label: 'High',   value: 'high'   },
  { label: 'Medium', value: 'medium' },
  { label: 'Low',    value: 'low'    },
]

const AREA_FILTERS = ['All', 'Greens', 'Fairways', 'Tees', 'Rough', 'Pump Station']

const STATUS_META = {
  'open':         { label: 'Open',         cls: 'irStatusOpen'        },
  'in-progress':  { label: 'In Progress',  cls: 'irStatusInProgress'  },
  'parts-needed': { label: 'Parts Needed', cls: 'irStatusPartsNeeded' },
  'completed':    { label: 'Completed',    cls: 'irStatusCompleted'   },
}

const PRIORITY_ACCENT = {
  high:   '#c0392b',
  medium: '#dca032',
  low:    '#4a9e4a',
}

const ISSUE_TYPE_LABELS = {
  'broken-head':     'Broken Head',
  'leaking-valve':   'Leaking Valve',
  'clogged-nozzle':  'Clogged Nozzle',
  'line-break':      'Line Break',
  'controller-fault':'Controller Fault',
  'stuck-valve':     'Stuck Valve',
  'pop-up-failure':  'Pop-Up Failure',
}

const SORT_STATUS      = { 'in-progress': 0, open: 1, 'parts-needed': 2, completed: 3 }
const SORT_PRIORITY    = { high: 0, medium: 1, low: 2 }
const PRIORITY_CYCLE   = { high: 'medium', medium: 'low', low: 'high' }

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function emptyRepairTicket() {
  return {
    issueType:    'broken-head',
    area:         '',
    hole:         '',
    headNumber:   '',
    description:  '',
    priority:     'medium',
    status:       'open',
    assignedTo:   '',
    laborHours:   '',
    partsUsed:    [{ part: '', qty: '', cost: '' }],
    dateReported: todayKey(),
    notes:        '',
  }
}

function parseOptionalNumber(value, label) {
  if (value === '' || value == null) return null
  const next = Number(value)
  if (!Number.isFinite(next)) throw new Error(`${label} must be a number when set.`)
  if (next < 0) throw new Error(`${label} cannot be negative.`)
  return next
}

function cleanTicketParts(parts) {
  return parts
    .map(part => ({
      inventoryItemId: part.inventoryItemId || null,
      part: String(part.part ?? '').trim(),
      qty:  parseOptionalNumber(part.qty, 'Part quantity'),
      cost: parseOptionalNumber(part.cost, 'Part cost'),
    }))
    .filter(part => part.part || part.qty != null || part.cost != null)
}

function normalizePartLookup(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function formatMoneyInput(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return num.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function formatMoneyLabel(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '$0.00'
  return `$${num.toFixed(2)}`
}

function inventoryPartUnitPrice(item) {
  const costPerUnit = Number(item?.costPerUnit)
  if (Number.isFinite(costPerUnit) && costPerUnit >= 0) return costPerUnit

  const containerPrice = Number(item?.containerPrice)
  if (Number.isFinite(containerPrice) && containerPrice >= 0) return containerPrice

  return null
}

function calculateInventoryPartCost(item, qty) {
  const unitPrice = inventoryPartUnitPrice(item)
  if (unitPrice == null) return null

  if (qty === '' || qty == null) return null
  const quantity = Number(qty)
  if (!Number.isFinite(quantity) || quantity < 0) return null
  return unitPrice * quantity
}

function partsTotal(parts = []) {
  return parts.reduce((sum, part) => {
    const cost = Number(part?.cost)
    return sum + (Number.isFinite(cost) ? cost : 0)
  }, 0)
}

function ticketFromRepair(repair) {
  return {
    ...emptyRepairTicket(),
    issueType:    repair.issueType || 'broken-head',
    area:         repair.area || '',
    hole:         repair.hole == null ? '' : String(repair.hole),
    headNumber:   repair.headNumber || '',
    description:  repair.description || '',
    priority:     repair.priority || 'medium',
    status:       repair.status || 'open',
    assignedTo:   repair.assignedTo || '',
    laborHours:   repair.laborHours == null ? '' : String(repair.laborHours),
    partsUsed:    repair.partsUsed?.length
      ? repair.partsUsed.map(part => ({
        inventoryItemId: part.inventoryItemId || null,
        part: part.part || part.name || '',
        qty:  part.qty == null ? '' : String(part.qty),
        cost: part.cost == null ? '' : String(part.cost),
      }))
      : [{ part: '', qty: '', cost: '' }],
    dateReported: repair.dateReported || todayKey(),
    notes:        repair.notes || '',
  }
}

function matchesArea(repair, area) {
  if (area === 'All')          return true
  if (area === 'Greens')       return repair.area.includes('Green')
  if (area === 'Fairways')     return repair.area.includes('Fairway')
  if (area === 'Tees')         return repair.area.includes('Tee')
  if (area === 'Rough')        return repair.area.includes('Rough')
  if (area === 'Pump Station') return repair.area === 'Pump Station'
  return true
}

export default function Repairs() {
  const { repairs }                          = useRepairsData()
  const { items: inventoryItems }             = useInventoryData()
  const toast                                = useToast()
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [areaFilter,     setAreaFilter]     = useState('All')
  const [selected,       setSelected]       = useState(null)
  const [selectedSection,setSelectedSection]= useState(null)
  const [activeReport,   setActiveReport]   = useState(null)
  const [reportLoading,  setReportLoading]  = useState(false)
  const [hoveredId,      setHoveredId]      = useState(null)
  const [expandedId,     setExpandedId]     = useState(null)
  const [reportThumbs,   setReportThumbs]   = useState([])
  const [ticketOpen,     setTicketOpen]     = useState(false)
  const [ticketForm,     setTicketForm]     = useState(() => emptyRepairTicket())
  const [ticketSaving,   setTicketSaving]   = useState(false)
  const [editingRepairId,setEditingRepairId]= useState(null)
  const attachSectionRef                     = useRef(null)

  const irrigationPartOptions = useMemo(
    () => inventoryItems
      .filter(item => item.kind === 'irrigation' || item.kind === 'part')
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [inventoryItems],
  )

  const irrigationPartOptionsByName = useMemo(() => {
    const options = new Map()
    for (const part of irrigationPartOptions) {
      options.set(normalizePartLookup(part.name), part)
      if (part.partNumber) options.set(normalizePartLookup(part.partNumber), part)
    }
    return options
  }, [irrigationPartOptions])

  const ticketPartsTotal = useMemo(
    () => partsTotal(ticketForm.partsUsed),
    [ticketForm.partsUsed],
  )

  function closeModal() {
    setSelected(null)
    setSelectedSection(null)
  }

  // Scroll to attachments section when modal opens via inline action
  useEffect(() => {
    if (selected && selectedSection === 'attachments' && attachSectionRef.current) {
      const timer = setTimeout(() => {
        attachSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [selected, selectedSection])

  // ── Inline action handlers ─────────────────────────────────────────────────

  async function changeRepairStatus(repair, status, e) {
    e.stopPropagation()
    try {
      await patchRepair(repair.repairId, {
        status,
        dateCompleted: status === 'completed' ? (repair.dateCompleted || todayKey()) : null,
      })
      if (status === 'completed') await refreshInventoryData()
      toast.success?.(`Repair moved to ${STATUS_META[status]?.label || status}.`)
    } catch (err) {
      toast.error?.(`Save failed: ${err.message}`)
    }
  }

  function handleMarkComplete(repair, e) {
    return changeRepairStatus(repair, repair.status === 'completed' ? 'open' : 'completed', e)
  }

  function handleCyclePriority(repair, e) {
    e.stopPropagation()
    const next = PRIORITY_CYCLE[repair.priority] || 'medium'
    patchRepair(repair.repairId, { priority: next })
      .then(() => toast.info(`Priority set to ${next}`))
      .catch(err => toast.error?.(`Save failed: ${err.message}`))
  }

  function handleInlineSchedule(repair, e) {
    e.stopPropagation()
    handleScheduleRepair(repair)
  }

  function handleInlineReport(repair, e) {
    e.stopPropagation()
    generateRepairReport(repair)
  }

  function handleOpenAttachments(repair, e) {
    e.stopPropagation()
    setSelected(repair)
    setSelectedSection('attachments')
  }

  function openNewTicket() {
    setEditingRepairId(null)
    setTicketForm(emptyRepairTicket())
    setTicketOpen(true)
  }

  function openEditTicket(repair) {
    setSelected(null)
    setSelectedSection(null)
    setEditingRepairId(repair.repairId)
    setTicketForm(ticketFromRepair(repair))
    setTicketOpen(true)
  }

  async function handleDeleteRepair(repair, e) {
    e?.stopPropagation?.()
    if (!window.confirm(`Delete irrigation repair ticket for ${repair.area || 'this repair'}?`)) return
    try {
      await deleteRepair(repair.repairId)
      await refreshInventoryData()
      if (selected?.repairId === repair.repairId) closeModal()
      if (editingRepairId === repair.repairId) closeTicketForm()
      toast.success?.('Irrigation repair ticket deleted.')
    } catch (err) {
      toast.error?.(`Delete failed: ${err.message ?? err}`)
    }
  }

  function handleCloseReport() {
    reportThumbs.forEach(url => URL.revokeObjectURL(url))
    setReportThumbs([])
    setActiveReport(null)
  }

  function updateTicketForm(patch) {
    setTicketForm(prev => ({ ...prev, ...patch }))
  }

  function updateTicketPart(index, patch) {
    setTicketForm(prev => ({
      ...prev,
      partsUsed: prev.partsUsed.map((part, partIndex) =>
        partIndex === index ? { ...part, ...patch } : part,
      ),
    }))
  }

  function pricePatchForInventoryPart(currentPart, inventoryPart, qty = currentPart.qty) {
    if (!inventoryPart) return {}
    const nextQty = qty === '' || qty == null ? '' : qty
    const nextCost = calculateInventoryPartCost(inventoryPart, nextQty)
    return {
      inventoryItemId: inventoryPart.id,
      part: inventoryPart.name || currentPart.part,
      qty:  nextQty,
      cost: nextCost == null ? '' : formatMoneyInput(nextCost),
    }
  }

  function findInventoryPart(partName, { allowPartial = false } = {}) {
    const lookup = normalizePartLookup(partName)
    if (!lookup) return null
    const direct = irrigationPartOptionsByName.get(lookup)
    if (direct) return direct
    if (!allowPartial) return null
    return irrigationPartOptions.find(part => {
      const name = normalizePartLookup(part.name)
      const partNumber = normalizePartLookup(part.partNumber)
      return name.includes(lookup) || (partNumber && partNumber.includes(lookup))
    }) ?? null
  }

  function chooseTicketPart(index, partName) {
    setTicketForm(prev => ({
      ...prev,
      partsUsed: prev.partsUsed.map((part, partIndex) => {
        if (partIndex !== index) return part
        const next = { ...part, inventoryItemId: null, part: partName }
        return { ...next, ...pricePatchForInventoryPart(next, findInventoryPart(partName)) }
      }),
    }))
  }

  function reconcileTicketPart(index, partName) {
    setTicketForm(prev => ({
      ...prev,
      partsUsed: prev.partsUsed.map((part, partIndex) => {
        if (partIndex !== index) return part
        const next = { ...part, inventoryItemId: null, part: partName }
        return { ...next, ...pricePatchForInventoryPart(next, findInventoryPart(partName, { allowPartial: true })) }
      }),
    }))
  }

  function changeTicketPartQty(index, qty) {
    setTicketForm(prev => ({
      ...prev,
      partsUsed: prev.partsUsed.map((part, partIndex) => {
        if (partIndex !== index) return part
        const next = { ...part, qty }
        return { ...next, ...pricePatchForInventoryPart(next, findInventoryPart(part.part), qty) }
      }),
    }))
  }

  function addTicketPart() {
    setTicketForm(prev => ({
      ...prev,
      partsUsed: [...prev.partsUsed, { part: '', qty: '', cost: '' }],
    }))
  }

  function removeTicketPart(index) {
    setTicketForm(prev => ({
      ...prev,
      partsUsed: prev.partsUsed.length <= 1
        ? [{ part: '', qty: '', cost: '' }]
        : prev.partsUsed.filter((_, partIndex) => partIndex !== index),
    }))
  }

  function closeTicketForm() {
    if (ticketSaving) return
    setTicketOpen(false)
    setEditingRepairId(null)
    setTicketForm(emptyRepairTicket())
  }

  async function saveRepairTicket(e) {
    e?.preventDefault?.()
    const area = ticketForm.area.trim()
    const description = ticketForm.description.trim()
    if (!area) {
      toast.info?.('Area is required.')
      return
    }
    if (!description) {
      toast.info?.('Description is required.')
      return
    }

    let laborHours
    let partsUsed
    let hole
    try {
      laborHours = parseOptionalNumber(ticketForm.laborHours, 'Labor hours') ?? 0
      hole = parseOptionalNumber(ticketForm.hole, 'Hole')
      partsUsed = cleanTicketParts(ticketForm.partsUsed)
    } catch (err) {
      toast.info?.(err.message)
      return
    }

    setTicketSaving(true)
    try {
      const payload = {
        issueType:    ticketForm.issueType,
        area,
        hole,
        headNumber:   ticketForm.headNumber.trim() || null,
        description,
        priority:     ticketForm.priority,
        status:       ticketForm.status,
        assignedTo:   ticketForm.assignedTo.trim() || null,
        laborHours,
        partsUsed,
        dateReported: ticketForm.dateReported || todayKey(),
        notes:        ticketForm.notes.trim() || null,
      }
      if (editingRepairId) {
        await patchRepair(editingRepairId, payload)
        toast.success?.('Irrigation repair ticket updated.')
      } else {
        await createRepair(payload)
        toast.success?.('Irrigation repair ticket added.')
      }
      if (ticketForm.status === 'completed') await refreshInventoryData()
      closeTicketForm()
    } catch (err) {
      toast.error?.(`Ticket save failed: ${err.message ?? err}`)
    } finally {
      setTicketSaving(false)
    }
  }

  async function generateRepairReport(repair) {
    setReportLoading(true)
    try {
      const [photos, docs] = await Promise.all([
        getMediaByModule(repair.repairId).catch(() => []),
        getMediaByModule(`${repair.repairId}-docs`).catch(() => []),
      ])
      const allMedia  = [...photos, ...docs]
      const thumbUrls = []

      const attachmentRefs = await Promise.all(allMedia.map(async rec => {
        let thumbnailUrl = null
        if (rec.type === 'image') {
          try {
            const blob = await getThumbnailBlob(rec.id)
            if (blob) {
              thumbnailUrl = URL.createObjectURL(blob)
              thumbUrls.push(thumbnailUrl)
            }
          } catch { /* ignore */ }
        }
        return createAttachmentRef({
          id:           rec.id,
          filename:     rec.filename,
          type:         rec.type,
          thumbnailUrl,
          size:         rec.size,
        })
      }))

      setReportThumbs(thumbUrls)
      setActiveReport(buildIrrigationRepairReport(repair, attachmentRefs))
    } finally {
      setReportLoading(false)
    }
  }

  function generateSummaryReport() {
    setActiveReport(buildIrrigationRepairSummaryReport(repairs))
  }

  function handleScheduleRepair(repair) {
    const locationStr = [
      repair.hole != null ? `Hole ${repair.hole}` : null,
      repair.area,
      repair.headNumber ? `Head #${repair.headNumber}` : null,
    ].filter(Boolean).join(' · ')

    // Phase 5.4a — calendar event persists to D1; fire-and-forget.
    createCalendarEvent({
      title:         `Irrigation Repair — ${ISSUE_TYPE_LABELS[repair.issueType] || repair.issueType}`,
      date:          repair.dateReported,
      category:      'irrigation',
      priority:      repair.priority,
      status:        repair.status === 'completed' ? 'completed' : 'scheduled',
      location:      locationStr,
      assignedStaff: repair.assignedTo ? [repair.assignedTo] : [],
      equipment:     repair.partsUsed.length > 0 ? ['Repair Kit'] : [],
      tags:          [repair.issueType],
      notes:         repair.notes || '',
      sourceModule:  'irrigation',
      sourceId:      repair.repairId,
    }).catch(() => {})

    if (repair.priority === 'high') {
      // Phase 5.4b — alerts persist to D1 via alertsStore; fire-and-forget.
      createAlert({
        title:       `Irrigation Repair Scheduled — ${ISSUE_TYPE_LABELS[repair.issueType]}`,
        message:     `${locationStr}. Assigned to ${repair.assignedTo || 'unassigned'}. Status: ${repair.status.replace('-', ' ')}.`,
        module:      'irrigation',
        priority:    'high',
        course:      repair.area,
        actionLabel: 'View Irrigation',
        sourceId:    repair.repairId,
      }).catch(() => {})
    }

    toast.success('Repair added to Operations Calendar')
  }

  useEffect(() => {
    if (!selected) return
    const onKey = e => { if (e.key === 'Escape') closeModal() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const stats = useMemo(() => ({
    all:         repairs.length,
    open:        repairs.filter(r => r.status === 'open').length,
    inProgress:  repairs.filter(r => r.status === 'in-progress').length,
    partsNeeded: repairs.filter(r => r.status === 'parts-needed').length,
    completed:   repairs.filter(r => r.status === 'completed').length,
  }), [repairs])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return repairs
      .filter(r => {
        if (q &&
          !r.description.toLowerCase().includes(q) &&
          !r.area.toLowerCase().includes(q) &&
          !(ISSUE_TYPE_LABELS[r.issueType] || r.issueType).toLowerCase().includes(q) &&
          !(r.assignedTo || '').toLowerCase().includes(q)) return false
        if (statusFilter   !== 'All' && r.status   !== statusFilter)   return false
        if (priorityFilter !== 'All' && r.priority !== priorityFilter) return false
        if (!matchesArea(r, areaFilter)) return false
        return true
      })
      .sort((a, b) => {
        const ss = (SORT_STATUS[a.status] ?? 9) - (SORT_STATUS[b.status] ?? 9)
        if (ss !== 0) return ss
        return (SORT_PRIORITY[a.priority] ?? 9) - (SORT_PRIORITY[b.priority] ?? 9)
      })
  }, [search, statusFilter, priorityFilter, areaFilter, repairs])

  return (
    <div className={styles.irWrap}>

      {/* ── Stat row ─────────────────────────────────────────────────────── */}
      <div className={styles.irStatRow}>
        <div className={styles.irStatCard}>
          <span className={styles.irStatLabel}>Open</span>
          <span className={`${styles.irStatValue} ${stats.open > 0 ? styles.irStatAmber : ''}`}>
            {stats.open}
          </span>
        </div>
        <div className={styles.irStatCard}>
          <span className={styles.irStatLabel}>In Progress</span>
          <span className={`${styles.irStatValue} ${stats.inProgress > 0 ? styles.irStatAmber : ''}`}>
            {stats.inProgress}
          </span>
        </div>
        <div className={styles.irStatCard}>
          <span className={styles.irStatLabel}>Parts Needed</span>
          <span className={`${styles.irStatValue} ${stats.partsNeeded > 0 ? styles.irStatRed : ''}`}>
            {stats.partsNeeded}
          </span>
        </div>
        <div className={styles.irStatCard}>
          <span className={styles.irStatLabel}>Completed</span>
          <span className={`${styles.irStatValue} ${styles.irStatGreen}`}>
            {stats.completed}
          </span>
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className={styles.irToolbar}>
        <input
          className={styles.irSearch}
          type="text"
          placeholder="Search area, issue type, or assignee…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="opActionBtn" onClick={openNewTicket}>
          + New Repair Ticket
        </button>
        <button className="opActionBtn" onClick={generateSummaryReport}>
          Summary Report
        </button>
      </div>

      {/* ── Status chips ─────────────────────────────────────────────────── */}
      <div className={styles.irFilters}>
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            className={`${styles.irChip} ${statusFilter === value ? styles.irChipActive : ''}`}
            onClick={() => setStatusFilter(value)}
          >{label} ({value === 'All'
            ? stats.all
            : stats[value === 'in-progress' ? 'inProgress' : value === 'parts-needed' ? 'partsNeeded' : value]})</button>
        ))}
      </div>

      {/* ── Priority chips ───────────────────────────────────────────────── */}
      <div className={styles.irFilters}>
        {PRIORITY_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            className={`${styles.irChip} ${priorityFilter === value ? styles.irChipActive : ''}`}
            onClick={() => setPriorityFilter(value)}
          >{label}</button>
        ))}
      </div>

      {/* ── Area chips ───────────────────────────────────────────────────── */}
      <div className={styles.irFilters}>
        {AREA_FILTERS.map(a => (
          <button
            key={a}
            className={`${styles.irChip} ${areaFilter === a ? styles.irChipActive : ''}`}
            onClick={() => setAreaFilter(a)}
          >{a}</button>
        ))}
      </div>

      <p className={styles.irCount}>
        {filtered.length} repair{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* ── Repair list ──────────────────────────────────────────────────── */}
      <div className={styles.irList}>
        {filtered.map(repair => {
          const sm         = STATUS_META[repair.status] || { label: repair.status, cls: '' }
          const accent     = PRIORITY_ACCENT[repair.priority] || 'var(--color-accent)'
          const issueLabel = ISSUE_TYPE_LABELS[repair.issueType] || repair.issueType
          const completed  = repair.status === 'completed'

          return (
            <div
              key={repair.repairId}
              className={`${styles.irCard} ${styles[`irCard_${repair.priority}`]} ${completed ? styles.irCard_completed : ''}`}
              onClick={() => setSelected(repair)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelected(repair) }}
              onMouseEnter={() => setHoveredId(repair.repairId)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className={styles.irCardMain}>
                <div className={styles.irCardLeft}>

                  {/* Title row */}
                  <div className={styles.irCardNameRow}>
                    <span className={styles.irCardTitle}>{issueLabel}</span>
                    {repair.headNumber && (
                      <span className={styles.irHeadBadge}>Head #{repair.headNumber}</span>
                    )}
                    {repair.partsUsed.length > 0 && (
                      <span className={styles.irPartsBadge}>
                        {repair.partsUsed.length} part{repair.partsUsed.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Location */}
                  <div className={styles.irCardMeta}>
                    {repair.hole != null ? `Hole ${repair.hole} · ` : ''}{repair.area}
                  </div>

                  {/* Description */}
                  <div className={styles.irCardDesc}>{repair.description}</div>

                  {/* Assigned + labor */}
                  <div className={styles.irCardFooter}>
                    <span className={styles.irAssigned}>
                      {repair.assignedTo || <em className={styles.irUnassigned}>Unassigned</em>}
                    </span>
                    {repair.laborHours > 0 && (
                      <span className={styles.irLaborHours}>{repair.laborHours}h logged</span>
                    )}
                    <span className={styles.irCardDate}>{repair.dateReported}</span>
                  </div>

                </div>

                <div className={styles.irCardRight}>
                  <select
                    className={`${styles.irInlineStatusSelect} ${styles[sm.cls]}`}
                    value={repair.status}
                    onClick={e => e.stopPropagation()}
                    onChange={e => changeRepairStatus(repair, e.target.value, e)}
                    aria-label={`Status for ${issueLabel}`}
                  >
                    {STATUS_FILTERS.filter(option => option.value !== 'All').map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <span className={styles.irPriorityLabel} style={{ color: accent }}>
                    {repair.priority.charAt(0).toUpperCase() + repair.priority.slice(1)}
                  </span>
                  <button
                    className={`${exStyles.esToggleBtn} ${expandedId === repair.repairId ? exStyles.esToggleBtnOpen : ''}`}
                    onClick={e => { e.stopPropagation(); setExpandedId(prev => prev === repair.repairId ? null : repair.repairId) }}
                    aria-expanded={expandedId === repair.repairId}
                    aria-label={expandedId === repair.repairId ? 'Collapse details' : 'Show details'}
                  >
                    {expandedId === repair.repairId ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              {/* ── Expandable detail ───────────────────────────────────── */}
              <ExpandableSection expanded={expandedId === repair.repairId}>
                <div className={exStyles.esBody}>
                  <div className={exStyles.esGrid}>
                    <div className={exStyles.esField}>
                      <span className={exStyles.esLabel}>Reported</span>
                      <span className={exStyles.esValue}>{repair.dateReported}</span>
                    </div>
                    <div className={exStyles.esField}>
                      <span className={exStyles.esLabel}>Assigned To</span>
                      <span className={exStyles.esValue}>{repair.assignedTo || '—'}</span>
                    </div>
                    {repair.laborHours > 0 && (
                      <div className={exStyles.esField}>
                        <span className={exStyles.esLabel}>Labor Logged</span>
                        <span className={exStyles.esValue}>{repair.laborHours}h</span>
                      </div>
                    )}
                    {repair.dateCompleted && (
                      <div className={exStyles.esField}>
                        <span className={exStyles.esLabel}>Completed</span>
                        <span className={exStyles.esValue}>{repair.dateCompleted}</span>
                      </div>
                    )}
                  </div>
                  {repair.notes && (
                    <p className={exStyles.esNote}>{repair.notes}</p>
                  )}
                  {repair.partsUsed.length > 0 && (
                    <div className={exStyles.esPartsList}>
                      <span className={exStyles.esLabel}>Parts Used</span>
                      {repair.partsUsed.map((p, i) => (
                        <div key={i} className={exStyles.esPartsItem}>
                          <span className={exStyles.esPartsBadge}>×{p.qty}</span>
                          <span>{p.part}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ExpandableSection>

              {/* ── Inline actions ──────────────────────────────────────── */}
              <div className={styles.irCardActions}>
                <ContextActions
                  hovered={hoveredId === repair.repairId}
                  actions={[
                    {
                      id: 'complete',
                      label: completed ? '↩ Reopen' : '✓ Complete',
                      variant: completed ? 'muted' : 'green',
                      onClick: e => handleMarkComplete(repair, e),
                      title: completed ? 'Reopen repair' : 'Mark as completed',
                    },
                    ...(!completed ? [{
                      id: 'priority',
                      label: `↕ ${repair.priority.charAt(0).toUpperCase() + repair.priority.slice(1)}`,
                      style: { color: accent, borderColor: accent },
                      onClick: e => handleCyclePriority(repair, e),
                      title: 'Cycle priority: high → medium → low',
                    }] : []),
                    ...(!completed ? [{
                      id: 'schedule',
                      label: '📅 Schedule',
                      onClick: e => handleInlineSchedule(repair, e),
                      title: 'Add to Operations Calendar',
                    }] : []),
                    {
                      id: 'edit',
                      label: 'Edit',
                      onClick: e => { e.stopPropagation(); openEditTicket(repair) },
                      title: 'Edit repair ticket',
                    },
                    {
                      id: 'delete',
                      label: 'Delete',
                      variant: 'danger',
                      onClick: e => handleDeleteRepair(repair, e),
                      title: 'Delete repair ticket',
                    },
                    {
                      id: 'report',
                      label: '📄 Report',
                      onClick: e => handleInlineReport(repair, e),
                      disabled: reportLoading,
                      title: 'Generate repair report',
                    },
                    {
                      id: 'attachments',
                      label: '📎 Attachments',
                      onClick: e => handleOpenAttachments(repair, e),
                      title: 'View attachments',
                    },
                  ]}
                />
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          repairs.length === 0 ? (
            <EmptyState
              title="No irrigation repairs logged."
              description="Repair tickets, stuck heads, and pipe issues will appear here once recorded."
            />
          ) : (
            <p className={styles.irEmpty}>No repairs match the current filters.</p>
          )
        )}
      </div>

      {ticketOpen && (
        <div className={styles.irModalOverlay} role="presentation">
          <form className={styles.irTicketForm} onSubmit={saveRepairTicket}>
            <header className={styles.irTicketHeader}>
              <div>
                <h2 className={styles.irModalTitle}>
                  {editingRepairId ? 'Edit Irrigation Repair Ticket' : 'New Irrigation Repair Ticket'}
                </h2>
                <p className={styles.irModalSub}>Log heads, valves, leaks, wire, and pump station repairs.</p>
              </div>
              <button type="button" className={styles.irModalClose} onClick={closeTicketForm} disabled={ticketSaving}>
                Close
              </button>
            </header>

            <div className={styles.irTicketBody}>
              <section className={styles.irModalSection}>
                <p className={styles.irModalSectionTitle}>Ticket</p>
                <div className={styles.irTicketGrid}>
                  <label className={styles.irTicketField}>
                    <span>Issue type</span>
                    <select value={ticketForm.issueType} onChange={e => updateTicketForm({ issueType: e.target.value })} disabled={ticketSaving}>
                      {Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.irTicketField}>
                    <span>Status</span>
                    <select value={ticketForm.status} onChange={e => updateTicketForm({ status: e.target.value })} disabled={ticketSaving}>
                      {STATUS_FILTERS.filter(option => option.value !== 'All').map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.irTicketField}>
                    <span>Priority</span>
                    <select value={ticketForm.priority} onChange={e => updateTicketForm({ priority: e.target.value })} disabled={ticketSaving}>
                      {PRIORITY_FILTERS.filter(option => option.value !== 'All').map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.irTicketField}>
                    <span>Date reported</span>
                    <input type="date" value={ticketForm.dateReported} onChange={e => updateTicketForm({ dateReported: e.target.value })} disabled={ticketSaving} />
                  </label>
                </div>
              </section>

              <section className={styles.irModalSection}>
                <p className={styles.irModalSectionTitle}>Location</p>
                <div className={styles.irTicketGrid}>
                  <label className={styles.irTicketField}>
                    <span>Area *</span>
                    <input type="text" value={ticketForm.area} onChange={e => updateTicketForm({ area: e.target.value })} placeholder="Green 4, Pump Station, Hole 12" disabled={ticketSaving} />
                  </label>
                  <label className={styles.irTicketField}>
                    <span>Hole</span>
                    <input type="number" min="0" step="1" value={ticketForm.hole} onChange={e => updateTicketForm({ hole: e.target.value })} disabled={ticketSaving} />
                  </label>
                  <label className={styles.irTicketField}>
                    <span>Head / valve #</span>
                    <input type="text" value={ticketForm.headNumber} onChange={e => updateTicketForm({ headNumber: e.target.value })} disabled={ticketSaving} />
                  </label>
                </div>
              </section>

              <section className={styles.irModalSection}>
                <p className={styles.irModalSectionTitle}>Work</p>
                <label className={styles.irTicketField}>
                  <span>Description *</span>
                  <textarea rows={3} value={ticketForm.description} onChange={e => updateTicketForm({ description: e.target.value })} placeholder="What needs to be repaired?" disabled={ticketSaving} />
                </label>
                <div className={styles.irTicketGrid}>
                  <label className={styles.irTicketField}>
                    <span>Assigned to</span>
                    <input type="text" value={ticketForm.assignedTo} onChange={e => updateTicketForm({ assignedTo: e.target.value })} disabled={ticketSaving} />
                  </label>
                  <label className={styles.irTicketField}>
                    <span>Labor hours</span>
                    <input type="number" min="0" step="0.25" value={ticketForm.laborHours} onChange={e => updateTicketForm({ laborHours: e.target.value })} disabled={ticketSaving} />
                  </label>
                </div>
              </section>

              <section className={styles.irModalSection}>
                <div className={styles.irTicketSectionHeader}>
                  <p className={styles.irModalSectionTitle}>Parts</p>
                  <button type="button" onClick={addTicketPart} disabled={ticketSaving}>+ Add part</button>
                </div>
                {ticketForm.partsUsed.map((part, index) => (
                  <div key={index} className={styles.irTicketPartRow}>
                    <label className={styles.irTicketField}>
                      <span>Part</span>
                      <input
                        list="irrigation-ticket-parts"
                        value={part.part}
                        onChange={e => chooseTicketPart(index, e.target.value)}
                        onBlur={e => reconcileTicketPart(index, e.currentTarget.value)}
                        disabled={ticketSaving}
                      />
                    </label>
                    <label className={styles.irTicketField}>
                      <span>Qty</span>
                      <input type="number" min="0" step="0.01" value={part.qty} onChange={e => changeTicketPartQty(index, e.target.value)} disabled={ticketSaving} />
                    </label>
                    <label className={styles.irTicketField}>
                      <span>Cost</span>
                      <input type="number" min="0" step="0.01" value={part.cost} onChange={e => updateTicketPart(index, { cost: e.target.value })} disabled={ticketSaving} />
                    </label>
                    <button type="button" className={styles.irTicketRemoveBtn} onClick={() => removeTicketPart(index)} disabled={ticketSaving}>
                      Remove
                    </button>
                  </div>
                ))}
                <datalist id="irrigation-ticket-parts">
                  {irrigationPartOptions.map(item => (
                    <option
                      key={item.id}
                      value={item.name}
                      label={inventoryPartUnitPrice(item) == null ? (item.category || item.kind) : formatMoneyLabel(inventoryPartUnitPrice(item))}
                    />
                  ))}
                </datalist>
                <div className={styles.irTicketTotal}>
                  <span>Parts total</span>
                  <strong>{formatMoneyLabel(ticketPartsTotal)}</strong>
                </div>
              </section>

              <section className={styles.irModalSection}>
                <p className={styles.irModalSectionTitle}>Notes</p>
                <label className={styles.irTicketField}>
                  <span>Notes</span>
                  <textarea rows={3} value={ticketForm.notes} onChange={e => updateTicketForm({ notes: e.target.value })} disabled={ticketSaving} />
                </label>
              </section>
            </div>

            <footer className={styles.irTicketFooter}>
              <button type="button" className={styles.irModalClose} onClick={closeTicketForm} disabled={ticketSaving}>Cancel</button>
              <button type="submit" className="opActionBtn" disabled={ticketSaving}>
                {ticketSaving ? 'Saving...' : (editingRepairId ? 'Save Changes' : 'Save Ticket')}
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {selected && (() => {
        const sm         = STATUS_META[selected.status] || { label: selected.status, cls: '' }
        const accent     = PRIORITY_ACCENT[selected.priority] || 'var(--color-accent)'
        const issueLabel = ISSUE_TYPE_LABELS[selected.issueType] || selected.issueType
        const repairTags = [selected.priority, selected.issueType, selected.area].filter(Boolean)

        return (
          <div className={styles.irModalOverlay}>
            <div className={styles.irModalPanel} onClick={e => e.stopPropagation()}>
              <div className={styles.irModalAccent} style={{ background: accent }} />
              <div className={styles.irModalBody}>

                {/* Header */}
                <div className={styles.irModalHeader}>
                  <div>
                    <h2 className={styles.irModalTitle}>{issueLabel}</h2>
                    <p className={styles.irModalSub}>
                      {selected.hole != null ? `Hole ${selected.hole} · ` : ''}{selected.area}
                      {selected.headNumber ? ` · Head #${selected.headNumber}` : ''}
                    </p>
                  </div>
                  <span className={`${styles.irStatusBadge} ${styles[sm.cls]}`}>{sm.label}</span>
                </div>

                {/* Repair Overview */}
                <div className={styles.irModalSection}>
                  <p className={styles.irModalSectionTitle}>Repair Overview</p>
                  <div className={styles.irFieldGrid}>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Repair ID</span>
                      <span className={styles.irFieldValue}>{selected.repairId}</span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Issue Type</span>
                      <span className={styles.irFieldValue}>{issueLabel}</span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Priority</span>
                      <span className={styles.irFieldValue} style={{ color: accent, fontWeight: 600, textTransform: 'capitalize' }}>
                        {selected.priority}
                      </span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Status</span>
                      <span className={styles.irFieldValue} style={{ textTransform: 'capitalize' }}>
                        {selected.status.replace('-', ' ')}
                      </span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Date Reported</span>
                      <span className={styles.irFieldValue}>{selected.dateReported}</span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Date Completed</span>
                      <span className={styles.irFieldValue}>
                        {selected.dateCompleted || (selected.status === 'completed' ? '—' : 'In progress')}
                      </span>
                    </div>
                  </div>
                  {selected.description && (
                    <p className={styles.irModalDesc}>{selected.description}</p>
                  )}
                </div>

                {/* Location */}
                <div className={styles.irModalSection}>
                  <p className={styles.irModalSectionTitle}>Location</p>
                  <div className={styles.irFieldGrid}>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Hole</span>
                      <span className={styles.irFieldValue}>
                        {selected.hole != null ? `Hole ${selected.hole}` : '—'}
                      </span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Area</span>
                      <span className={styles.irFieldValue}>{selected.area}</span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Head Number</span>
                      <span className={styles.irFieldValue}>
                        {selected.headNumber ? `#${selected.headNumber}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Parts Used */}
                <div className={styles.irModalSection}>
                  <p className={styles.irModalSectionTitle}>Parts Used</p>
                  {selected.partsUsed.length > 0 ? (
                    <div className={styles.irPartsTable}>
                      <div className={styles.irPartsHeader}>
                        <span className={styles.irPartsQtyHead}>Qty</span>
                        <span className={styles.irPartsNameHead}>Part / Material</span>
                        <span className={styles.irPartsCostHead}>Cost</span>
                      </div>
                      {selected.partsUsed.map((p, i) => (
                        <div key={i} className={styles.irPartsRow}>
                          <span className={styles.irPartsQty}>{p.qty}</span>
                          <span className={styles.irPartsName}>{p.part}</span>
                          <span className={styles.irPartsCost}>{p.cost != null ? formatMoneyLabel(p.cost) : '-'}</span>
                        </div>
                      ))}
                      <div className={styles.irPartsRow}>
                        <span className={styles.irPartsQty}></span>
                        <span className={styles.irPartsName}><strong>Parts total</strong></span>
                        <span className={styles.irPartsCost}><strong>{formatMoneyLabel(partsTotal(selected.partsUsed))}</strong></span>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.irNoParts}>No parts required.</p>
                  )}
                </div>

                {/* Labor */}
                <div className={styles.irModalSection}>
                  <p className={styles.irModalSectionTitle}>Labor</p>
                  <div className={styles.irFieldGrid}>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Assigned To</span>
                      <span className={styles.irFieldValue}>
                        {selected.assignedTo || <em style={{ color: 'var(--color-muted)' }}>Unassigned</em>}
                      </span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Labor Hours</span>
                      <span className={styles.irFieldValue}>
                        {selected.laborHours > 0 ? `${selected.laborHours}h` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {selected.notes && (
                  <div className={styles.irModalSection}>
                    <p className={styles.irModalSectionTitle}>Notes</p>
                    <p className={styles.irModalNotes}>{selected.notes}</p>
                  </div>
                )}

                {/* GPS / Map Placeholder */}
                <div className={styles.irModalSection}>
                  <p className={styles.irModalSectionTitle}>GPS / Head Map</p>
                  <div className={styles.irMapPlaceholder}>
                    <span className={styles.irMapPlaceholderText}>
                      Interactive head map coming soon
                      {selected.headNumber ? ` · Head #${selected.headNumber}` : ''}
                      {selected.hole != null ? ` · Hole ${selected.hole}` : ''}
                    </span>
                    <span className={styles.irMapPlaceholderSub}>
                      Toro Lynx / QIS integration · GPS coordinates · Layer overlay
                    </span>
                  </div>
                </div>

                {/* Attachments */}
                <div className={styles.irModalSection} ref={attachSectionRef}>
                  <p className={styles.irModalSectionTitle}>Attachments</p>
                  <UploadCenter
                    module={selected.repairId}
                    type="image"
                    tags={repairTags}
                    title="Photos"
                  />
                  <UploadCenter
                    module={`${selected.repairId}-docs`}
                    type="document"
                    tags={repairTags}
                    title="Documents"
                  />
                </div>

                <div className="opActionRow">
                  <button
                    className="opActionBtn"
                    onClick={() => openEditTicket(selected)}
                  >
                    Edit Ticket
                  </button>
                  <button
                    className={styles.irModalDeleteBtn}
                    onClick={e => handleDeleteRepair(selected, e)}
                  >
                    Delete Ticket
                  </button>
                  <button
                    className="opActionBtn"
                    onClick={() => generateRepairReport(selected)}
                    disabled={reportLoading}
                  >
                    {reportLoading ? 'Loading…' : 'Generate Report'}
                  </button>
                  <button
                    className="opActionBtn"
                    onClick={() => { handleScheduleRepair(selected); closeModal() }}
                    disabled={selected.status === 'completed'}
                    title={selected.status === 'completed' ? 'Already completed' : 'Add to Operations Calendar'}
                  >
                    + Schedule Repair
                  </button>
                  <button className={styles.irModalClose} onClick={closeModal}>
                    Close
                  </button>
                </div>

              </div>
            </div>
          </div>
        )
      })()}

      <ReportPreviewModal
        report={activeReport}
        onClose={handleCloseReport}
      />

    </div>
  )
}
