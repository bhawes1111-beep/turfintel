// ── Shared operational schema definitions ─────────────────────────────────────
//
// Factory functions produce objects shaped for the Operations Calendar and
// Dashboard Alert system. All IDs are client-generated here.
//
// API-READY: When a backend is available, replace the id generator with a
// server-returned ID and add a `sync: 'pending'` field to metadata so the
// optimistic-update layer knows which records need to be pushed.

// ── Type constants ────────────────────────────────────────────────────────────

export const EVENT_CATEGORIES = ['spray', 'crew', 'maintenance', 'agronomy', 'irrigation']
export const EVENT_STATUSES   = ['scheduled', 'in-progress', 'completed', 'cancelled']
export const EVENT_PRIORITIES = ['high', 'medium', 'low']
export const ALERT_PRIORITIES = ['critical', 'high', 'medium', 'low', 'info']
export const ALERT_MODULES    = ['spray', 'irrigation', 'equipment', 'disease', 'inventory', 'nutrition', 'weather', 'crew']

// ── ID generator ──────────────────────────────────────────────────────────────

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── Calendar event factory ────────────────────────────────────────────────────
//
// Matches the schema in src/data/dashboardCalendarEvents.js exactly so
// new events appear in the Operations Calendar without any adapter layer.

export function makeCalendarEvent({
  title,
  date,
  category,
  priority      = 'medium',
  status        = 'scheduled',
  startTime     = '',
  endTime       = '',
  location      = '',
  assignedStaff = [],
  equipment     = [],
  tags          = [],
  notes         = '',
  sourceModule  = null,
  sourceId      = null,
} = {}) {
  return {
    id:           uid('evt-op'),
    category,
    priority,
    status,
    title,
    date,
    startTime,
    endTime,
    location,
    assignedStaff: [...assignedStaff],
    equipment:    [...equipment],
    tags:         [...tags],
    notes,
    recurrence:   null,
    externalId:   null,
    metadata: {
      createdBy:    'operations-layer',
      createdAt:    new Date().toISOString(),
      sourceModule,
      sourceId,
      // API-READY: sync: 'pending',
    },
  }
}

// ── Dashboard alert factory ───────────────────────────────────────────────────
//
// Matches the schema in src/data/dashboardAlerts.js.

export function makeAlert({
  title,
  message,
  module,
  priority    = 'medium',
  status      = 'new',
  course      = null,
  actionLabel = null,
  sourceId    = null,
} = {}) {
  return {
    id:          uid('al-op'),
    title,
    message,
    module,
    priority,
    status,
    course,
    date:        new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    actionLabel,
    metadata: {
      createdBy: 'operations-layer',
      createdAt: new Date().toISOString(),
      sourceId,
      // API-READY: sync: 'pending',
    },
  }
}

// ── Crew assignment record factory ────────────────────────────────────────────
//
// Records who was assigned to an event. ASSIGN_CREW also patches the
// event's assignedStaff array in the reducer.

export function makeCrewAssignment({
  eventId,
  staffNames = [],
  date       = '',
  role       = '',
  notes      = '',
} = {}) {
  return {
    id:         uid('ca'),
    eventId,
    staffNames: [...staffNames],
    date,
    role,
    notes,
    createdAt:  new Date().toISOString(),
  }
}

// ── Equipment reservation record factory ──────────────────────────────────────
//
// Records which equipment is reserved for an event. RESERVE_EQUIPMENT also
// patches the event's equipment array in the reducer.

export function makeEquipmentReservation({
  eventId,
  equipmentNames = [],
  date           = '',
  notes          = '',
} = {}) {
  return {
    id:             uid('er'),
    eventId,
    equipmentNames: [...equipmentNames],
    date,
    notes,
    createdAt:      new Date().toISOString(),
  }
}

// ── Inventory usage record factory ────────────────────────────────────────────
//
// Records a product deduction event. DEDUCT_INVENTORY uses this as its payload
// so the usage record is simultaneously the audit trail and the action.
//
// API-READY: swap dispatch for POST /api/inventory/deduct — optimistic update
// the local state, then reconcile with the server-returned record.

export function makeInventoryUsage({
  productName,
  quantityUsed,
  unit,
  eventId    = null,
  sourceId   = null,
  date       = '',
  area       = '',
  applicator = '',
} = {}) {
  return {
    id:          uid('iu'),
    productName,
    quantityUsed,
    unit,
    eventId,
    sourceId,
    date,
    area,
    applicator,
    createdAt:   new Date().toISOString(),
  }
}
