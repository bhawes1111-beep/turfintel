export const ACTIVITY_TYPE = {
  SPRAY_APPLICATION: 'spray-application',
  IRRIGATION_REPAIR: 'irrigation-repair',
  EQUIPMENT_SERVICE: 'equipment-service',
  ALERT:             'alert',
}

export const ACTIVITY_MODULE = {
  SPRAY:     'spray',
  IRRIGATION: 'irrigation',
  EQUIPMENT:  'equipment',
  ALERTS:    'alerts',
}

export function createActivity({
  id,
  type,
  module,
  title,
  description,
  timestamp,
  severity    = 'info',
  attachments = [],
  metadata    = {},
  relatedIds  = [],
}) {
  return { id, type, module, title, description, timestamp, severity, attachments, metadata, relatedIds }
}
