// Operations Calendar events — moved to D1 persistence in Phase 5.4a.
// Consumers now use calendarStore (src/utils/calendar/calendarStore.js).
//
// Schema (for reference; SQL truth lives in
// worker/migrations/0008_calendar_events.sql):
//
// calendar_events — { id, sourceType, sourceId, title, eventType,
//                     category (alias of eventType), status,
//                     startDate, date (alias of startDate),
//                     startTime, endDate, endTime, location,
//                     description, notes (alias of description),
//                     priority, assignedStaff[], equipment[], tags[],
//                     course, metadata: { sourceModule, sourceId,
//                     createdAt }, createdAt, updatedAt }
//
// Legacy empty export preserved as a defensive backstop. No consumer
// in the app reads from it any more.

export const CALENDAR_EVENTS = []
