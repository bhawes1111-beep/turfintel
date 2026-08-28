const API = '/api/display-board/state'

async function fetchJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GET ${url} -> ${res.status} ${text}`)
  }
  return res.json()
}

export async function fetchDisplayBoardState({ courseId, date } = {}) {
  const params = new URLSearchParams()
  if (courseId) params.set('courseId', courseId)
  if (date) params.set('date', date)
  return fetchJSON(`${API}${params.toString() ? `?${params}` : ''}`)
}

export function emptyDisplayBoardState() {
  return {
    events: [], sprays: [], crewAssignments: [], equipmentReservations: [],
    alerts: [], employees: [], schedules: [], scheduleOverrides: [],
    notes: [], moisture: [], assignmentPhotos: [],
    displaySettings: { showEmployeeProfilePhotos: false },
  }
}
