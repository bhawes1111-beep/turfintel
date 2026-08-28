function numberValue(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000
}

function formatNumber(value) {
  const number = numberValue(value)
  if (number == null) return '-'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(round(number))
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]))
}

function normalizedUnit(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\./g, '')
}

export function inventoryAuditAmounts(item) {
  const quantity = numberValue(item?.quantity) ?? numberValue(item?.currentLevel) ?? 0
  const unit = normalizedUnit(item?.unit || item?.containerUnit)
  const typeHint = `${item?.kind ?? ''} ${item?.category ?? ''} ${item?.containerType ?? ''}`.toLowerCase()
  const dryOunce = /fertilizer|granular|dry|seed/.test(typeHint)
  let ounces = null
  let gallons = null
  let pounds = null

  if (['gal', 'gallon', 'gallons'].includes(unit)) {
    gallons = quantity
    ounces = quantity * 128
  } else if (['qt', 'quart', 'quarts'].includes(unit)) {
    gallons = quantity / 4
    ounces = quantity * 32
  } else if (['pt', 'pint', 'pints'].includes(unit)) {
    gallons = quantity / 8
    ounces = quantity * 16
  } else if (['fl oz', 'floz', 'fluid ounce', 'fluid ounces'].includes(unit)) {
    gallons = quantity / 128
    ounces = quantity
  } else if (['l', 'liter', 'liters', 'litre', 'litres'].includes(unit)) {
    gallons = quantity * 0.2641720524
    ounces = quantity * 33.8140227
  } else if (['lb', 'lbs', 'pound', 'pounds'].includes(unit)) {
    pounds = quantity
    ounces = quantity * 16
  } else if (['kg', 'kilogram', 'kilograms'].includes(unit)) {
    pounds = quantity * 2.2046226218
    ounces = quantity * 35.27396195
  } else if (['g', 'gram', 'grams'].includes(unit)) {
    pounds = quantity / 453.59237
    ounces = quantity / 28.349523125
  } else if (['oz', 'ounce', 'ounces'].includes(unit)) {
    ounces = quantity
    if (dryOunce) pounds = quantity / 16
    else gallons = quantity / 128
  }

  const explicitCount = numberValue(item?.containerCount)
  const containerSize = numberValue(item?.containerSize)
  const packageCount = explicitCount ?? (
    containerSize != null && containerSize > 0 ? quantity / containerSize : null
  )

  return {
    quantity,
    unit: item?.unit || item?.containerUnit || '',
    packageCount,
    containerSize,
    containerUnit: item?.containerUnit || item?.unit || '',
    ounces: ounces == null ? null : round(ounces),
    gallons: gallons == null ? null : round(gallons),
    pounds: pounds == null ? null : round(pounds),
  }
}

function groupLabel(item) {
  const kind = String(item?.kind ?? '').trim()
  const category = String(item?.category ?? '').trim()
  return category || kind || 'Other'
}

function auditRows(items) {
  return [...items]
    .sort((a, b) => groupLabel(a).localeCompare(groupLabel(b)) || String(a?.name ?? '').localeCompare(String(b?.name ?? '')))
    .map(item => {
      const amounts = inventoryAuditAmounts(item)
      const sizeEach = amounts.containerSize == null
        ? '-'
        : `${formatNumber(amounts.containerSize)} ${escapeHtml(amounts.containerUnit)}`.trim()
      return `
        <tr>
          <td><strong>${escapeHtml(item?.name || 'Unnamed item')}</strong><small>${escapeHtml(groupLabel(item))}</small></td>
          <td class="num">${formatNumber(amounts.quantity)} ${escapeHtml(amounts.unit)}</td>
          <td class="num">${formatNumber(amounts.packageCount)}</td>
          <td class="num">${sizeEach}</td>
          <td class="num">${formatNumber(amounts.ounces)}</td>
          <td class="num">${formatNumber(amounts.gallons)}</td>
          <td class="num">${formatNumber(amounts.pounds)}</td>
          <td class="audit"></td>
          <td class="audit"></td>
        </tr>`
    }).join('')
}

export function printableInventoryAuditHtml(items = [], { courseName = '' } = {}) {
  const generated = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date())
  const rows = auditRows(Array.isArray(items) ? items : [])
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Inventory Audit - ${escapeHtml(courseName || 'TurfIntel')}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #edf2ec; color: #1d2a22; font: 12px/1.35 Arial, sans-serif; }
    .toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 8px; padding: 11px 18px; background: #12351f; }
    .toolbar button { border: 1px solid #7fbd82; border-radius: 5px; background: #2f7d3f; color: #fff; padding: 8px 13px; font-weight: 700; cursor: pointer; }
    .page { width: min(1320px, calc(100% - 30px)); margin: 20px auto; padding: 28px; background: #fff; border: 1px solid #d5dfd2; box-shadow: 0 10px 34px rgba(29,42,34,.12); }
    header { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; padding-bottom: 14px; border-bottom: 4px solid #4d9b57; }
    h1 { margin: 0; color: #173b22; font-size: 25px; }
    header p { margin: 5px 0 0; color: #657565; }
    .meta { text-align: right; color: #657565; }
    .instructions { margin: 14px 0; padding: 10px 12px; border: 1px solid #cbdac7; background: #f3f7f1; color: #425742; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #dce5d9; padding: 7px 8px; vertical-align: middle; }
    th { background: #eaf2e7; color: #314d36; font-size: 9px; letter-spacing: .04em; text-transform: uppercase; }
    th:first-child { width: 21%; }
    td small { display: block; margin-top: 2px; color: #728071; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .audit { height: 31px; background: #fffdf3; }
    footer { display: flex; justify-content: space-between; gap: 30px; margin-top: 22px; color: #546654; }
    .signature { flex: 1; padding-top: 24px; border-bottom: 1px solid #627162; }
    @page { size: landscape; margin: .35in; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .page { width: auto; margin: 0; padding: 0; border: 0; box-shadow: none; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div>
  <main class="page">
    <header>
      <div><h1>Inventory Audit</h1><p>${escapeHtml(courseName || 'TurfIntel Pro')}</p></div>
      <div class="meta">Generated ${escapeHtml(generated)}<br />${items.length} inventory items</div>
    </header>
    <div class="instructions">Recorded stock is converted only within compatible units. Gallons and fluid ounces represent liquid volume; pounds and ounces represent dry weight. Enter the physical package count and any variance in the final columns.</div>
    <table>
      <thead><tr><th>Item</th><th>Recorded Stock</th><th>Packages We Have</th><th>Size Each</th><th>Ounces</th><th>Gallons</th><th>Pounds</th><th>Audit Count</th><th>Variance</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9">No inventory items recorded.</td></tr>'}</tbody>
    </table>
    <footer><div class="signature">Audited by</div><div class="signature">Date</div><div class="signature">Supervisor review</div></footer>
  </main>
</body>
</html>`
}

export function openInventoryAuditPrint(items, options = {}) {
  const win = window.open('', '_blank', 'width=1280,height=900')
  if (!win) return false
  win.document.open()
  win.document.write(printableInventoryAuditHtml(items, options))
  win.document.close()
  return true
}
