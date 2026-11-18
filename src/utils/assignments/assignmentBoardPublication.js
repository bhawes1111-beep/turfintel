import { mutationHeaders } from '../auth/mutationAuth'
import { getSelectedCourseId } from '../courses/courseStore'

const API = '/api/assignment-board-publications'

async function fetchJSON(url, init) {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} -> ${response.status} ${body}`)
  }
  return response.json()
}

export async function fetchAssignmentBoardPublication(publicationDate, courseId = getSelectedCourseId()) {
  const params = new URLSearchParams({ date: publicationDate })
  if (courseId) params.set('courseId', courseId)
  return fetchJSON(`${API}?${params}`)
}

export async function postAssignmentBoard(publicationDate, courseId = getSelectedCourseId()) {
  return fetchJSON(API, {
    method: 'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({ courseId, publicationDate }),
  })
}
