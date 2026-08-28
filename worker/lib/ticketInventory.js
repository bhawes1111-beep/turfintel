import { generateId } from './id.js'

function parseParts(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function findInventoryPart(env, part, courseId) {
  if (part?.inventoryItemId) {
    const byId = await env.DB.prepare(
      `SELECT id, name, unit, quantity, course_id
         FROM inventory_items
        WHERE id = ? AND kind IN ('part', 'irrigation')
        LIMIT 1`,
    ).bind(part.inventoryItemId).first()
    if (byId) return byId
  }

  const name = String(part?.part ?? '').trim()
  if (!name) return null
  return env.DB.prepare(
    `SELECT id, name, unit, quantity, course_id
       FROM inventory_items
      WHERE LOWER(name) = LOWER(?)
        AND kind IN ('part', 'irrigation')
        AND (course_id = ? OR course_id IS NULL)
      ORDER BY CASE WHEN course_id = ? THEN 0 ELSE 1 END
      LIMIT 1`,
  ).bind(name, courseId ?? null, courseId ?? null).first()
}

export async function reconcileTicketPartInventory(env, {
  sourceId,
  partsUsed,
  courseId = null,
  date = null,
  area = null,
  applicator = null,
}) {
  const now = new Date().toISOString()
  const { results: priorUsage } = await env.DB.prepare(
    `SELECT id, product_name, quantity_used
       FROM inventory_usage
      WHERE source_id = ? AND reverted_at IS NULL`,
  ).bind(sourceId).all()

  for (const usage of priorUsage) {
    const item = await env.DB.prepare(
      `SELECT id, quantity FROM inventory_items
        WHERE LOWER(name) = LOWER(?)
          AND kind IN ('part', 'irrigation')
          AND (course_id = ? OR course_id IS NULL)
        ORDER BY CASE WHEN course_id = ? THEN 0 ELSE 1 END
        LIMIT 1`,
    ).bind(usage.product_name, courseId, courseId).first()
    if (item) {
      await env.DB.prepare(
        `UPDATE inventory_items
            SET quantity = ?, updated_at = datetime('now')
          WHERE id = ?`,
      ).bind((Number(item.quantity) || 0) + (Number(usage.quantity_used) || 0), item.id).run()
    }
    await env.DB.prepare(
      'UPDATE inventory_usage SET reverted_at = ? WHERE id = ?',
    ).bind(now, usage.id).run()
  }

  const quantitiesByItem = new Map()
  for (const part of parseParts(partsUsed)) {
    const quantity = Number(part?.qty ?? part?.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    const item = await findInventoryPart(env, part, courseId)
    if (!item) continue
    const existing = quantitiesByItem.get(item.id)
    quantitiesByItem.set(item.id, {
      item,
      quantity: (existing?.quantity ?? 0) + quantity,
    })
  }

  for (const { item, quantity } of quantitiesByItem.values()) {
    const nextQuantity = Math.max(0, (Number(item.quantity) || 0) - quantity)
    await env.DB.prepare(
      `UPDATE inventory_items
          SET quantity = ?, updated_at = datetime('now')
        WHERE id = ?`,
    ).bind(nextQuantity, item.id).run()
    await env.DB.prepare(`
      INSERT INTO inventory_usage (
        id, product_name, quantity_used, unit, source_id,
        date, area, applicator, course_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      generateId('usage'),
      item.name,
      quantity,
      item.unit ?? null,
      sourceId,
      date,
      area,
      applicator,
      courseId,
    ).run()
  }
}

export async function reverseTicketPartInventory(env, sourceId, courseId = null) {
  await reconcileTicketPartInventory(env, { sourceId, partsUsed: [], courseId })
}
