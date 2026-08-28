function text(value) {
  return value == null ? '' : String(value)
}

function numberValue(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatMoneyFixed(value) {
  const n = numberValue(value)
  return n == null ? '$0.00' : `$${n.toFixed(2)}`
}

function ticketStageLabel(value, status) {
  const stage = text(value || '').toLowerCase()
  const labels = {
    needs_service:   'Needs service',
    parts_ordered:   'Parts ordered',
    being_repaired:  'Being repaired',
    resolved:        'Resolved',
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
    part:       part?.part || part?.name || 'Part',
    partNumber: part?.partNumber || '-',
    quantity,
    unitCost,
    totalCost:  savedTotal ?? quantity * unitCost,
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

export function printableMaintenanceTicketHtml(log, unit) {
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

export function openMaintenanceTicketPdf(log, unit, onPopupBlocked) {
  const win = window.open('', '_blank', 'width=920,height=1000')
  if (!win) {
    onPopupBlocked?.()
    return
  }
  win.document.open()
  win.document.write(printableMaintenanceTicketHtml(log, unit))
  win.document.close()
  win.focus()
}

function availablePartRows(inventoryItems, equipmentName) {
  const target = text(equipmentName).trim().toLowerCase()
  return (inventoryItems ?? [])
    .filter(item => item?.kind === 'part' && (numberValue(item.quantity) ?? 0) > 0)
    .map(item => {
      const equipmentList = (Array.isArray(item.equipmentList)
        ? item.equipmentList
        : [item.equipment]
      ).filter(Boolean)
      return {
        name: item.name || 'Part',
        partNumber: item.partNumber || '-',
        equipment: equipmentList.join(', ') || 'General stock',
        location: item.location || '-',
        quantity: numberValue(item.quantity) ?? 0,
        unit: item.unit || 'ea',
        compatible: equipmentList.some(name => text(name).trim().toLowerCase() === target),
      }
    })
    .filter(part => part.compatible)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function requestedPartsFor(ticket) {
  const parts = Array.isArray(ticket?.partsUsed)
    ? ticket.partsUsed
    : Array.isArray(ticket?.parts) ? ticket.parts : []
  return parts
    .map(normalizePartUsed)
    .filter(part => part.part && part.part !== 'Part')
}

export function printableMechanicWorkOrderHtml(ticket, unit, inventoryItems = []) {
  const equipmentName = ticket?.equipmentName || unit?.name || 'Equipment'
  const ticketDate = ticket?.date || ticket?.completedDate || ''
  const ticketId = `${equipmentName} - ${ticketDate || 'No date'}`
  const stageLabel = ticketStageLabel(ticket?.ticketStage, ticket?.status)
  const requestedParts = requestedPartsFor(ticket)
  const availableParts = availablePartRows(inventoryItems, equipmentName)
  const requestedRows = requestedParts.length
    ? requestedParts.map(part => `
      <tr>
        <td>${escapeHtml(part.part)}</td>
        <td>${escapeHtml(part.partNumber)}</td>
        <td class="num">${part.quantity > 0 ? escapeHtml(part.quantity) : ''}</td>
        <td class="write"></td>
      </tr>
    `).join('')
    : '<tr><td colspan="4" class="empty">No parts have been assigned to this ticket.</td></tr>'
  const inventoryRows = availableParts.length
    ? availableParts.map(part => `
      <tr class="${part.compatible ? 'compatible' : ''}">
        <td class="check"></td>
        <td><strong>${escapeHtml(part.name)}</strong><span class="fit">Fits this equipment</span></td>
        <td>${escapeHtml(part.partNumber)}</td>
        <td>${escapeHtml(part.equipment)}</td>
        <td>${escapeHtml(part.location)}</td>
        <td class="num">${escapeHtml(part.quantity)} ${escapeHtml(part.unit)}</td>
        <td class="write"></td>
      </tr>
    `).join('')
    : '<tr><td colspan="7" class="empty">No available parts are currently recorded in inventory.</td></tr>'

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Mechanic Work Order - ${escapeHtml(ticketId)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef3ec; color: #1d2a22; font: 12px/1.35 Arial, sans-serif; }
    .toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 8px; padding: 12px; background: #0f2f1b; }
    .toolbar button { border: 1px solid #78b878; border-radius: 6px; background: #2f7d3f; color: white; font-weight: 700; padding: 8px 14px; cursor: pointer; }
    .page { width: min(900px, calc(100% - 32px)); margin: 22px auto; background: white; border: 1px solid #d6dfd2; box-shadow: 0 12px 40px rgba(29,42,34,.12); padding: 28px; }
    header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 4px solid #4f9c58; padding-bottom: 14px; }
    h1 { margin: 0; color: #16361f; font-size: 24px; }
    h2 { margin: 20px 0 8px; color: #286b38; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
    .muted { color: #637361; margin-top: 3px; }
    .ticketId { max-width: 46%; text-align: right; }
    .ticketId span { display: block; color: #637361; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .ticketId strong { display: block; margin-top: 4px; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 16px; margin-top: 16px; }
    .field { min-height: 42px; border-bottom: 1px solid #cfd9cc; padding-bottom: 5px; }
    .label { display: block; color: #637361; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .value { display: block; margin-top: 3px; font-weight: 700; }
    .wide { grid-column: span 2; }
    .description { min-height: 60px; border: 1px solid #cfd9cc; padding: 9px; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th, td { border: 1px solid #cfd9cc; padding: 6px 7px; text-align: left; vertical-align: middle; overflow-wrap: anywhere; }
    th { background: #eaf2e7; color: #38503b; font-size: 9px; text-transform: uppercase; }
    tr { break-inside: avoid; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .empty { padding: 12px; color: #637361; text-align: center; }
    .check { width: 24px; }
    .check::before { display: block; width: 12px; height: 12px; border: 1px solid #667764; content: ''; }
    .write { width: 76px; height: 30px; background: repeating-linear-gradient(to bottom, transparent 0 25px, #aebbad 25px 26px); }
    .fit { display: block; margin-top: 2px; color: #286b38; font-size: 9px; font-weight: 700; }
    .compatible td { background-color: #f5faf3; }
    .completion { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-top: 18px; }
    .line { min-height: 34px; border-bottom: 1px solid #667764; padding-top: 18px; }
    .notes { min-height: 100px; border: 1px solid #cfd9cc; background: repeating-linear-gradient(to bottom, white 0 23px, #d8e0d5 23px 24px); }
    .inventoryNote { margin: 5px 0 8px; color: #637361; font-size: 10px; }
    @page { size: letter portrait; margin: .45in; }
    @media print {
      body { background: white; }
      .toolbar { display: none; }
      .page { width: auto; margin: 0; border: 0; box-shadow: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print Work Order</button></div>
  <main class="page">
    <header>
      <div><h1>Mechanic Work Order</h1><div class="muted">Equipment service ticket</div></div>
      <div class="ticketId"><span>Ticket ID</span><strong>${escapeHtml(ticketId)}</strong></div>
    </header>

    <section class="grid">
      <div class="field wide"><span class="label">Equipment</span><span class="value">${escapeHtml(equipmentName)}</span></div>
      <div class="field"><span class="label">Equipment status</span><span class="value">${escapeHtml(ticket?.equipmentStatus || unit?.status || '-')}</span></div>
      <div class="field"><span class="label">Ticket progress</span><span class="value">${escapeHtml(stageLabel)}</span></div>
      <div class="field"><span class="label">Date</span><span class="value">${escapeHtml(ticketDate || '-')}</span></div>
      <div class="field"><span class="label">Priority</span><span class="value">${escapeHtml(ticket?.priority || '-')}</span></div>
      <div class="field"><span class="label">Technician</span><span class="value">${escapeHtml(ticket?.technician || 'Unassigned')}</span></div>
      <div class="field"><span class="label">Current hours</span><span class="value">${escapeHtml(ticket?.hoursAtService ?? unit?.currentHours ?? '-')}</span></div>
      <div class="field wide"><span class="label">Service needed</span><span class="value">${escapeHtml(ticket?.serviceType || 'Maintenance')}</span></div>
      <div class="field"><span class="label">Model</span><span class="value">${escapeHtml(unit?.model || '-')}</span></div>
      <div class="field"><span class="label">Serial number</span><span class="value">${escapeHtml(unit?.serialNumber || '-')}</span></div>
    </section>

    <h2>Ticket Notes</h2>
    <div class="description">${escapeHtml(ticket?.notes || 'No notes recorded.')}</div>

    <h2>Parts Assigned To Ticket</h2>
    <table>
      <thead><tr><th>Part</th><th>Part #</th><th class="num">Planned Qty</th><th>Qty Used</th></tr></thead>
      <tbody>${requestedRows}</tbody>
    </table>

    <h2>Available Parts Inventory</h2>
    <p class="inventoryNote">Recorded on-hand parts assigned to this equipment at print time. Check the part used and write the actual quantity in the last column.</p>
    <table>
      <colgroup><col style="width:4%"><col style="width:23%"><col style="width:13%"><col style="width:24%"><col style="width:13%"><col style="width:12%"><col style="width:11%"></colgroup>
      <thead><tr><th></th><th>Part</th><th>Part #</th><th>Equipment</th><th>Location</th><th class="num">Available</th><th>Qty Used</th></tr></thead>
      <tbody>${inventoryRows}</tbody>
    </table>

    <h2>Mechanic Completion</h2>
    <div class="completion">
      <div><span class="label">Completed date</span><div class="line"></div></div>
      <div><span class="label">Labor hours</span><div class="line"></div></div>
      <div><span class="label">Mechanic signature</span><div class="line"></div></div>
    </div>
    <h2>Work Performed / Additional Parts</h2>
    <div class="notes"></div>
  </main>
</body>
</html>`
}

export function openMechanicWorkOrder(ticket, unit, inventoryItems, onPopupBlocked) {
  const win = window.open('', '_blank', 'width=960,height=1000')
  if (!win) {
    onPopupBlocked?.()
    return
  }
  win.document.open()
  win.document.write(printableMechanicWorkOrderHtml(ticket, unit, inventoryItems))
  win.document.close()
  win.focus()
}
