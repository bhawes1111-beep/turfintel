// Phase: Moisture + Handwatering Intelligence Foundation — CRUD.
//
// Field moisture observations. Mutation auth is enforced centrally in
// worker/index.js. Course-scoped. Pure storage — no agronomic inference
// here; trend/priority logic lives client-side (moistureIntel.js) and stays
// explainable.

import { json, badRequest, notFound, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { buildCourseFilter, resolveCourseId } from '../lib/scope.js'

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v); return Number.isFinite(n) ? n : null
  }
  return null
}
function bit(v) { return v ? 1 : 0 }

function rowToObs(row) {
  if (!row) return null
  return {
    id:               row.id,
    courseId:         row.course_id,
    observedAt:       row.observed_at,
    observedBy:       row.observed_by,
    location:         row.location,
    hole:             row.hole,
    moisturePct:      row.moisture_pct,
    surfaceNote:      row.surface_note,
    wiltStress:       row.wilt_stress === 1,
    drySpot:          row.dry_spot === 1,
    handwaterRec:     row.handwater_rec === 1,
    syringeRec:       row.syringe_rec === 1,
    notes:            row.notes,
    // Phase 7A.1 capture-time provenance. All optional; older rows return null.
    clientId:         row.client_id         ?? null,
    clientObservedAt: row.client_observed_at ?? null,
    lat:              row.lat               ?? null,
    lng:              row.lng               ?? null,
    gpsAccuracy:      row.gps_accuracy      ?? null,
    bulkEc:           row.bulk_ec           ?? null,
    soilTempC:        row.soil_temp_c       ?? null,
    irTempC:          row.ir_temp_c         ?? null,
    periodUs:         row.tdr_period_us     ?? null,
    satelliteTotal:   row.satellite_total   ?? null,
    gpsHdop:          row.gps_hdop          ?? null,
    gpsFix:           row.gps_fix            ?? null,
    rodLength:        row.rod_length         ?? null,
    soilType:         row.soil_type          ?? null,
    meterId:          row.meter_id           ?? null,
    createdAt:        row.created_at,
  }
}

// Patchable columns: apiKey → db column. Flags handled separately (0/1).
const CORE_COLUMNS = {
  observedBy:  'observed_by',
  location:    'location',
  surfaceNote: 'surface_note',
  notes:       'notes',
}
const FLAG_COLUMNS = {
  wiltStress:   'wilt_stress',
  drySpot:      'dry_spot',
  handwaterRec: 'handwater_rec',
  syringeRec:   'syringe_rec',
}

// ── List + Get ──────────────────────────────────────────────────────────────

/**
 * GET /api/moisture?courseId=...&location=...&days=N&limit=N
 * Newest first.
 */
export async function listMoisture(env, courseId, opts = {}) {
  if (!env.DB) return json([])
  const { where, binds } = buildCourseFilter(courseId)
  const sets = where ? [where.replace('WHERE ', '')] : []
  const all  = [...binds]
  if (opts.location) { sets.push('location = ?'); all.push(opts.location) }
  if (opts.days) {
    const d = parseInt(opts.days, 10)
    if (Number.isFinite(d) && d > 0) {
      sets.push("observed_at >= datetime('now', ?)")
      all.push(`-${d} days`)
    }
  }
  const whereClause = sets.length > 0 ? `WHERE ${sets.join(' AND ')}` : ''
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 200, 1), 5000)
  const { results } = await env.DB.prepare(
    `SELECT * FROM moisture_observations ${whereClause}
     ORDER BY datetime(observed_at) DESC LIMIT ${limit}`,
  ).bind(...all).all()
  return json((results ?? []).map(rowToObs))
}

export async function getMoisture(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const row = await env.DB.prepare(
    'SELECT * FROM moisture_observations WHERE id = ?',
  ).bind(id).first()
  if (!row) return notFound('Moisture observation not found')
  return json(rowToObs(row))
}

// ── Create + Update + Delete ──────────────────────────────────────────────

export async function createMoisture(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)
  if (!body.location || typeof body.location !== 'string' || body.location.trim() === '') {
    return badRequest('location is required')
  }

  // Phase 7A.1: clientId dedup. If the browser retried a previous submit
  // (e.g. flaky network on the course), we don't want a duplicate row —
  // return the prior row so the client's optimistic insert resolves cleanly.
  const clientId = typeof body.clientId === 'string' && body.clientId.trim() !== ''
    ? body.clientId.trim() : null
  if (clientId) {
    const existing = await env.DB.prepare(
      'SELECT * FROM moisture_observations WHERE client_id = ?',
    ).bind(clientId).first()
    if (existing) return json(rowToObs(existing))
  }

  const id         = body.id ?? generateId('moist')
  const courseId   = resolveCourseId(body)
  const observedAt = body.observedAt ?? new Date().toISOString()

  await env.DB.prepare(`
    INSERT INTO moisture_observations (
      id, course_id, observed_at, observed_by, location, hole,
      moisture_pct, surface_note,
      wilt_stress, dry_spot, handwater_rec, syringe_rec, notes,
      client_id, client_observed_at, lat, lng, gps_accuracy,
      bulk_ec, soil_temp_c, ir_temp_c, tdr_period_us, satellite_total,
      gps_hdop, gps_fix, rod_length, soil_type, meter_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, courseId, observedAt,
    body.observedBy ?? null,
    body.location.trim(),
    num(body.hole),
    num(body.moisturePct),
    body.surfaceNote ?? null,
    bit(body.wiltStress), bit(body.drySpot), bit(body.handwaterRec), bit(body.syringeRec),
    body.notes ?? null,
    clientId,
    typeof body.clientObservedAt === 'string' && body.clientObservedAt ? body.clientObservedAt : null,
    num(body.lat),
    num(body.lng),
    num(body.gpsAccuracy),
    num(body.bulkEc),
    num(body.soilTempC),
    num(body.irTempC),
    num(body.periodUs),
    num(body.satelliteTotal),
    num(body.gpsHdop),
    body.gpsFix ?? null,
    body.rodLength ?? null,
    body.soilType ?? null,
    body.meterId ?? null,
  ).run()

  return getMoisture(env, id)
}

export async function importMoisture(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)
  const readings = Array.isArray(body.readings) ? body.readings : null
  if (!readings || readings.length === 0) return badRequest('readings are required')
  if (readings.length > 250) return badRequest('Import batches are limited to 250 readings')

  const courseId = resolveCourseId(body)
  const normalized = []
  for (let index = 0; index < readings.length; index += 1) {
    const reading = readings[index] ?? {}
    const location = typeof reading.location === 'string' ? reading.location.trim() : ''
    const moisturePct = num(reading.moisturePct)
    const observedAt = typeof reading.observedAt === 'string' ? reading.observedAt : ''
    const clientId = typeof reading.clientId === 'string' ? reading.clientId.trim() : ''
    if (!location) return badRequest(`Reading ${index + 1}: location is required`)
    if (moisturePct === null || moisturePct < 0 || moisturePct > 100) {
      return badRequest(`Reading ${index + 1}: moisturePct must be between 0 and 100`)
    }
    if (!observedAt || !Number.isFinite(Date.parse(observedAt))) {
      return badRequest(`Reading ${index + 1}: observedAt is invalid`)
    }
    if (!clientId) return badRequest(`Reading ${index + 1}: clientId is required for duplicate protection`)

    normalized.push({
      id: generateId('moist'),
      observedAt,
      observedBy: reading.observedBy ?? body.observedBy ?? null,
      location,
      hole: num(reading.hole),
      moisturePct,
      notes: typeof reading.notes === 'string' ? reading.notes.slice(0, 2000) : null,
      clientId,
      lat: num(reading.lat),
      lng: num(reading.lng),
      gpsAccuracy: num(reading.gpsAccuracy),
      bulkEc: num(reading.bulkEc),
      soilTempC: num(reading.soilTempC),
      irTempC: num(reading.irTempC),
      periodUs: num(reading.periodUs),
      satelliteTotal: num(reading.satelliteTotal),
      gpsHdop: num(reading.gpsHdop),
      gpsFix: typeof reading.gpsFix === 'string' ? reading.gpsFix.slice(0, 40) : null,
      rodLength: typeof reading.rodLength === 'string' ? reading.rodLength.slice(0, 80) : null,
      soilType: typeof reading.soilType === 'string' ? reading.soilType.slice(0, 80) : null,
      meterId: typeof reading.meterId === 'string' ? reading.meterId.slice(0, 80) : null,
    })
  }

  let inserted = 0
  for (let offset = 0; offset < normalized.length; offset += 50) {
    const chunk = normalized.slice(offset, offset + 50)
    const statements = chunk.flatMap(reading => [
      env.DB.prepare(`
        INSERT OR IGNORE INTO moisture_observations (
          id, course_id, observed_at, observed_by, location, hole,
          moisture_pct, surface_note,
          wilt_stress, dry_spot, handwater_rec, syringe_rec, notes,
          client_id, client_observed_at, lat, lng, gps_accuracy,
          bulk_ec, soil_temp_c, ir_temp_c, tdr_period_us, satellite_total,
          gps_hdop, gps_fix, rod_length, soil_type, meter_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        reading.id, courseId, reading.observedAt, reading.observedBy,
        reading.location, reading.hole, reading.moisturePct, reading.notes,
        reading.clientId, reading.observedAt, reading.lat, reading.lng, reading.gpsAccuracy,
        reading.bulkEc, reading.soilTempC, reading.irTempC, reading.periodUs,
        reading.satelliteTotal, reading.gpsHdop, reading.gpsFix, reading.rodLength,
        reading.soilType, reading.meterId,
      ),
      env.DB.prepare(`
        UPDATE moisture_observations SET
          bulk_ec = COALESCE(?, bulk_ec),
          soil_temp_c = COALESCE(?, soil_temp_c),
          ir_temp_c = COALESCE(?, ir_temp_c),
          tdr_period_us = COALESCE(?, tdr_period_us),
          satellite_total = COALESCE(?, satellite_total),
          gps_hdop = COALESCE(?, gps_hdop),
          gps_fix = COALESCE(?, gps_fix),
          rod_length = COALESCE(?, rod_length),
          soil_type = COALESCE(?, soil_type),
          meter_id = COALESCE(?, meter_id)
        WHERE client_id = ? AND course_id = ?
      `).bind(
        reading.bulkEc, reading.soilTempC, reading.irTempC, reading.periodUs,
        reading.satelliteTotal, reading.gpsHdop, reading.gpsFix, reading.rodLength,
        reading.soilType, reading.meterId, reading.clientId, courseId,
      ),
    ])
    const results = await env.DB.batch(statements)
    for (let index = 0; index < results.length; index += 2) {
      inserted += Number(results[index]?.meta?.changes) || 0
    }
  }

  return json({
    received: normalized.length,
    inserted,
    skipped: normalized.length - inserted,
  })
}

export async function updateMoisture(env, id, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body  = await readJson(request)
  const sets  = []
  const binds = []

  for (const [apiKey, col] of Object.entries(CORE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    let v = body[apiKey]
    if (apiKey === 'location') {
      v = typeof v === 'string' ? v.trim() : ''
      if (v === '') return badRequest('location cannot be empty')
    }
    sets.push(`${col} = ?`); binds.push(v)
  }
  for (const [apiKey, col] of Object.entries(FLAG_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(body, apiKey)) continue
    sets.push(`${col} = ?`); binds.push(bit(body[apiKey]))
  }
  if (Object.prototype.hasOwnProperty.call(body, 'moisturePct')) {
    sets.push('moisture_pct = ?'); binds.push(num(body.moisturePct))
  }
  if (Object.prototype.hasOwnProperty.call(body, 'hole')) {
    sets.push('hole = ?'); binds.push(num(body.hole))
  }
  if (sets.length === 0) return badRequest('No mutable fields supplied')

  binds.push(id)
  const result = await env.DB.prepare(
    `UPDATE moisture_observations SET ${sets.join(', ')} WHERE id = ?`,
  ).bind(...binds).run()
  if (!result.success || result.meta.changes === 0) return notFound('Moisture observation not found')
  return getMoisture(env, id)
}

export async function deleteMoisture(env, id) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const result = await env.DB.prepare(
    'DELETE FROM moisture_observations WHERE id = ?',
  ).bind(id).run()
  if (!result.success || result.meta.changes === 0) return notFound('Moisture observation not found')
  return json({ ok: true, id })
}
