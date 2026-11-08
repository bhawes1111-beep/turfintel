import { json, badRequest, readJson } from '../lib/json.js'
import { generateId } from '../lib/id.js'
import { verifyPassword } from '../lib/passwords.js'
import { mintToken, hashToken, expiryFromNow, isExpired } from '../lib/sessions.js'
import { clientIp } from '../lib/rateLimit.js'
import { resolveActor, actorCanAccessCourse } from '../lib/actor.js'

const COOKIE_NAME = 'ti_work_board'
const SESSION_DAYS = 30
const DEFAULT_PIN = '2026'
const ATTEMPT_WINDOW_MINUTES = 15
const MAX_FAILED_ATTEMPTS = 8

function courseScope(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'crossroads-gc'
}

function readCookie(request) {
  const header = request.headers.get('Cookie') || request.headers.get('cookie') || ''
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() === COOKIE_NAME) {
      return part.slice(index + 1).trim() || null
    }
  }
  return null
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}`
}

function clearedCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

function jsonWithCookie(data, cookie, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': cookie,
    },
  })
}

async function isRateLimited(env, employeeId, ip) {
  try {
    const row = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN employee_id = ? THEN 1 ELSE 0 END) AS by_employee,
        SUM(CASE WHEN ip = ? THEN 1 ELSE 0 END) AS by_ip
      FROM work_board_pin_attempts
      WHERE success = 0
        AND attempted_at >= datetime('now', ?)
    `).bind(employeeId || '', ip || '', `-${ATTEMPT_WINDOW_MINUTES} minutes`).first()
    return Number(row?.by_employee || 0) >= MAX_FAILED_ATTEMPTS
      || Number(row?.by_ip || 0) >= MAX_FAILED_ATTEMPTS
  } catch {
    return false
  }
}

async function recordAttempt(env, { employeeId, courseId, ip, success }) {
  try {
    await env.DB.prepare(`
      INSERT INTO work_board_pin_attempts
        (id, employee_id, course_id, ip, success)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      generateId('wbp'), employeeId || null, courseId || null, ip || null, success ? 1 : 0,
    ).run()
  } catch { /* best-effort throttle audit */ }
}

async function clearFailures(env, employeeId, courseId) {
  try {
    await env.DB.prepare(`
      DELETE FROM work_board_pin_attempts
      WHERE employee_id = ? AND course_id = ? AND success = 0
    `).bind(employeeId, courseId).run()
  } catch { /* best-effort */ }
}

function pruneOld(env) {
  env.DB.prepare(`
    DELETE FROM work_board_pin_attempts
    WHERE attempted_at < datetime('now', '-1 day')
  `).run().catch(() => {})
  env.DB.prepare(`
    DELETE FROM work_board_sessions
    WHERE expires_at <= datetime('now')
  `).run().catch(() => {})
}

export async function listWorkBoardEmployees(env, courseId) {
  const scopedCourse = courseScope(courseId)
  const { results } = await env.DB.prepare(`
    SELECT id, name
    FROM crew_employees
    WHERE course_id = ? AND status = 'active'
    ORDER BY name COLLATE NOCASE ASC
  `).bind(scopedCourse).all()
  return json(results.map(row => ({ id: row.id, name: row.name })))
}

export async function resolveWorkBoardSession(request, env, courseId) {
  if (!env.DB) return null
  const token = readCookie(request)
  if (!token) return null
  const tokenHash = await hashToken(token).catch(() => null)
  if (!tokenHash) return null
  const session = await env.DB.prepare(`
    SELECT session.*, employee.name AS employee_name, employee.status AS employee_status
    FROM work_board_sessions session
    JOIN crew_employees employee ON employee.id = session.employee_id
    WHERE session.token_hash = ? AND session.course_id = ?
  `).bind(tokenHash, courseScope(courseId)).first().catch(() => null)
  if (!session || isExpired(session.expires_at) || session.employee_status !== 'active') return null
  env.DB.prepare("UPDATE work_board_sessions SET last_seen_at = datetime('now') WHERE id = ?")
    .bind(session.id).run().catch(() => {})
  return session
}

export async function canViewWorkBoard(request, env, courseId) {
  const scopedCourse = courseScope(courseId)
  const actor = await resolveActor(request, env)
  if (actor) return actorCanAccessCourse(actor, scopedCourse)
  return Boolean(await resolveWorkBoardSession(request, env, scopedCourse))
}

export async function getWorkBoardSession(env, request, courseId) {
  const scopedCourse = courseScope(courseId)
  const actor = await resolveActor(request, env)
  if (actor && actorCanAccessCourse(actor, scopedCourse)) {
    return json({ authenticated: true, mode: 'manager', employee: null })
  }
  const session = await resolveWorkBoardSession(request, env, scopedCourse)
  if (!session) return json({ authenticated: false, mode: null, employee: null })
  return json({
    authenticated: true,
    mode: 'employee',
    employee: { id: session.employee_id, name: session.employee_name },
  })
}

export async function unlockWorkBoard(env, request) {
  if (!env.DB) return json({ error: 'D1 not configured' }, 503)
  const body = await readJson(request)
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : ''
  const pin = typeof body.pin === 'string' ? body.pin.trim() : ''
  const courseId = courseScope(body.courseId)
  if (!employeeId || !/^\d{4}$/.test(pin)) return badRequest('Select your name and enter a 4-digit PIN')

  const ip = clientIp(request)
  if (await isRateLimited(env, employeeId, ip)) {
    return json({ error: 'Too many attempts. Please wait 15 minutes and try again.' }, 429)
  }

  const employee = await env.DB.prepare(`
    SELECT id, name, status, work_board_pin_hash
    FROM crew_employees
    WHERE id = ? AND course_id = ?
  `).bind(employeeId, courseId).first().catch(() => null)
  const valid = Boolean(employee && employee.status === 'active') && (
    employee.work_board_pin_hash
      ? await verifyPassword(pin, employee.work_board_pin_hash)
      : pin === DEFAULT_PIN
  )
  if (!valid) {
    await recordAttempt(env, { employeeId, courseId, ip, success: false })
    return json({ error: 'Employee or PIN not recognized' }, 401)
  }

  await clearFailures(env, employeeId, courseId)
  await recordAttempt(env, { employeeId, courseId, ip, success: true })
  pruneOld(env)

  const token = mintToken()
  const tokenHash = await hashToken(token)
  await env.DB.prepare(`
    INSERT INTO work_board_sessions
      (id, token_hash, employee_id, course_id, expires_at, last_seen_at, user_agent)
    VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
  `).bind(
    generateId('wbs'),
    tokenHash,
    employee.id,
    courseId,
    expiryFromNow(SESSION_DAYS),
    (request.headers.get('User-Agent') || '').slice(0, 256) || null,
  ).run()

  return jsonWithCookie({
    authenticated: true,
    mode: 'employee',
    employee: { id: employee.id, name: employee.name },
  }, sessionCookie(token))
}

export async function logoutWorkBoard(env, request) {
  const token = readCookie(request)
  if (token && env.DB) {
    const tokenHash = await hashToken(token).catch(() => null)
    if (tokenHash) {
      await env.DB.prepare('DELETE FROM work_board_sessions WHERE token_hash = ?')
        .bind(tokenHash).run().catch(() => {})
    }
  }
  return jsonWithCookie({ authenticated: false }, clearedCookie())
}
