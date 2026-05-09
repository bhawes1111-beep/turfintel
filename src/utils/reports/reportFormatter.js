import { SECTION_TYPE } from './reportSchemas'

// ── CSV ────────────────────────────────────────────────────────────────────────

function esc(value) {
  return String(value ?? '').replace(/"/g, '""')
}

/**
 * Serialize a TurfReport to CSV.
 * Each section is preceded by its title row.
 * Fields sections → label,value pairs.
 * Table sections  → column headers + data rows.
 * Text sections   → single quoted cell.
 */
export function reportToCSV(report) {
  const lines = []

  lines.push(`"Report","${esc(report.title)}"`)
  lines.push(`"Generated","${esc(new Date(report.createdAt).toLocaleString())}"`)
  lines.push(`"Module","${esc(report.module)}"`)
  lines.push(`"Report ID","${esc(report.id)}"`)

  for (const section of report.sections) {
    lines.push('')
    lines.push(`"${esc(section.title)}"`)

    if (section.type === SECTION_TYPE.FIELDS) {
      for (const [label, value] of Object.entries(section.data)) {
        lines.push(`"${esc(label)}","${esc(value)}"`)
      }
    } else if (section.type === SECTION_TYPE.TABLE) {
      lines.push(section.data.columns.map(c => `"${esc(c)}"`).join(','))
      for (const row of section.data.rows) {
        lines.push(row.map(cell => `"${esc(cell)}"`).join(','))
      }
    } else if (section.type === SECTION_TYPE.TEXT) {
      lines.push(`"${esc(section.data)}"`)
    }
  }

  if (report.attachments?.length > 0) {
    lines.push('')
    lines.push('"Attachments"')
    lines.push('"Filename","Type","Size (bytes)"')
    for (const att of report.attachments) {
      lines.push(`"${esc(att.filename)}","${esc(att.type)}","${esc(att.size)}"`)
    }
  }

  return lines.join('\n')
}

// ── JSON ───────────────────────────────────────────────────────────────────────

/**
 * Serialize a TurfReport to a pretty-printed JSON string.
 * thumbnailUrl fields are stripped — they are session-ephemeral object URLs.
 */
export function reportToJSON(report) {
  const clean = {
    ...report,
    attachments: (report.attachments ?? []).map(({ thumbnailUrl: _omit, ...rest }) => rest),
  }
  return JSON.stringify(clean, null, 2)
}

// ── Display helpers ────────────────────────────────────────────────────────────

export function formatReportTitle(report) {
  const date = new Date(report.createdAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
  return `${report.title} — ${date}`
}

// ── Print document ─────────────────────────────────────────────────────────────

function renderSectionHtml(section) {
  let bodyHtml = ''

  if (section.type === SECTION_TYPE.FIELDS) {
    const rows = Object.entries(section.data)
      .map(([label, value]) => `
        <div class="field">
          <div class="field-label">${escHtml(label)}</div>
          <div class="field-value">${escHtml(String(value ?? '—'))}</div>
        </div>`)
      .join('')
    bodyHtml = `<div class="field-grid">${rows}</div>`

  } else if (section.type === SECTION_TYPE.TABLE) {
    const heads = section.data.columns.map(c => `<th>${escHtml(c)}</th>`).join('')
    const rows  = section.data.rows.map(row =>
      `<tr>${row.map(cell => `<td>${escHtml(String(cell ?? '—'))}</td>`).join('')}</tr>`
    ).join('')
    bodyHtml = `<table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`

  } else if (section.type === SECTION_TYPE.TEXT) {
    bodyHtml = `<p class="text-body">${escHtml(section.data)}</p>`
  }

  return `
    <div class="section">
      <div class="section-title">${escHtml(section.title)}</div>
      ${bodyHtml}
    </div>`
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
}

/**
 * Build a self-contained HTML document for printing in a new window.
 * @param {Object} report - TurfReport
 * @param {Object} [courseInfo] - { name, superintendent } optional branding
 * @returns {string} Full HTML document string
 */
export function buildPrintDocument(report, courseInfo = {}) {
  const dateStr       = new Date(report.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  })
  const sectionsHtml  = report.sections.map(renderSectionHtml).join('')
  const courseName    = courseInfo.name ?? ''
  const superintendent = courseInfo.superintendent ?? ''

  const attachmentsHtml = (report.attachments?.length > 0)
    ? `<div class="section">
        <div class="section-title">Attachments (${report.attachments.length})</div>
        <ul class="att-list">
          ${report.attachments.map(a =>
            `<li>${escHtml(a.filename)} <span class="att-meta">${escHtml(a.type)} · ${escHtml(String(a.size ?? ''))} bytes</span></li>`
          ).join('')}
        </ul>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>${escHtml(report.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      padding: 32px 40px;
      max-width: 900px;
      margin: 0 auto;
    }
    .report-header   { margin-bottom: 28px; border-bottom: 2px solid #1a1a1a; padding-bottom: 14px; }
    .report-title    { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .report-meta     { font-size: 11px; color: #666; }
    .course-name     { font-size: 12px; font-weight: 600; color: #4a9e4a; margin-bottom: 2px; }
    .section         { margin-bottom: 24px; padding-top: 16px; border-top: 1px solid #ddd; }
    .section-title   { font-size: 10px; font-weight: 700; text-transform: uppercase;
                       letter-spacing: 0.07em; color: #888; margin-bottom: 10px; }
    .field-grid      { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 20px; }
    .field-label     { font-size: 10px; color: #888; text-transform: uppercase;
                       letter-spacing: 0.04em; margin-bottom: 2px; }
    .field-value     { font-size: 13px; font-weight: 600; color: #1a1a1a; }
    table            { width: 100%; border-collapse: collapse; font-size: 12px; }
    th               { text-align: left; padding: 6px 8px; font-size: 10px; font-weight: 700;
                       text-transform: uppercase; letter-spacing: 0.05em; color: #666;
                       border-bottom: 1.5px solid #1a1a1a; background: #f8f8f8; }
    td               { padding: 6px 8px; border-bottom: 1px solid #e8e8e8; color: #1a1a1a; }
    tr:nth-child(even) td { background: #fafafa; }
    .text-body       { font-size: 13px; line-height: 1.6; color: #333; }
    .att-list        { padding-left: 18px; }
    .att-list li     { margin-bottom: 4px; font-size: 12px; }
    .att-meta        { color: #888; font-size: 11px; }
    .report-footer   { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd;
                       font-size: 10px; color: #aaa; display: flex;
                       justify-content: space-between; }
    @media print {
      body            { padding: 0; }
      .section        { break-inside: avoid; }
      .report-footer  { position: fixed; bottom: 0; left: 0; right: 0; padding: 8px 40px; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    ${courseName ? `<div class="course-name">${escHtml(courseName)}${superintendent ? ` · ${escHtml(superintendent)}` : ''}</div>` : ''}
    <div class="report-title">${escHtml(report.title)}</div>
    <div class="report-meta">Generated ${escHtml(dateStr)} · ${escHtml(report.module)} · ${escHtml(report.id)}</div>
  </div>
  ${sectionsHtml}
  ${attachmentsHtml}
  <div class="report-footer">
    <span>TurfIntel Pro</span>
    <span>${escHtml(report.id)}</span>
  </div>
</body>
</html>`
}
