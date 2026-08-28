import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const reports = readFileSync('src/pages/Reports/Reports.jsx', 'utf8')
const store = readFileSync('src/utils/attachments/attachmentsStore.js', 'utf8')
const api = readFileSync('worker/api/attachments.js', 'utf8')
const worker = readFileSync('worker/index.js', 'utf8')

assert.match(api, /'owner_report_photo'/)
assert.match(api, /export async function updateAttachment/)
assert.match(api, /file_name = \?/)
assert.match(api, /fileName cannot be blank/)
assert.match(worker, /method === 'GET' \|\| method === 'PATCH'/)
assert.match(store, /export async function updateAttachment/)
assert.match(reports, /Saved photo library/)
assert.match(reports, /uploadAttachment\(\{/)
assert.match(reports, /Add to report/)
assert.match(reports, /Delete saved/)
assert.match(reports, /Uploaded \{formatOwnerPhotoDate\(photo\.uploadedAt\)\}/)
assert.match(reports, /Save name/)
assert.match(reports, /updateAttachment\(photo\.id, \{ fileName \}\)/)
assert.match(reports, /onBlur=\{\(\) => saveOwnerPhotoCaption\(photo\)\}/)

console.log('owner report photo library smoke passed')
