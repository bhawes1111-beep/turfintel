// Phase 5.7 — course scope helpers for the Worker.
//
// buildCourseFilter(courseId)
//   → { where: 'WHERE course_id = ?', binds: [courseId] }
//   → when courseId is null/undefined: { where: '', binds: [] }
//
// resolveCourseId(body)
//   Returns the courseId to write on INSERT. Defaults to 'crossroads-gc'
//   so legacy clients that don't send a courseId stay scoped to the
//   first/only course.

export function buildCourseFilter(courseId) {
  return courseId
    ? { where: 'WHERE course_id = ?', binds: [courseId] }
    : { where: '', binds: [] }
}

export function resolveCourseId(body) {
  return body?.courseId ?? 'crossroads-gc'
}
