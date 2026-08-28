import { badRequest, json } from '../lib/json.js'
import { resolveActor, actorCanAccessCourse, isAutomationActor } from '../lib/actor.js'

const ALLOWED_MODULES = new Set([
  'command',
  'applicationTiming',
  'operations',
  'readiness',
  'weather',
  'agronomy',
  'irrigation',
  'gdd',
  'stewardship',
  'calendar',
])

function courseIdFrom(request) {
  return new URL(request.url).searchParams.get('courseId') || 'crossroads-gc'
}

function cleanLayout(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const order = Array.isArray(value.order)
    ? [...new Set(value.order.filter(id => ALLOWED_MODULES.has(id)))]
    : []
  const hidden = Array.isArray(value.hidden)
    ? [...new Set(value.hidden.filter(id => ALLOWED_MODULES.has(id)))]
    : []
  for (const id of ALLOWED_MODULES) {
    if (!order.includes(id)) order.push(id)
  }
  return { order, hidden }
}

function parseLayout(value) {
  try { return cleanLayout(JSON.parse(value ?? 'null')) }
  catch { return null }
}

export async function getDashboardPreferences(env, request) {
  const actor = await resolveActor(request, env)
  const courseId = courseIdFrom(request)
  if (!actor || !actorCanAccessCourse(actor, courseId)) return json({ error: 'Forbidden' }, 403)
  if (isAutomationActor(actor) || !actor.id) return json({ layout: null, courseId })

  const row = await env.DB.prepare(
    'SELECT layout_json, updated_at FROM dashboard_preferences WHERE user_id = ? AND course_id = ?',
  ).bind(actor.id, courseId).first()

  const layout = parseLayout(row?.layout_json)
  return json({ layout, courseId, updatedAt: row?.updated_at ?? null })
}

export async function saveDashboardPreferences(env, request) {
  const actor = await resolveActor(request, env)
  const courseId = courseIdFrom(request)
  if (!actor || isAutomationActor(actor) || !actor.id) return json({ error: 'A signed-in user is required' }, 401)
  if (!actorCanAccessCourse(actor, courseId)) return json({ error: 'Forbidden' }, 403)

  let body
  try { body = await request.json() } catch { return badRequest('Valid JSON required') }
  const layout = cleanLayout(body?.layout)
  if (!layout) return badRequest('A dashboard layout is required')

  await env.DB.prepare(`
    INSERT INTO dashboard_preferences (user_id, course_id, layout_json, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, course_id) DO UPDATE SET
      layout_json = excluded.layout_json,
      updated_at = datetime('now')
  `).bind(actor.id, courseId, JSON.stringify(layout)).run()

  return json({ layout, courseId })
}
