// JSON Response helpers — kept minimal.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function badRequest(message)   { return json({ error: message }, 400) }
export function notFound(message = 'Not found') { return json({ error: message }, 404) }
export function serverError(err)      { return json({ error: err?.message ?? String(err) }, 500) }

export async function readJson(request) {
  try {
    return await request.json()
  } catch {
    throw new Error('Invalid JSON body')
  }
}
