import { getSelectedCourseId, withCourseScope } from '../courses/courseStore'
import { mutationHeaders } from '../auth/mutationAuth'
import { refreshInventoryData } from './inventoryStore'

const API = '/api/inventory/purchase-invoices'

async function responseJSON(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `Request failed (${response.status})`)
  }
  return response.json()
}

export async function listPurchaseInvoices() {
  return responseJSON(await fetch(withCourseScope(API), { credentials: 'same-origin' }))
}

export async function uploadPurchaseInvoice(file) {
  const form = new FormData()
  form.append('file', file)
  form.append('courseId', getSelectedCourseId())
  return responseJSON(await fetch(API, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  }))
}

export async function approvePurchaseInvoice(id, invoice) {
  const saved = await responseJSON(await fetch(`${API}/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: mutationHeaders(),
    body: JSON.stringify(invoice),
  }))
  await refreshInventoryData()
  return saved
}

export async function deletePurchaseInvoice(id) {
  return responseJSON(await fetch(`${API}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: mutationHeaders(),
  }))
}
