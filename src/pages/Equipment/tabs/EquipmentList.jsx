import { useState, useMemo, useEffect, useRef } from 'react'
import {
  useEquipmentData,
  createEquipment,
  patchEquipment,
  deleteEquipment,
  createMaintenance,
} from '../../../utils/equipment/equipmentStore'
import { useToast } from '../../../utils/feedback/toastContext'
import { buildMaintenanceLogReport } from '../../../utils/reports/reportBuilder'
import { createAttachmentRef } from '../../../utils/reports/reportSchemas'
import { getMediaByModule, getThumbnailBlob } from '../../../utils/media/mediaStore'
import { openMaintenanceTicketPdf } from '../../../utils/equipment/maintenanceTicketPdf'
import UploadCenter from '../../../components/uploads/UploadCenter'
import ReportPreviewModal from '../../../components/reports/ReportPreviewModal'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import SideDrawer from '../../../components/primitives/SideDrawer'
import StatusBoard from '../../../components/primitives/StatusBoard'
import styles from '../Equipment.module.css'

const CATEGORIES = ['Greens Mower', 'Fairway Mower', 'Rough Mower', 'Sprayer', 'Spray', 'Utility', 'Specialty']
const STATUS_FILTERS = ['All', 'Operational', 'In Service', 'Needs Maintenance', 'Out of Service']
const STATUS_OPTIONS = [
  ['operational', 'Operational'],
  ['in-service', 'In Service'],
  ['needs-maintenance', 'Needs Maintenance'],
  ['out-of-service', 'Out of Service'],
]
const FUEL_OPTIONS = ['Diesel', 'Gas', 'Electric', 'Pre-Mix']

const STATUS_META = {
  'operational':       { label: 'Operational', cls: styles.eqStatusOperational },
  'in-service':        { label: 'In Service', cls: styles.eqStatusInService },
  'needs-maintenance': { label: 'Needs Maintenance', cls: styles.eqStatusMaint },
  'out-of-service':    { label: 'Out of Service', cls: styles.eqStatusOut },
}

const FILTER_KEY = {
  'Operational':       'operational',
  'In Service':        'in-service',
  'Needs Maintenance': 'needs-maintenance',
  'Out of Service':    'out-of-service',
}

const SORT_STATUS = {
  'out-of-service':    0,
  'needs-maintenance': 1,
  'in-service':        2,
  'operational':       3,
}

const FUEL_COLORS = {
  Diesel:    { bg: 'rgba(80,140,220,0.12)', color: '#6aabee', border: 'rgba(80,140,220,0.28)' },
  Gas:       { bg: 'rgba(210,160,50,0.12)', color: '#d4a43a', border: 'rgba(210,160,50,0.28)' },
  Electric:  { bg: 'rgba(74,200,140,0.12)', color: '#4ec88c', border: 'rgba(74,200,140,0.28)' },
  'Pre-Mix': { bg: 'rgba(180,100,40,0.12)', color: '#c47828', border: 'rgba(180,100,40,0.28)' },
}

const emptyEquipmentForm = {
  name: '',
  category: 'Utility',
  status: 'operational',
  hours: '',
  nextServiceHours: '',
  manufacturer: '',
  model: '',
  year: '',
  serialNumber: '',
  fuelType: 'Gas',
  tankCapacityGal: '',
  capacityLbs: '',
  heightOfCut: '',
  assignedOperator: '',
  lastService: '',
  lastServiceHours: '',
  serviceInterval: '',
  notes: '',
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function text(value) {
  return value == null ? '' : String(value)
}

function ticketStageLabel(value, status) {
  const stage = text(value).toLowerCase()
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

function buildCategoryOptions(equipment) {
  const seen = new Set()
  const options = []
  const add = value => {
    const label = text(value).trim()
    if (!label) return
    const key = label.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    options.push(label)
  }
  CATEGORIES.forEach(add)
  equipment.forEach(unit => add(unit.category))
  return options
}

function isMowerCategory(category) {
  return /mower|reel|rotary|cutting/i.test(text(category))
}

function numberOrNull(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function numberOrZero(value) {
  const n = numberOrNull(value)
  return n == null ? 0 : n
}

function formatHours(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '-'
}

function formFromEquipment(unit) {
  if (!unit) return emptyEquipmentForm
  return {
    name: text(unit.name),
    category: text(unit.category) || 'Utility',
    status: text(unit.status) || 'operational',
    hours: unit.hours ?? '',
    nextServiceHours: unit.nextServiceHours ?? '',
    manufacturer: text(unit.manufacturer),
    model: text(unit.model),
    year: unit.year ?? '',
    serialNumber: text(unit.serialNumber),
    fuelType: text(unit.fuelType) || 'Gas',
    tankCapacityGal: unit.tankCapacityGal ?? '',
    capacityLbs: unit.capacityLbs ?? '',
    heightOfCut: unit.heightOfCut ?? '',
    assignedOperator: text(unit.assignedOperator),
    lastService: text(unit.lastService),
    lastServiceHours: unit.lastServiceHours ?? '',
    serviceInterval: unit.serviceInterval ?? '',
    notes: text(unit.notes),
  }
}

function equipmentPayload(form) {
  const lastHours = numberOrNull(form.lastServiceHours)
  const interval = numberOrNull(form.serviceInterval)
  const nextHours = numberOrNull(form.nextServiceHours)
  return {
    name: form.name.trim(),
    category: form.category.trim(),
    status: form.status,
    hours: numberOrZero(form.hours),
    nextServiceHours: nextHours ?? (lastHours != null && interval != null ? lastHours + interval : null),
    manufacturer: form.manufacturer.trim() || null,
    model: form.model.trim() || null,
    year: numberOrNull(form.year),
    serialNumber: form.serialNumber.trim() || null,
    fuelType: form.fuelType || null,
    tankCapacityGal: numberOrNull(form.tankCapacityGal),
    capacityLbs: numberOrNull(form.capacityLbs),
    heightOfCut: numberOrNull(form.heightOfCut),
    assignedOperator: form.assignedOperator.trim() || null,
    lastService: form.lastService || null,
    lastServiceHours: lastHours,
    serviceInterval: interval,
    notes: form.notes.trim() || null,
  }
}

function blankServiceForm(unit) {
  return {
    serviceType: 'Preventive',
    status: 'completed',
    priority: 'routine',
    date: todayIso(),
    completedDate: todayIso(),
    hoursAtService: unit?.hours ?? '',
    nextDueHours: unit?.nextServiceHours ?? '',
    cost: '',
    technician: '',
    notes: '',
  }
}

function serviceWarning(hours, nextServiceHours) {
  const current = Number(hours)
  const next = Number(nextServiceHours)
  if (!Number.isFinite(current) || !Number.isFinite(next)) return null
  if (current >= next) return { label: 'Due Now', cls: styles.eqServiceDue }
  if (current >= next - 25) return { label: 'Due Soon', cls: styles.eqServiceSoon }
  return null
}

function hoursUntilService(hours, nextServiceHours) {
  const current = Number(hours)
  const next = Number(nextServiceHours)
  if (!Number.isFinite(current) || !Number.isFinite(next)) return 'Service interval not set'
  const remaining = next - current
  if (remaining <= 0) return `${Math.abs(remaining).toLocaleString()} hrs overdue`
  return `${remaining.toLocaleString()} hrs remaining`
}

function serviceProgress(unit) {
  const current = Number(unit.hours)
  const last = Number(unit.lastServiceHours)
  const next = Number(unit.nextServiceHours)
  if (!Number.isFinite(current) || !Number.isFinite(last) || !Number.isFinite(next) || next <= last) return null
  return Math.min(100, Math.max(0, Math.round(((current - last) / (next - last)) * 100)))
}

export default function EquipmentList({ initialSelectedId = null, onJumpToMaintenance } = {}) {
  const { equipment, serviceLog } = useEquipmentData()
  const safeEquipment = useMemo(() => Array.isArray(equipment) ? equipment : [], [equipment])
  const safeServiceLog = useMemo(() => Array.isArray(serviceLog) ? serviceLog : [], [serviceLog])
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [staFilter, setStaFilter] = useState('All')
  const [selected, setSelected] = useState(null)
  const [drawerMode, setDrawerMode] = useState(null)
  const [equipmentForm, setEquipmentForm] = useState(emptyEquipmentForm)
  const [serviceForm, setServiceForm] = useState(blankServiceForm(null))
  const [saving, setSaving] = useState(false)

  const seedRef = useRef(initialSelectedId)
  useEffect(() => {
    if (!seedRef.current) return
    const found = safeEquipment.find(eq => eq.id === seedRef.current)
    if (found) {
      setSelected(found)
      seedRef.current = null
    }
  }, [safeEquipment])

  const [activeReport, setActiveReport] = useState(null)
  const [activeReportActions, setActiveReportActions] = useState({})
  const [reportLoading, setReportLoading] = useState(false)
  const [reportThumbs, setReportThumbs] = useState([])
  const categoryOptions = useMemo(() => buildCategoryOptions(safeEquipment), [safeEquipment])
  const categoryFilters = useMemo(() => ['All', ...categoryOptions], [categoryOptions])

  function closeForms() {
    setDrawerMode(null)
    setSaving(false)
  }

  function openAddEquipment() {
    setSelected(null)
    setEquipmentForm(emptyEquipmentForm)
    setDrawerMode('add')
  }

  function openEditEquipment(unit) {
    setSelected(unit)
    setEquipmentForm(formFromEquipment(unit))
    setDrawerMode('edit')
  }

  function openServiceLog(unit) {
    setSelected(unit)
    setServiceForm(blankServiceForm(unit))
    setDrawerMode('service')
  }

  function setEqField(field, value) {
    setEquipmentForm(prev => ({ ...prev, [field]: value }))
  }

  function setServiceField(field, value) {
    setServiceForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'status' && value === 'completed' && !next.completedDate) next.completedDate = next.date || todayIso()
      if (field === 'date' && next.status === 'completed') next.completedDate = value
      return next
    })
  }

  async function handleSaveEquipment(e) {
    e.preventDefault()
    if (!equipmentForm.name.trim()) {
      toast.error?.('Equipment name is required')
      return
    }
    if (!equipmentForm.category.trim()) {
      toast.error?.('Equipment category is required')
      return
    }
    setSaving(true)
    try {
      const payload = equipmentPayload(equipmentForm)
      const saved = drawerMode === 'edit' && selected
        ? await patchEquipment(selected.id, payload)
        : await createEquipment(payload)
      toast.success?.(drawerMode === 'edit' ? 'Equipment updated' : 'Equipment added')
      setSelected(saved)
      closeForms()
    } catch (err) {
      toast.error?.(`Save failed: ${err.message}`)
      setSaving(false)
    }
  }

  async function handleDeleteEquipment(unit) {
    const ok = window.confirm(`Delete ${unit.name}? This also removes its maintenance history.`)
    if (!ok) return
    setSaving(true)
    try {
      await deleteEquipment(unit.id)
      toast.success?.('Equipment deleted')
      setSelected(null)
      closeForms()
    } catch (err) {
      toast.error?.(`Delete failed: ${err.message}`)
      setSaving(false)
    }
  }

  async function handleSaveService(e) {
    e.preventDefault()
    if (!selected) return
    if (!serviceForm.serviceType.trim()) {
      toast.error?.('Service type is required')
      return
    }
    setSaving(true)
    try {
      const hoursAtService = numberOrNull(serviceForm.hoursAtService)
      const nextDueHours = numberOrNull(serviceForm.nextDueHours)
      await createMaintenance({
        equipmentId: selected.id,
        serviceType: serviceForm.serviceType.trim(),
        status: serviceForm.status,
        priority: serviceForm.priority,
        date: serviceForm.date || todayIso(),
        completedDate: serviceForm.status === 'completed'
          ? (serviceForm.completedDate || serviceForm.date || todayIso())
          : null,
        hoursAtService,
        nextDueHours,
        cost: numberOrZero(serviceForm.cost),
        technician: serviceForm.technician.trim() || null,
        notes: serviceForm.notes.trim() || null,
        partsUsed: [],
      })
      if (serviceForm.status === 'completed') {
        const updates = {
          lastService: serviceForm.completedDate || serviceForm.date || todayIso(),
          lastServiceHours: hoursAtService,
          nextServiceHours: nextDueHours,
          status: selected.status === 'out-of-service' ? 'needs-maintenance' : selected.status,
        }
        if (hoursAtService != null) updates.hours = Math.max(Number(selected.hours) || 0, hoursAtService)
        if (hoursAtService != null && nextDueHours != null && nextDueHours > hoursAtService) {
          updates.serviceInterval = nextDueHours - hoursAtService
        }
        const saved = await patchEquipment(selected.id, updates)
        setSelected(saved)
      }
      toast.success?.('Service logged')
      closeForms()
      onJumpToMaintenance?.(selected.name)
    } catch (err) {
      toast.error?.(`Save failed: ${err.message}`)
      setSaving(false)
    }
  }

  function handleCloseReport() {
    reportThumbs.forEach(url => URL.revokeObjectURL(url))
    setReportThumbs([])
    setActiveReport(null)
    setActiveReportActions({})
  }

  function handleOpenHistoryTicketPdf(log, unit, event) {
    event?.stopPropagation?.()
    openMaintenanceTicketPdf(
      {
        ...log,
        equipmentName: log.equipmentName || unit?.name || 'Equipment',
        category: log.category || unit?.category || unit?.type || 'Equipment',
        serviceType: log.serviceType || 'Maintenance',
      },
      { ...unit, type: unit?.category ?? unit?.type },
      () => toast.error?.('Popup blocked. Allow popups to view the ticket PDF.'),
    )
  }

  async function generateEquipmentHistory(unit) {
    setReportLoading(true)
    try {
      const [photos, docs] = await Promise.all([
        getMediaByModule(unit.id).catch(() => []),
        getMediaByModule(`${unit.id}-docs`).catch(() => []),
      ])
      const allMedia = [...photos, ...docs]
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
          } catch { /* thumbnail optional */ }
        }
        return createAttachmentRef({
          id: rec.id,
          filename: rec.filename,
          type: rec.type,
          thumbnailUrl,
          size: rec.size,
        })
      }))

      const historyLogs = safeServiceLog
        .filter(l => l.equipmentId === unit.id)
      const logs = historyLogs
        .map(l => ({
          date: l.completedDate ?? l.date,
          stage: ticketStageLabel(l.ticketStage, l.status),
          type: l.serviceType,
          description: l.notes || `${l.serviceType} - ${l.equipmentName}`,
          technician: l.technician || 'Unassigned',
          cost: l.cost,
        }))

      setReportThumbs(thumbUrls)
      setActiveReportActions({
        'Maintenance Records': historyLogs.map(log => ({
          label: 'View',
          title: 'View ticket PDF',
          onClick: event => handleOpenHistoryTicketPdf(log, unit, event),
        })),
      })
      setActiveReport(buildMaintenanceLogReport(
        { ...unit, type: unit.category },
        logs,
        { dateRange: 'All Time' },
      ))
    } finally {
      setReportLoading(false)
    }
  }

  const counts = useMemo(() => {
    const c = { operational: 0, 'in-service': 0, 'needs-maintenance': 0, 'out-of-service': 0 }
    safeEquipment.forEach(eq => { if (c[eq.status] !== undefined) c[eq.status]++ })
    return c
  }, [safeEquipment])

  const serviceCountsByUnit = useMemo(() => {
    const map = {}
    safeServiceLog.forEach(log => {
      const bucket = map[log.equipmentId] || (map[log.equipmentId] = { open: 0, overdue: 0 })
      if (log.status === 'overdue') bucket.overdue++
      else if (log.status === 'open' || log.status === 'in-progress') bucket.open++
    })
    return map
  }, [safeServiceLog])

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    return safeEquipment
      .filter(eq => {
        const matchCat = catFilter === 'All' || eq.category === catFilter
        const matchSta = staFilter === 'All' || eq.status === FILTER_KEY[staFilter]
        const haystack = [
          eq.name,
          eq.category,
          eq.manufacturer,
          eq.model,
          eq.assignedOperator,
          eq.notes,
          eq.serialNumber,
        ].map(text).join(' ').toLowerCase()
        return matchCat && matchSta && (!q || haystack.includes(q))
      })
      .sort((a, b) => (SORT_STATUS[a.status] ?? 9) - (SORT_STATUS[b.status] ?? 9))
  }, [safeEquipment, search, catFilter, staFilter])

  return (
    <div className={styles.eqRoot}>
      <WorkspaceSection
        title="Fleet"
        subtitle="Mowers, sprayers, utility carts, and other course equipment - sorted by service urgency."
        actions={
          <button type="button" className="opActionBtn" onClick={openAddEquipment}>
            + Add Equipment
          </button>
        }
      >
        <StatusBoard columns={4}>
          <StatusBoard.Tile value={counts.operational} label="Active" tone="ok" />
          <StatusBoard.Tile value={counts['in-service']} label="In Service" tone="info" />
          <StatusBoard.Tile value={counts['needs-maintenance']} label="Needs Maintenance" tone="warn" />
          <StatusBoard.Tile value={counts['out-of-service']} label="Out of Service" tone="critical" />
        </StatusBoard>

        <div className={styles.eqToolbar}>
          <input
            type="search"
            className={styles.eqSearch}
            placeholder="Search name, category, make, model, operator..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search equipment"
          />
          <div className={styles.eqFilterRow}>
            {categoryFilters.map(c => (
              <button
                key={c}
                type="button"
                className={`${styles.eqFilterBtn} ${catFilter === c ? styles.eqFilterBtnActive : ''}`}
                onClick={() => setCatFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className={styles.eqFilterRow}>
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                type="button"
                className={`${styles.eqFilterBtn} ${staFilter === s ? styles.eqFilterBtnActive : ''}`}
                onClick={() => setStaFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <p className={styles.eqCount}>
          {visible.length} unit{visible.length !== 1 ? 's' : ''}
          {(catFilter !== 'All' || staFilter !== 'All' || search) ? ' (filtered)' : ''}
        </p>

        {visible.length === 0 ? (
          safeEquipment.length === 0 ? (
            <EmptyState
              title="No equipment tracked yet."
              description="Add your first mower, cart, sprayer, or shop unit to start tracking hours and service."
            />
          ) : (
            <EmptyState compact title="No matches." description="No equipment matches the current filters." />
          )
        ) : (
          <div className={styles.eqList}>
            {visible.map(eq => {
              const statusMeta = STATUS_META[eq.status] || { label: text(eq.status) || 'Unknown' }
              const svcWarn = serviceWarning(eq.hours, eq.nextServiceHours)
              const fuelStyle = FUEL_COLORS[eq.fuelType] || FUEL_COLORS.Gas
              const svcCounts = serviceCountsByUnit[eq.id]
              const maintBadge =
                svcCounts?.overdue > 0 ? { label: `${svcCounts.overdue} overdue`, tone: 'critical' } :
                svcCounts?.open > 0 ? { label: `${svcCounts.open} open`, tone: 'warn' } :
                null
              const makeModel = [eq.manufacturer, eq.model].filter(Boolean).join(' ')
              return (
                <button
                  key={eq.id}
                  type="button"
                  className={`${styles.eqCard} ${styles[`eqCard_${text(eq.status).replace('-', '_')}`] || ''}`}
                  onClick={() => setSelected(eq)}
                  aria-label={`View details for ${eq.name}`}
                >
                  <div className={styles.eqCardMain}>
                    <div className={styles.eqCardTitleRow}>
                      <span className={styles.eqCardName}>{eq.name}</span>
                      <span className={styles.eqCategoryPill}>{eq.category || 'Uncategorized'}</span>
                    </div>
                    <div className={styles.eqCardMakeModel}>
                      {makeModel || 'Make/model not entered'}
                      {eq.year && <span className={styles.eqCardYear}> - {eq.year}</span>}
                    </div>
                    <div className={styles.eqCardBadgeRow}>
                      <span className={`${styles.eqStatusBadge} ${statusMeta.cls || ''}`}>
                        {statusMeta.label}
                      </span>
                      {eq.fuelType && (
                        <span
                          className={styles.eqFuelBadge}
                          style={{ background: fuelStyle.bg, color: fuelStyle.color, borderColor: fuelStyle.border }}
                        >
                          {eq.fuelType}
                        </span>
                      )}
                      {isMowerCategory(eq.category) && eq.heightOfCut != null && (
                        <span className={styles.eqHeightBadge}>HOC {eq.heightOfCut} in</span>
                      )}
                      {svcWarn && <span className={`${styles.eqServiceBadge} ${svcWarn.cls}`}>{svcWarn.label}</span>}
                      {maintBadge && (
                        <span
                          className={styles.eqMaintBadge}
                          data-tone={maintBadge.tone}
                          data-clickable={onJumpToMaintenance ? 'true' : undefined}
                          role={onJumpToMaintenance ? 'button' : undefined}
                          tabIndex={onJumpToMaintenance ? 0 : undefined}
                          title="Open maintenance entries for this unit"
                          onClick={onJumpToMaintenance ? (e) => { e.stopPropagation(); onJumpToMaintenance(eq.name) } : undefined}
                          onKeyDown={onJumpToMaintenance ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              onJumpToMaintenance(eq.name)
                            }
                          } : undefined}
                        >
                          {maintBadge.label}
                        </span>
                      )}
                      {eq.assignedOperator && <span className={styles.eqOperatorBadge}>{eq.assignedOperator}</span>}
                    </div>
                  </div>

                  <div className={styles.eqCardRight}>
                    <span className={styles.eqBigHours}>{formatHours(eq.hours)}</span>
                    <span className={styles.eqHoursLabel}>hrs</span>
                    <span className={styles.eqNextService}>{hoursUntilService(eq.hours, eq.nextServiceHours)}</span>
                    <span className={styles.eqViewDetail}>Details</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </WorkspaceSection>

      {selected && !drawerMode && (() => {
        const statusMeta = STATUS_META[selected.status] || { label: text(selected.status) || 'Unknown' }
        const svcWarn = serviceWarning(selected.hours, selected.nextServiceHours)
        const fuelStyle = FUEL_COLORS[selected.fuelType] || FUEL_COLORS.Gas
        const progress = serviceProgress(selected)
        const accentColors = {
          'operational': '#4ecb4e',
          'in-service': '#5ba8a0',
          'needs-maintenance': '#d4883a',
          'out-of-service': '#e05050',
        }
        const subtitle = [
          [selected.manufacturer, selected.model].filter(Boolean).join(' '),
          selected.year,
          selected.serialNumber ? `S/N: ${selected.serialNumber}` : null,
        ].filter(Boolean).join(' - ')

        return (
          <SideDrawer
            open
            onClose={() => setSelected(null)}
            accentColor={accentColors[selected.status] || '#4a9e4a'}
            ariaLabel="Equipment details"
          >
            <SideDrawer.Header
              title={selected.name}
              subtitle={subtitle || selected.category}
              status={<span className={`${styles.eqStatusBadge} ${statusMeta.cls || ''}`}>{statusMeta.label}</span>}
              onClose={() => setSelected(null)}
            />

            <SideDrawer.Body>
              <section className={styles.eqModalSection}>
                <h3 className={styles.eqModalSectionTitle}>Equipment Overview</h3>
                <div className={styles.eqModalGrid}>
                  <Detail label="Category" value={selected.category || '-'} />
                  <Detail label="Manufacturer" value={selected.manufacturer || '-'} />
                  <Detail label="Model" value={selected.model || '-'} />
                  <Detail label="Year" value={selected.year || '-'} />
                  <Detail label="Serial Number" value={selected.serialNumber || '-'} />
                  <Detail label="Tank Capacity" value={selected.tankCapacityGal ? `${selected.tankCapacityGal} gal` : '-'} />
                  <Detail label="Pounds Capacity" value={selected.capacityLbs == null ? '-' : `${selected.capacityLbs} lb`} />
                  {isMowerCategory(selected.category) && (
                    <Detail label="Height of Cut" value={selected.heightOfCut == null ? '-' : `${selected.heightOfCut} in`} />
                  )}
                  <Detail label="Operator" value={selected.assignedOperator || 'Unassigned'} />
                </div>
              </section>

              <section className={styles.eqModalSection}>
                <h3 className={styles.eqModalSectionTitle}>Hours Tracking</h3>
                <div className={styles.eqModalGrid}>
                  <Detail label="Current Hours" value={`${formatHours(selected.hours)} hrs`} big />
                  <Detail label="Next Service At" value={selected.nextServiceHours == null ? '-' : `${formatHours(selected.nextServiceHours)} hrs`} />
                  <div className={styles.eqModalField}>
                    <span className={styles.eqModalFieldLabel}>Service Status</span>
                    {svcWarn
                      ? <span className={`${styles.eqServiceBadge} ${svcWarn.cls}`}>{svcWarn.label}</span>
                      : <span className={styles.eqServiceCurrent}>{selected.nextServiceHours == null ? 'Not set' : 'Current'}</span>}
                  </div>
                  <Detail label="Service Interval" value={selected.serviceInterval == null ? '-' : `${formatHours(selected.serviceInterval)} hrs`} />
                </div>

                {progress == null ? (
                  <p className={styles.eqModalServiceNote}>Set last service hours and next service hours to enable the service progress bar.</p>
                ) : (
                  <>
                    <div className={styles.eqHoursBarWrap}>
                      <div
                        className={`${styles.eqHoursBar} ${
                          Number(selected.hours) >= Number(selected.nextServiceHours)
                            ? styles.eqHoursBarDue
                            : Number(selected.hours) >= Number(selected.nextServiceHours) - 25
                            ? styles.eqHoursBarSoon
                            : styles.eqHoursBarOk
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className={styles.eqHoursBarLabels}>
                      <span>Last: {formatHours(selected.lastServiceHours)} hrs</span>
                      <span>Next: {formatHours(selected.nextServiceHours)} hrs</span>
                    </div>
                  </>
                )}
              </section>

              <section className={styles.eqModalSection}>
                <h3 className={styles.eqModalSectionTitle}>Service Information</h3>
                <div className={styles.eqModalGrid}>
                  <Detail label="Last Service Date" value={selected.lastService || '-'} />
                  <Detail label="Hours at Last Service" value={selected.lastServiceHours == null ? '-' : `${formatHours(selected.lastServiceHours)} hrs`} />
                  <Detail
                    label="Hours Since Service"
                    value={
                      Number.isFinite(Number(selected.hours)) && Number.isFinite(Number(selected.lastServiceHours))
                        ? `${formatHours(Number(selected.hours) - Number(selected.lastServiceHours))} hrs`
                        : '-'
                    }
                  />
                  <div className={styles.eqModalField}>
                    <span className={styles.eqModalFieldLabel}>Fuel Type</span>
                    {selected.fuelType ? (
                      <span
                        className={styles.eqFuelBadge}
                        style={{
                          background: fuelStyle.bg,
                          color: fuelStyle.color,
                          borderColor: fuelStyle.border,
                          fontSize: '0.82rem',
                          padding: '4px 10px',
                        }}
                      >
                        {selected.fuelType}
                      </span>
                    ) : (
                      <span className={styles.eqModalFieldValue}>-</span>
                    )}
                  </div>
                </div>
              </section>

              {selected.notes && (
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Notes</h3>
                  <p className={styles.eqModalNotes}>{selected.notes}</p>
                </section>
              )}

              <section className={styles.eqModalSection}>
                <h3 className={styles.eqModalSectionTitle}>Attachments</h3>
                <UploadCenter
                  module={selected.id}
                  type="image"
                  tags={[selected.category, selected.status].filter(Boolean)}
                  title="Photos"
                />
                <UploadCenter
                  module={`${selected.id}-docs`}
                  type="document"
                  tags={[selected.category, selected.status].filter(Boolean)}
                  title="Documents"
                />
              </section>
            </SideDrawer.Body>

            <SideDrawer.Footer>
              <button type="button" className="opActionBtn" onClick={() => openServiceLog(selected)}>Log Service</button>
              <button type="button" className="opActionBtn" onClick={() => openEditEquipment(selected)}>Edit</button>
              <button
                type="button"
                className="opActionBtn"
                onClick={() => generateEquipmentHistory(selected)}
                disabled={reportLoading}
              >
                {reportLoading ? 'Loading...' : 'History Report'}
              </button>
              <button type="button" className={styles.eqDangerBtn} onClick={() => handleDeleteEquipment(selected)} disabled={saving}>
                Delete
              </button>
            </SideDrawer.Footer>
          </SideDrawer>
        )
      })()}

      {(drawerMode === 'add' || drawerMode === 'edit') && (
        <SideDrawer
          open
          onClose={closeForms}
          accentColor="#4ecb4e"
          ariaLabel={drawerMode === 'edit' ? 'Edit equipment' : 'Add equipment'}
        >
          <SideDrawer.Header
            title={drawerMode === 'edit' ? 'Edit Equipment' : 'Add Equipment'}
            subtitle="Track hours, service interval, operator, and shop notes."
            onClose={closeForms}
          />
          <form onSubmit={handleSaveEquipment}>
            <SideDrawer.Body>
              <EquipmentForm form={equipmentForm} setField={setEqField} categoryOptions={categoryOptions} />
            </SideDrawer.Body>
            <SideDrawer.Footer>
              <button type="submit" className="opActionBtn" disabled={saving || !equipmentForm.name.trim() || !equipmentForm.category.trim()}>
                {saving ? 'Saving...' : 'Save Equipment'}
              </button>
              <button type="button" className="opActionBtn" onClick={closeForms} disabled={saving}>Cancel</button>
            </SideDrawer.Footer>
          </form>
        </SideDrawer>
      )}

      {drawerMode === 'service' && selected && (
        <SideDrawer open onClose={closeForms} accentColor="#d4883a" ariaLabel="Log service">
          <SideDrawer.Header
            title={`Log Service - ${selected.name}`}
            subtitle="Record work completed or open a maintenance item."
            onClose={closeForms}
          />
          <form onSubmit={handleSaveService}>
            <SideDrawer.Body>
              <ServiceForm form={serviceForm} setField={setServiceField} />
            </SideDrawer.Body>
            <SideDrawer.Footer>
              <button type="submit" className="opActionBtn" disabled={saving || !serviceForm.serviceType.trim()}>
                {saving ? 'Saving...' : 'Save Service'}
              </button>
              <button type="button" className="opActionBtn" onClick={closeForms} disabled={saving}>Cancel</button>
            </SideDrawer.Footer>
          </form>
        </SideDrawer>
      )}

      <ReportPreviewModal
        report={activeReport}
        onClose={handleCloseReport}
        rowActions={activeReportActions}
      />
    </div>
  )
}

function Detail({ label, value, big = false }) {
  return (
    <div className={styles.eqModalField}>
      <span className={styles.eqModalFieldLabel}>{label}</span>
      <span className={`${styles.eqModalFieldValue} ${big ? styles.eqModalHoursBig : ''}`}>{value}</span>
    </div>
  )
}

function EquipmentForm({ form, setField, categoryOptions }) {
  return (
    <>
      <section className={styles.eqModalSection}>
        <h3 className={styles.eqModalSectionTitle}>Unit</h3>
        <div className={styles.eqFormGrid}>
          <Field label="Name" required>
            <input className={styles.eqFormInput} value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Greens Mower #1" />
          </Field>
          <Field label="Category">
            <input
              className={styles.eqFormInput}
              value={form.category}
              onChange={e => setField('category', e.target.value)}
              list="equipment-category-options"
              placeholder="Type category..."
            />
            <datalist id="equipment-category-options">
              {categoryOptions.map(c => <option key={c} value={c} />)}
            </datalist>
            <span className={styles.eqFormHint}>Type a new category or pick an existing one.</span>
          </Field>
          <Field label="Status">
            <select className={styles.eqFormInput} value={form.status} onChange={e => setField('status', e.target.value)}>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Fuel Type">
            <select className={styles.eqFormInput} value={form.fuelType} onChange={e => setField('fuelType', e.target.value)}>
              {FUEL_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className={styles.eqModalSection}>
        <h3 className={styles.eqModalSectionTitle}>Details</h3>
        <div className={styles.eqFormGrid}>
          <Field label="Manufacturer"><input className={styles.eqFormInput} value={form.manufacturer} onChange={e => setField('manufacturer', e.target.value)} /></Field>
          <Field label="Model"><input className={styles.eqFormInput} value={form.model} onChange={e => setField('model', e.target.value)} /></Field>
          <Field label="Year"><input type="number" className={styles.eqFormInput} value={form.year} onChange={e => setField('year', e.target.value)} /></Field>
          <Field label="Serial Number"><input className={styles.eqFormInput} value={form.serialNumber} onChange={e => setField('serialNumber', e.target.value)} /></Field>
          <Field label="Tank Capacity (gal)"><input type="number" step="1" min="0" className={styles.eqFormInput} value={form.tankCapacityGal} onChange={e => setField('tankCapacityGal', e.target.value)} placeholder="300" /></Field>
          <Field label="Capacity (lb)"><input type="number" inputMode="decimal" step="0.1" min="0.1" className={styles.eqFormInput} value={form.capacityLbs} onChange={e => setField('capacityLbs', e.target.value)} placeholder="500" /></Field>
          {isMowerCategory(form.category) && (
            <Field label="Height of Cut (in)">
              <input type="number" inputMode="decimal" step="0.001" min="0.001" className={styles.eqFormInput} value={form.heightOfCut} onChange={e => setField('heightOfCut', e.target.value)} placeholder=".125" />
            </Field>
          )}
          <Field label="Operator"><input className={styles.eqFormInput} value={form.assignedOperator} onChange={e => setField('assignedOperator', e.target.value)} /></Field>
        </div>
      </section>

      <section className={styles.eqModalSection}>
        <h3 className={styles.eqModalSectionTitle}>Hours and Service</h3>
        <div className={styles.eqFormGrid}>
          <Field label="Current Hours"><input type="number" className={styles.eqFormInput} value={form.hours} onChange={e => setField('hours', e.target.value)} /></Field>
          <Field label="Last Service Date"><input type="date" className={styles.eqFormInput} value={form.lastService} onChange={e => setField('lastService', e.target.value)} /></Field>
          <Field label="Last Service Hours"><input type="number" className={styles.eqFormInput} value={form.lastServiceHours} onChange={e => setField('lastServiceHours', e.target.value)} /></Field>
          <Field label="Service Interval"><input type="number" className={styles.eqFormInput} value={form.serviceInterval} onChange={e => setField('serviceInterval', e.target.value)} placeholder="100" /></Field>
          <Field label="Next Service Hours"><input type="number" className={styles.eqFormInput} value={form.nextServiceHours} onChange={e => setField('nextServiceHours', e.target.value)} /></Field>
        </div>
      </section>

      <section className={styles.eqModalSection}>
        <h3 className={styles.eqModalSectionTitle}>Notes</h3>
        <textarea className={styles.eqFormTextarea} value={form.notes} onChange={e => setField('notes', e.target.value)} rows={4} />
      </section>
    </>
  )
}

function ServiceForm({ form, setField }) {
  return (
    <>
      <section className={styles.eqModalSection}>
        <h3 className={styles.eqModalSectionTitle}>Service</h3>
        <div className={styles.eqFormGrid}>
          <Field label="Service Type" required>
            <select className={styles.eqFormInput} value={form.serviceType} onChange={e => setField('serviceType', e.target.value)}>
              {['Preventive', 'Repair', 'Inspection', 'Adjustment', 'Overhaul'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={styles.eqFormInput} value={form.status} onChange={e => setField('status', e.target.value)}>
              <option value="completed">Completed</option>
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="overdue">Overdue</option>
            </select>
          </Field>
          <Field label="Priority">
            <select className={styles.eqFormInput} value={form.priority} onChange={e => setField('priority', e.target.value)}>
              <option value="routine">Routine</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
          <Field label="Service Date"><input type="date" className={styles.eqFormInput} value={form.date} onChange={e => setField('date', e.target.value)} /></Field>
          <Field label="Completed Date"><input type="date" className={styles.eqFormInput} value={form.completedDate} onChange={e => setField('completedDate', e.target.value)} disabled={form.status !== 'completed'} /></Field>
          <Field label="Hours"><input type="number" className={styles.eqFormInput} value={form.hoursAtService} onChange={e => setField('hoursAtService', e.target.value)} /></Field>
          <Field label="Next Due Hours"><input type="number" className={styles.eqFormInput} value={form.nextDueHours} onChange={e => setField('nextDueHours', e.target.value)} /></Field>
          <Field label="Cost"><input type="number" step="0.01" className={styles.eqFormInput} value={form.cost} onChange={e => setField('cost', e.target.value)} /></Field>
          <Field label="Technician"><input className={styles.eqFormInput} value={form.technician} onChange={e => setField('technician', e.target.value)} /></Field>
        </div>
      </section>

      <section className={styles.eqModalSection}>
        <h3 className={styles.eqModalSectionTitle}>Notes</h3>
        <textarea className={styles.eqFormTextarea} value={form.notes} onChange={e => setField('notes', e.target.value)} rows={4} placeholder="Work completed, parts needed, or follow-up..." />
      </section>
    </>
  )
}

function Field({ label, required = false, children }) {
  return (
    <label className={styles.eqFormField}>
      <span className={styles.eqModalFieldLabel}>{label}{required ? ' *' : ''}</span>
      {children}
    </label>
  )
}
