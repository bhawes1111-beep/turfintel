import assert from 'node:assert/strict'
import { buildAgronomyProgressReport } from '../src/utils/reports/reportBuilder.js'
import { buildPrintDocument } from '../src/utils/reports/reportFormatter.js'

const photos = [
  {
    id: 'improvement-1',
    filename: 'green.jpg',
    type: 'image',
    size: 1200,
    category: 'improvement',
    caption: 'New drainage completed',
    thumbnailUrl: 'data:image/jpeg;base64,QUJD',
  },
  {
    id: 'concern-1',
    filename: 'bunker.jpg',
    type: 'image',
    size: 1300,
    category: 'concern',
    caption: 'Bunker washout',
    thumbnailUrl: 'data:image/jpeg;base64,REVG',
  },
]

const report = buildAgronomyProgressReport({}, {
  startDate: '2026-08-03',
  endDate: '2026-08-16',
  include: {
    tasks: false,
    weeklyGoals: false,
    yearlyGoals: false,
    plannedApplications: false,
    sprays: false,
    fertilizer: false,
    maintenance: false,
    irrigation: false,
    labor: false,
    hours: false,
  },
  ownerPhotos: photos,
  courseName: 'Crosswinds Golf Club',
})

assert.deepEqual(report.attachments, photos)
const html = buildPrintDocument(report, { name: 'Crosswinds Golf Club' })
for (const text of ['Improvements (1)', 'Concerns (1)', 'New drainage completed', 'Bunker washout', 'photo-grid']) {
  assert.ok(html.includes(text), `missing ${text}`)
}

console.log('owner report photos smoke passed')
