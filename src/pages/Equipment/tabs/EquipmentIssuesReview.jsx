import { useMemo, useRef, useState } from 'react'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import { EmptyState } from '../../../components/shared/EmptyState'
import { useToast } from '../../../utils/feedback/toastContext'
import { useCrewData } from '../../../utils/crew/crewStore'
import {
  useEquipmentData,
  patchEquipment,
  createMaintenance,
  patchMaintenance,
  deleteMaintenance,
} from '../../../utils/equipment/equipmentStore'
import {
  useEquipmentIssuesData,
  patchEquipmentIssue,
  deleteEquipmentIssue,
} from '../../../utils/equipment/equipmentIssueStore'
import { refreshInventoryData, useInventoryData } from '../../../utils/inventory/inventoryStore'
import { openMechanicWorkOrder } from '../../../utils/equipment/maintenanceTicketPdf'
import styles from './EquipmentIssuesReview.module.css'

const FILTERS = [
  { id: 'pending_review', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
]

const ISSUE_STATUS_OPTIONS = [
  ['pending_review', 'Pending'],
  ['approved', 'Approved'],
  ['resolved', 'Resolved'],
  ['rejected', 'Rejected'],
]

const TICKET_STAGE_OPTIONS = [
  ['needs_service', 'Needs service'],
  ['parts_ordered', 'Parts ordered'],
  ['being_repaired', 'Being repaired'],
  ['resolved', 'Resolved'],
]

const EQUIPMENT_STATUS_OPTIONS = [
  ['in-service', 'In Service'],
  ['out-of-service', 'Out of Service'],
]

function normalizeEquipmentStatus(status) {
  return status === 'out-of-service' || status === 'out_of_service' || status === 'down'
    ? 'out-of-service'
    : 'in-service'
}

const INITIAL_SERVICE_FORM = {
  equipmentId:  '',
  serviceType:  'Service needed',
  ticketStage:  'needs_service',
  equipmentStatus: 'out-of-service',
  priority:     'routine',
  date:         '',
  technician:   '',
  notes:        '',
}

const EMPTY_TICKET = {
  sourceType:    '',
  sourceId:      '',
  maintenanceId: null,
  equipmentId:   '',
  equipmentName: '',
  equipmentStatus: 'in-service',
  serviceType:   '',
  ticketStage:   'resolved',
  priority:      'routine',
  date:          '',
  completedDate: '',
  technicianEmployeeId: '',
  technician:    '',
  laborHours:    '',
  parts:         [{ part: '', qty: '', cost: '' }],
  notes:         '',
}

const OPEN_SERVICE_STATUSES = new Set(['open', 'scheduled', 'in-progress', 'in_progress', 'pending', 'overdue'])
const RESOLVED_SERVICE_STATUSES = new Set(['completed', 'resolved', 'closed'])

function sortServices(a, b) {
  const priorityRank = { critical: 0, high: 1, routine: 2, low: 3 }
  return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9)
    || String(a.date ?? '').localeCompare(String(b.date ?? ''))
    || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isFutureService(item, today = localDateKey()) {
  const date = String(item?.date ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date > today
}

function label(value) {
  if (!value) return ''
  return String(value).replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function priorityTone(priority) {
  if (priority === 'critical') return 'critical'
  if (priority === 'high') return 'warn'
  return 'normal'
}

function ticketStageLabel(value, status) {
  const stage = String(value || '').toLowerCase()
  const found = TICKET_STAGE_OPTIONS.find(([key]) => key === stage)
  if (found) return found[1]
  if (RESOLVED_SERVICE_STATUSES.has(String(status ?? '').toLowerCase())) return 'Resolved'
  return 'Needs service'
}

function statusForTicketStage(stage) {
  if (stage === 'resolved') return 'completed'
  if (stage === 'being_repaired' || stage === 'parts_ordered') return 'in-progress'
  return 'open'
}

function parseOptionalNumber(value, fieldName) {
  if (value === '' || value == null) return null
  const next = Number(value)
  if (!Number.isFinite(next) || next < 0) throw new Error(`${fieldName} must be a positive number.`)
  return next
}

function cleanParts(parts) {
  return parts
    .map(part => ({
      inventoryItemId: part.inventoryItemId || null,
      part: String(part.part ?? '').trim(),
      qty:  parseOptionalNumber(part.qty, 'Part quantity'),
      cost: parseOptionalNumber(part.cost, 'Part cost'),
    }))
    .filter(part => part.part || part.qty != null || part.cost != null)
}

function partsTotal(parts) {
  return parts.reduce((sum, part) => sum + (Number(part.cost) || 0), 0)
}

function laborTotal(hours, payRate) {
  const parsedHours = Number(hours)
  const parsedRate = Number(payRate)
  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedRate)) return null
  if (parsedHours < 0 || parsedRate < 0) return null
  return parsedHours * parsedRate
}

function employeePayLabel(employee) {
  if (employee?.hidePayRate) return 'Hidden'
  if (employee?.payType === 'salary' && employee.salaryAmount != null) {
    return `${formatMoneyLabel(employee.salaryAmount)} / yr`
  }
  if (employee?.payRate != null) return `${formatMoneyLabel(employee.payRate)} / hr`
  return '--'
}

function formatMoneyInput(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return (Math.round(number * 100) / 100).toFixed(2)
}

function formatMoneyLabel(value) {
  const money = formatMoneyInput(value)
  return money ? `$${money}` : '--'
}

function normalizePartLookup(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
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

function ticketForIssue(issue, noteText = '', equipmentStatus = 'in-service') {
  return {
    ...EMPTY_TICKET,
    sourceType:    'issue',
    sourceId:      issue.id,
    equipmentId:   issue.equipmentId || '',
    equipmentName: issue.equipmentName || '',
    equipmentStatus: normalizeEquipmentStatus(equipmentStatus),
    serviceType:   `Issue repair - ${issue.equipmentName || 'Equipment'}`,
    ticketStage:   'resolved',
    priority:      issue.priority || 'routine',
    date:          new Date().toISOString().slice(0, 10),
    completedDate: new Date().toISOString().slice(0, 10),
    notes: [
      issue.description,
      noteText ? `Supervisor note: ${noteText}` : '',
    ].filter(Boolean).join('\n'),
  }
}

function ticketForService(item) {
  const status = String(item.status ?? '').toLowerCase()
  const resolved = RESOLVED_SERVICE_STATUSES.has(status)
  return {
    ...EMPTY_TICKET,
    sourceType:    'service',
    sourceId:      item.id,
    maintenanceId: item.id,
    equipmentId:   item.equipmentId || '',
    equipmentName: item.equipmentName || '',
    equipmentStatus: normalizeEquipmentStatus(item.equipmentStatus),
    serviceType:   item.serviceType || 'Service needed',
    ticketStage:   item.ticketStage || (resolved ? 'resolved' : 'needs_service'),
    priority:      item.priority || 'routine',
    date:          item.date || new Date().toISOString().slice(0, 10),
    completedDate: resolved
      ? (item.completedDate || item.date || new Date().toISOString().slice(0, 10))
      : '',
    technicianEmployeeId: item.technicianEmployeeId || '',
    technician:    item.technician || '',
    laborHours:    item.laborHours == null ? '' : String(item.laborHours),
    parts:         Array.isArray(item.partsUsed) && item.partsUsed.length > 0
      ? item.partsUsed.map(part => ({
        inventoryItemId: part.inventoryItemId || null,
        part: part.part || part.name || '',
        qty:  part.qty == null ? '' : String(part.qty),
        cost: part.cost == null ? '' : String(part.cost),
      }))
      : [{ part: '', qty: '', cost: '' }],
    notes: item.notes || '',
  }
}

export default function EquipmentIssuesReview() {
  const { issues, loading, error } = useEquipmentIssuesData()
  const { equipment, serviceLog } = useEquipmentData()
  const { employees } = useCrewData()
  const { items: inventoryItems } = useInventoryData()
  const [filter, setFilter] = useState('pending_review')
  const [notes, setNotes] = useState({})
  const [serviceForm, setServiceForm] = useState(INITIAL_SERVICE_FORM)
  const [serviceSaving, setServiceSaving] = useState(false)
  const [ticket, setTicket] = useState(null)
  const [ticketSaving, setTicketSaving] = useState(false)
  const servicePanelRef = useRef(null)
  const toast = useToast()

  const partOptions = useMemo(
    () => inventoryItems
      .filter(item => item.kind === 'part' || item.kind === 'irrigation')
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [inventoryItems],
  )
  const ticketPartOptions = useMemo(() => {
    const unit = equipment.find(item => item.id === ticket?.equipmentId)
    if (!unit) return []
    const equipmentName = normalizePartLookup(unit.name)
    return partOptions.filter(part => {
      const compatible = Array.isArray(part.equipmentList)
        ? part.equipmentList
        : [part.equipment].filter(Boolean)
      return compatible.some(name => normalizePartLookup(name) === equipmentName)
    })
  }, [equipment, partOptions, ticket?.equipmentId])
  const partOptionsByName = useMemo(() => {
    const options = new Map()
    for (const part of ticketPartOptions) {
      options.set(normalizePartLookup(part.name), part)
      if (part.partNumber) options.set(normalizePartLookup(part.partNumber), part)
    }
    return options
  }, [ticketPartOptions])

  const serviceBuckets = useMemo(() => {
    const pending = []
    const open = []
    const resolved = []
    const today = localDateKey()
    for (const item of serviceLog ?? []) {
      const status = String(item.status ?? '').toLowerCase()
      if (isFutureService(item, today)) pending.push(item)
      else if (OPEN_SERVICE_STATUSES.has(status)) open.push(item)
      else if (RESOLVED_SERVICE_STATUSES.has(status)) resolved.push(item)
    }
    return {
      pending:  pending.sort(sortServices),
      open:     open.sort(sortServices),
      resolved: resolved.sort(sortServices),
    }
  }, [serviceLog])

  const visibleServiceItems = filter === 'pending_review'
    ? serviceBuckets.pending
    : filter === 'resolved'
    ? serviceBuckets.resolved
    : filter === 'approved'
      ? serviceBuckets.open
    : filter === 'all'
      ? [...serviceBuckets.pending, ...serviceBuckets.open, ...serviceBuckets.resolved]
      : []

  const counts = useMemo(() => ({
    pending_review: issues.filter(issue => issue.status === 'pending_review').length + serviceBuckets.pending.length,
    approved:       issues.filter(issue => issue.status === 'approved').length + serviceBuckets.open.length,
    resolved:       issues.filter(issue => issue.status === 'resolved').length + serviceBuckets.resolved.length,
    rejected:       issues.filter(issue => issue.status === 'rejected').length,
    all:            issues.length + serviceBuckets.pending.length + serviceBuckets.open.length + serviceBuckets.resolved.length,
  }), [issues, serviceBuckets.pending.length, serviceBuckets.open.length, serviceBuckets.resolved.length])

  const visibleIssues = useMemo(() => {
    const list = filter === 'all' ? issues : issues.filter(issue => issue.status === filter)
    return [...list].sort((a, b) => {
      const statusRank = { pending_review: 0, approved: 1, resolved: 2, rejected: 3 }
      const priorityRank = { critical: 0, high: 1, routine: 2, low: 3 }
      return (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
        || (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9)
        || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
    })
  }, [filter, issues])

  const ticketEmployee = useMemo(
    () => employees.find(employee => employee.id === ticket?.technicianEmployeeId) ?? null,
    [employees, ticket?.technicianEmployeeId],
  )
  const ticketLaborTotal = laborTotal(ticket?.laborHours, ticketEmployee?.payRate)
  const ticketPartsTotal = ticket ? partsTotal(ticket.parts) : 0
  const ticketGrandTotal = (ticketLaborTotal ?? 0) + ticketPartsTotal

  function noteFor(issue) {
    return notes[issue.id] ?? issue.supervisorNotes ?? ''
  }

  async function setStatus(issue, status) {
    try {
      await patchEquipmentIssue(issue.id, {
        status,
        supervisorNotes: noteFor(issue) || null,
      })
      toast.success?.(status === 'approved' ? 'Issue approved for mechanic board' : `Issue marked ${label(status)}`)
    } catch (err) {
      toast.error?.(`Save failed: ${err.message}`)
    }
  }

  function changeIssueStatus(issue, status) {
    if (status === 'resolved') {
      setTicket(ticketForIssue(issue, noteFor(issue), 'in-service'))
      return
    }
    setStatus(issue, status)
  }

  async function removeIssue(issue) {
    if (!window.confirm(`Delete issue for ${issue.equipmentName}?`)) return
    try {
      await deleteEquipmentIssue(issue.id)
      toast.success?.('Equipment issue deleted')
    } catch (err) {
      toast.error?.(`Delete failed: ${err.message}`)
    }
  }

  function updateServiceField(field, value) {
    setServiceForm(prev => ({ ...prev, [field]: value }))
  }

  function chooseServiceEquipment(equipmentId) {
    const unit = equipment.find(item => item.id === equipmentId)
    setServiceForm(prev => ({
      ...prev,
      equipmentId,
      equipmentStatus: normalizeEquipmentStatus(unit?.status),
    }))
  }

  function chooseTicketEquipment(equipmentId) {
    const unit = equipment.find(item => item.id === equipmentId)
    updateTicket({
      equipmentId,
      equipmentName: unit?.name || '',
      equipmentStatus: normalizeEquipmentStatus(unit?.status),
    })
  }

  async function addServiceNeeded(event) {
    event.preventDefault()
    if (!serviceForm.equipmentId) {
      toast.info?.('Pick equipment first')
      return
    }
    if (!serviceForm.serviceType.trim()) {
      toast.info?.('Service type is required')
      return
    }
    setServiceSaving(true)
    try {
      await createMaintenance({
        equipmentId:  serviceForm.equipmentId,
        serviceType:  serviceForm.serviceType.trim(),
        status:       statusForTicketStage(serviceForm.ticketStage),
        ticketStage:  serviceForm.ticketStage,
        priority:     serviceForm.priority,
        date:         serviceForm.date || new Date().toISOString().slice(0, 10),
        technician:   serviceForm.technician.trim() || null,
        notes:        serviceForm.notes.trim() || null,
      })
      await patchEquipment(serviceForm.equipmentId, { status: serviceForm.equipmentStatus })
      setServiceForm(INITIAL_SERVICE_FORM)
      toast.success?.('Service needed added to mechanic board')
    } catch (err) {
      toast.error?.(`Service save failed: ${err.message}`)
    } finally {
      setServiceSaving(false)
    }
  }

  function updateTicket(patch) {
    setTicket(prev => ({ ...prev, ...patch }))
  }

  async function updateServiceStage(item, ticketStage) {
    try {
      await patchMaintenance(item.id, {
        ticketStage,
        status:        statusForTicketStage(ticketStage),
        completedDate: ticketStage === 'resolved'
          ? (item.completedDate || new Date().toISOString().slice(0, 10))
          : null,
      })
      toast.success?.(`Ticket moved to ${ticketStageLabel(ticketStage)}`)
    } catch (err) {
      toast.error?.(`Stage update failed: ${err.message}`)
    }
  }

  function updateTicketPart(index, patch) {
    setTicket(prev => ({
      ...prev,
      parts: prev.parts.map((part, partIndex) => partIndex === index ? { ...part, ...patch } : part),
    }))
  }

  function findInventoryPart(partName, { allowPartial = false } = {}) {
    const lookup = normalizePartLookup(partName)
    if (!lookup) return null
    const direct = partOptionsByName.get(lookup)
    if (direct) return direct
    if (!allowPartial) return null
    return ticketPartOptions.find(part => {
      const name = normalizePartLookup(part.name)
      const partNumber = normalizePartLookup(part.partNumber)
      return name.includes(lookup) || (partNumber && partNumber.includes(lookup))
    }) ?? null
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

  function chooseTicketPart(index, partName) {
    setTicket(prev => ({
      ...prev,
      parts: prev.parts.map((part, partIndex) => {
        if (partIndex !== index) return part
        const next = { ...part, inventoryItemId: null, part: partName }
        return { ...next, ...pricePatchForInventoryPart(next, findInventoryPart(partName)) }
      }),
    }))
  }

  function reconcileTicketPart(index, partName) {
    setTicket(prev => ({
      ...prev,
      parts: prev.parts.map((part, partIndex) => {
        if (partIndex !== index) return part
        const next = { ...part, inventoryItemId: null, part: partName }
        return { ...next, ...pricePatchForInventoryPart(next, findInventoryPart(partName, { allowPartial: true })) }
      }),
    }))
  }

  function changeTicketPartQty(index, qty) {
    setTicket(prev => ({
      ...prev,
      parts: prev.parts.map((part, partIndex) => {
        if (partIndex !== index) return part
        const next = { ...part, qty }
        return { ...next, ...pricePatchForInventoryPart(next, findInventoryPart(part.part), qty) }
      }),
    }))
  }

  function addTicketPart() {
    setTicket(prev => ({ ...prev, parts: [...prev.parts, { part: '', qty: '', cost: '' }] }))
  }

  function removeTicketPart(index) {
    setTicket(prev => ({
      ...prev,
      parts: prev.parts.length <= 1
        ? [{ part: '', qty: '', cost: '' }]
        : prev.parts.filter((_, partIndex) => partIndex !== index),
    }))
  }

  function chooseTicketEmployee(employeeId) {
    const employee = employees.find(item => item.id === employeeId)
    updateTicket({
      technicianEmployeeId: employeeId,
      technician: employee?.name || '',
    })
  }

  async function submitResolutionTicket(event) {
    event.preventDefault()
    if (!ticket) return
    if (!ticket.equipmentId) {
      toast.info?.('Pick equipment for the ticket')
      return
    }
    if (ticket.ticketStage === 'resolved' && !ticket.technicianEmployeeId && !ticket.technician.trim()) {
      toast.info?.('Assign the employee who fixed it')
      return
    }
    let laborHours
    let partsUsed
    try {
      laborHours = parseOptionalNumber(ticket.laborHours, 'Labor hours')
      partsUsed = cleanParts(ticket.parts)
    } catch (err) {
      toast.info?.(err.message)
      return
    }

    const ticketStage = ticket.ticketStage || 'resolved'
    const today = new Date().toISOString().slice(0, 10)
    const completedDate = ticketStage === 'resolved'
      ? (ticket.completedDate || ticket.date || today)
      : null

    const payload = {
      equipmentId:           ticket.equipmentId,
      serviceType:           ticket.serviceType.trim() || 'Equipment issue repair',
      status:                statusForTicketStage(ticketStage),
      ticketStage,
      priority:              ticket.priority || 'routine',
      date:                  ticket.date || completedDate || today,
      completedDate,
      technicianEmployeeId:  ticket.technicianEmployeeId || null,
      technician:            ticket.technician.trim() || null,
      laborHours,
      partsUsed,
      cost:                  partsTotal(partsUsed) + (laborTotal(laborHours, ticketEmployee?.payRate) ?? 0),
      notes:                 ticket.notes.trim() || null,
    }

    setTicketSaving(true)
    try {
      if (ticket.maintenanceId) {
        await patchMaintenance(ticket.maintenanceId, payload)
      } else {
        await createMaintenance(payload)
      }
      await patchEquipment(ticket.equipmentId, { status: ticket.equipmentStatus })
      if (ticketStage === 'resolved') await refreshInventoryData()
      if (ticket.sourceType === 'issue' && ticketStage === 'resolved') {
        const issue = issues.find(item => item.id === ticket.sourceId)
        await patchEquipmentIssue(ticket.sourceId, {
          status: 'resolved',
          supervisorNotes: noteFor(issue ?? {}) || ticket.notes || null,
        })
      }
      setTicket(null)
      toast.success?.(ticketStage === 'resolved' ? 'Resolution ticket saved' : 'Ticket saved')
    } catch (err) {
      toast.error?.(`Resolve failed: ${err.message}`)
    } finally {
      setTicketSaving(false)
    }
  }

  async function removeService(item) {
    if (!window.confirm(`Delete service needed for ${item.equipmentName || 'this equipment'}?`)) return
    try {
      await deleteMaintenance(item.id)
      await refreshInventoryData()
      toast.success?.('Service needed deleted')
    } catch (err) {
      toast.error?.(`Delete failed: ${err.message}`)
    }
  }

  async function reopenService(item) {
    try {
      await patchMaintenance(item.id, {
        status:        'open',
        ticketStage:   'needs_service',
        completedDate: null,
      })
      await patchEquipment(item.equipmentId, { status: 'out-of-service' })
      toast.success?.('Ticket reopened on mechanic board')
    } catch (err) {
      toast.error?.(`Reopen failed: ${err.message}`)
    }
  }

  function printWorkOrder(nextTicket, event) {
    event?.stopPropagation?.()
    const unit = equipment.find(item => item.id === nextTicket.equipmentId)
      ?? equipment.find(item => item.name === nextTicket.equipmentName)
    openMechanicWorkOrder(
      nextTicket,
      unit,
      inventoryItems,
      () => toast.error?.('Popup blocked. Allow popups to print the work order.'),
    )
  }

  function printIssueWorkOrder(issue, event) {
    const unit = equipment.find(item => item.id === issue.equipmentId)
      ?? equipment.find(item => item.name === issue.equipmentName)
    printWorkOrder({
      ...ticketForIssue(issue, noteFor(issue), normalizeEquipmentStatus(unit?.status)),
      ticketStage: 'needs_service',
      date: issue.createdAt ? String(issue.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
      completedDate: '',
    }, event)
  }

  return (
    <WorkspaceSection
      title="Equipment Issues"
      subtitle="Review staff reports before they show on the public mechanic board."
      actions={(
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.addServiceTopBtn}
            onClick={() => servicePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Add Service Needed
          </button>
          <a className={styles.boardLink} href="/equipment/board" target="_blank" rel="noreferrer">Open Mechanic Board</a>
        </div>
      )}
      filters={(
        <div className={styles.issueControls}>
          <div className={styles.filters} aria-label="Filter equipment tickets">
            {FILTERS.map(item => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? styles.activeFilter : ''}
                onClick={() => setFilter(item.id)}
              >
                {item.label} <span>{counts[item.id] ?? 0}</span>
              </button>
            ))}
          </div>
          <form ref={servicePanelRef} className={styles.servicePanel} onSubmit={addServiceNeeded}>
            <div className={styles.servicePanelHeader}>
              <div>
                <h3>Add Service Needed</h3>
                <p>Supervisor-created service items show directly on the mechanic board.</p>
              </div>
              <button type="submit" disabled={serviceSaving || !serviceForm.equipmentId}>
                {serviceSaving ? 'Adding...' : 'Add Service'}
              </button>
            </div>
            <div className={styles.serviceGrid}>
              <label>
                <span>Equipment</span>
                <select
                  value={serviceForm.equipmentId}
                  onChange={event => chooseServiceEquipment(event.target.value)}
                >
                  <option value="">Choose equipment</option>
                  {equipment.map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Equipment status</span>
                <select value={serviceForm.equipmentStatus} onChange={event => updateServiceField('equipmentStatus', event.target.value)}>
                  {EQUIPMENT_STATUS_OPTIONS.map(([value, text]) => (
                    <option key={value} value={value}>{text}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Service</span>
                <input
                  value={serviceForm.serviceType}
                  onChange={event => updateServiceField('serviceType', event.target.value)}
                  placeholder="Reel grind, oil change, hydraulic leak..."
                />
              </label>
              <label>
                <span>Priority</span>
                <select value={serviceForm.priority} onChange={event => updateServiceField('priority', event.target.value)}>
                  <option value="routine">Routine</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label>
                <span>Ticket stage</span>
                <select value={serviceForm.ticketStage} onChange={event => updateServiceField('ticketStage', event.target.value)}>
                  {TICKET_STAGE_OPTIONS.filter(([key]) => key !== 'resolved').map(([key, value]) => (
                    <option key={key} value={key}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Date</span>
                <input
                  type="date"
                  value={serviceForm.date}
                  onChange={event => updateServiceField('date', event.target.value)}
                />
              </label>
              <label>
                <span>Technician</span>
                <input
                  value={serviceForm.technician}
                  onChange={event => updateServiceField('technician', event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label className={styles.serviceNotes}>
                <span>Notes</span>
                <textarea
                  value={serviceForm.notes}
                  onChange={event => updateServiceField('notes', event.target.value)}
                  placeholder="What needs to be done?"
                  rows={2}
                />
              </label>
            </div>
          </form>
          <section className={styles.serviceListPanel} aria-label="Services needed">
            <div className={styles.serviceListHeader}>
              <div>
                <h3>{filter === 'pending_review' ? 'Pending Services' : filter === 'resolved' ? 'Resolved Services' : 'Services Needed'}</h3>
                <p>
                  {filter === 'pending_review'
                    ? `${visibleServiceItems.length} future-dated service item${visibleServiceItems.length === 1 ? '' : 's'}.`
                    : filter === 'resolved'
                    ? `${visibleServiceItems.length} archived service item${visibleServiceItems.length === 1 ? '' : 's'}.`
                    : `${visibleServiceItems.length} service item${visibleServiceItems.length === 1 ? '' : 's'} ${filter === 'all' ? 'tracked' : 'on the mechanic board'}.`}
                </p>
              </div>
            </div>
            {visibleServiceItems.length === 0 ? (
              <p className={styles.serviceEmpty}>
                {filter === 'pending_review'
                  ? 'No future-dated service items are pending.'
                  : filter === 'resolved' ? 'No resolved service items are archived.' : 'No supervisor service items are open.'}
              </p>
            ) : (
              <div className={styles.serviceList}>
                {visibleServiceItems.map(item => {
                  const resolved = RESOLVED_SERVICE_STATUSES.has(String(item.status ?? '').toLowerCase())
                  const stageLabel = ticketStageLabel(item.ticketStage, item.status)
                  return (
                  <article
                    key={item.id}
                    className={styles.serviceItem}
                    data-tone={priorityTone(item.priority)}
                    role="button"
                    tabIndex={0}
                    onClick={() => setTicket(ticketForService(item))}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setTicket(ticketForService(item))
                      }
                    }}
                    title="Click to edit ticket"
                  >
                    <div>
                      <h4>{item.equipmentName || 'Equipment'}</h4>
                      <p>{item.serviceType || 'Service needed'}{item.date ? ` - ${new Date(item.date).toLocaleDateString()}` : ''}</p>
                      <p className={styles.serviceStageLine}>Ticket progress: <strong>{stageLabel}</strong></p>
                      <p>Equipment: <strong>{normalizeEquipmentStatus(item.equipmentStatus) === 'out-of-service' ? 'Out of Service' : 'In Service'}</strong></p>
                      {resolved && item.completedDate && (
                        <p>Resolved {new Date(item.completedDate).toLocaleDateString()}</p>
                      )}
                      {item.notes && <p className={styles.serviceItemNotes}>{item.notes}</p>}
                    </div>
                    <div className={styles.serviceItemActions} onClick={event => event.stopPropagation()}>
                      <span>{label(item.priority)}</span>
                      <select
                        className={styles.stageSelect}
                        value={resolved ? 'resolved' : (item.ticketStage || 'needs_service')}
                        onChange={event => {
                          const nextStage = event.target.value
                          if (nextStage === 'resolved') {
                            setTicket({
                              ...ticketForService(item),
                              ticketStage:   'resolved',
                              equipmentStatus: 'in-service',
                              completedDate: new Date().toISOString().slice(0, 10),
                            })
                          } else if (resolved && nextStage === 'needs_service') {
                            reopenService(item)
                          } else {
                            updateServiceStage(item, nextStage)
                          }
                        }}
                        aria-label={`Ticket progress for ${item.equipmentName || 'equipment'}`}
                      >
                        {TICKET_STAGE_OPTIONS.map(([key, value]) => (
                          <option key={key} value={key}>{value}</option>
                        ))}
                      </select>
                      {resolved && (
                        <button type="button" className={styles.approve} onClick={() => reopenService(item)}>
                          Reopen
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.approve}
                        onClick={event => printWorkOrder(ticketForService(item), event)}
                      >
                        Print Work Order
                      </button>
                      <button type="button" className={styles.delete} onClick={() => removeService(item)}>Delete</button>
                    </div>
                  </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    >
      {error && <p className={styles.error}>Issue queue could not load. {error}</p>}
      {loading && <p className={styles.empty}>Loading equipment issues...</p>}
      {!loading && visibleIssues.length === 0 && visibleServiceItems.length === 0 && (
        <EmptyState
          title="No equipment issues here."
          description="Staff-submitted reports will appear here for review."
          compact
        />
      )}
      <div className={styles.issueList}>
        {visibleIssues.map(issue => (
          <article key={issue.id} className={styles.issueCard} data-tone={priorityTone(issue.priority)}>
            <div className={styles.issueMain}>
              <div className={styles.issueHeader}>
                <div>
                  <h3>{issue.equipmentName}</h3>
                  <p>{label(issue.issueType)}{issue.location ? ` - ${issue.location}` : ''}</p>
                </div>
                <div className={styles.badges}>
                  <span>{label(issue.priority)}</span>
                  <select
                    className={styles.stageSelect}
                    value={issue.status}
                    onChange={event => changeIssueStatus(issue, event.target.value)}
                    aria-label={`Status for ${issue.equipmentName || 'equipment issue'}`}
                  >
                    {ISSUE_STATUS_OPTIONS.map(([value, text]) => (
                      <option key={value} value={value}>{text}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className={styles.description}>{issue.description}</p>
              <p className={styles.meta}>
                Reported by {issue.reportedBy || 'staff'}{issue.createdAt ? ` on ${new Date(issue.createdAt).toLocaleDateString()}` : ''}
              </p>
              <label className={styles.noteBox}>
                <span>Supervisor note</span>
                <textarea
                  value={noteFor(issue)}
                  onChange={event => setNotes(prev => ({ ...prev, [issue.id]: event.target.value }))}
                  placeholder="Optional note for review or shop follow-up"
                  rows={2}
                />
              </label>
            </div>
            <div className={styles.issueActions}>
              <button type="button" className={styles.approve} onClick={event => printIssueWorkOrder(issue, event)}>
                Print Work Order
              </button>
              {issue.status === 'pending_review' && (
                <>
                  <button type="button" className={styles.approve} onClick={() => setStatus(issue, 'approved')}>Approve</button>
                  <button type="button" className={styles.reject} onClick={() => setStatus(issue, 'rejected')}>Reject</button>
                </>
              )}
              {issue.status === 'approved' && (
                <button type="button" className={styles.resolve} onClick={() => {
                  setTicket(ticketForIssue(issue, noteFor(issue), 'in-service'))
                }}>Resolve Ticket</button>
              )}
              {issue.status !== 'pending_review' && issue.status !== 'approved' && (
                <button type="button" className={styles.approve} onClick={() => setStatus(issue, 'approved')}>Reopen</button>
              )}
              <button type="button" className={styles.delete} onClick={() => removeIssue(issue)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
      {ticket && (
        <div className={styles.ticketBackdrop} role="dialog" aria-modal="true" aria-label="Edit equipment ticket">
          <form className={styles.ticketModal} onSubmit={submitResolutionTicket}>
            <header className={styles.ticketHeader}>
              <div>
                <h3>{ticket.maintenanceId ? 'Edit Ticket' : 'Resolution Ticket'}</h3>
                <p>{ticket.equipmentName || 'Equipment repair close-out'}</p>
              </div>
              <button type="button" onClick={() => setTicket(null)} disabled={ticketSaving}>X</button>
            </header>
            <div className={styles.ticketBody}>
              <div className={styles.ticketGrid}>
                <label>
                  <span>Equipment</span>
                  <select value={ticket.equipmentId} onChange={event => chooseTicketEquipment(event.target.value)}>
                    <option value="">Choose equipment</option>
                    {equipment.map(eq => (
                      <option key={eq.id} value={eq.id}>{eq.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Ticket date</span>
                  <input type="date" value={ticket.date} onChange={event => updateTicket({ date: event.target.value })} />
                </label>
                <label>
                  <span>Progress</span>
                  <select
                    value={ticket.ticketStage}
                    onChange={event => updateTicket({
                      ticketStage:   event.target.value,
                      equipmentStatus: event.target.value === 'resolved' ? 'in-service' : ticket.equipmentStatus,
                      completedDate: event.target.value === 'resolved'
                        ? (ticket.completedDate || new Date().toISOString().slice(0, 10))
                        : '',
                    })}
                  >
                    {TICKET_STAGE_OPTIONS.map(([key, value]) => (
                      <option key={key} value={key}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Equipment status</span>
                  <select value={ticket.equipmentStatus} onChange={event => updateTicket({ equipmentStatus: event.target.value })}>
                    {EQUIPMENT_STATUS_OPTIONS.map(([value, text]) => (
                      <option key={value} value={value}>{text}</option>
                    ))}
                  </select>
                </label>
                {ticket.ticketStage === 'resolved' && (
                  <label>
                    <span>Completed date</span>
                    <input type="date" value={ticket.completedDate} onChange={event => updateTicket({ completedDate: event.target.value })} />
                  </label>
                )}
                <label className={styles.ticketWide}>
                  <span>Repair / service</span>
                  <input value={ticket.serviceType} onChange={event => updateTicket({ serviceType: event.target.value })} />
                </label>
                <label>
                  <span>Employee assigned</span>
                  <select value={ticket.technicianEmployeeId} onChange={event => chooseTicketEmployee(event.target.value)}>
                    <option value="">Choose employee</option>
                    {employees.map(employee => (
                      <option key={employee.id} value={employee.id}>{employee.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Labor hours</span>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={ticket.laborHours}
                    onChange={event => updateTicket({ laborHours: event.target.value })}
                    placeholder="1.5"
                  />
                </label>
              </div>
              <section className={styles.ticketProgressSummary} aria-label="Ticket progress">
                <div>
                  <span>Ticket progress</span>
                  <strong>{ticketStageLabel(ticket.ticketStage, statusForTicketStage(ticket.ticketStage))}</strong>
                </div>
                <p>Change the progress stage here, then save the ticket. Resolved tickets stay archived under the Resolved tab.</p>
              </section>
              <section className={styles.ticketLaborSummary} aria-label="Labor total">
                <div>
                  <span>Labor total</span>
                  <strong>{formatMoneyLabel(ticketLaborTotal)}</strong>
                </div>
                <div>
                  <span>Hours</span>
                  <strong>{ticket.laborHours || '--'}</strong>
                </div>
                <div>
                  <span>Pay rate</span>
                  <strong>{employeePayLabel(ticketEmployee)}</strong>
                </div>
                <div>
                  <span>Ticket total</span>
                  <strong>{formatMoneyLabel(ticketGrandTotal)}</strong>
                </div>
                {ticketEmployee && ticketEmployee.payType === 'salary' && (
                  <p>{ticketEmployee.name} is set as salary. Hourly labor cost is not added to this ticket.</p>
                )}
                {ticketEmployee && ticketEmployee.payType !== 'salary' && ticketEmployee.payRate == null && (
                  <p>Set {ticketEmployee.name}'s pay rate in Employees to calculate labor.</p>
                )}
              </section>
              <section className={styles.ticketParts}>
                <div className={styles.ticketSectionHeader}>
                  <h4>Parts used</h4>
                  <button type="button" onClick={addTicketPart}>+ Add part</button>
                </div>
                {ticket.parts.map((part, index) => (
                  <div key={index} className={styles.partRow}>
                    <label>
                      <span>Part</span>
                      <input
                        list="equipment-resolution-parts"
                        value={part.part}
                        onChange={event => chooseTicketPart(index, event.target.value)}
                        onInput={event => chooseTicketPart(index, event.currentTarget.value)}
                        onBlur={event => reconcileTicketPart(index, event.currentTarget.value)}
                        placeholder="Filter, belt, hydraulic hose..."
                      />
                    </label>
                    <label>
                      <span>Qty</span>
                      <input type="number" min="0" step="0.01" value={part.qty} onChange={event => changeTicketPartQty(index, event.target.value)} />
                    </label>
                    <label>
                      <span>Total cost</span>
                      <input type="number" min="0" step="0.01" value={part.cost} onChange={event => updateTicketPart(index, { cost: event.target.value })} />
                    </label>
                    <button type="button" onClick={() => removeTicketPart(index)}>Remove</button>
                  </div>
                ))}
                <datalist id="equipment-resolution-parts">
                  {ticketPartOptions.map(part => (
                    <option
                      key={part.id}
                      value={part.name}
                      label={inventoryPartUnitPrice(part) == null ? undefined : `$${formatMoneyInput(inventoryPartUnitPrice(part))}`}
                    />
                  ))}
                </datalist>
              </section>
              <label className={styles.ticketNotes}>
                <span>Ticket notes</span>
                <textarea value={ticket.notes} rows={4} onChange={event => updateTicket({ notes: event.target.value })} />
              </label>
            </div>
            <footer className={styles.ticketFooter}>
              <button type="button" onClick={() => setTicket(null)} disabled={ticketSaving}>Cancel</button>
              <button type="button" onClick={event => printWorkOrder(ticket, event)} disabled={ticketSaving}>
                Print Work Order
              </button>
              <button type="submit" disabled={ticketSaving}>
                {ticketSaving ? 'Saving...' : (ticket.ticketStage === 'resolved' ? 'Save & Resolve' : 'Save Ticket')}
              </button>
            </footer>
          </form>
        </div>
      )}
    </WorkspaceSection>
  )
}
