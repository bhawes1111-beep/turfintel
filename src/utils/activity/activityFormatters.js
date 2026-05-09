import { SEVERITY_TOKENS } from '../intelligence/severity'

const MODULE_ICONS = {
  spray:      '🌿',
  irrigation: '💧',
  equipment:  '⚙️',
  alerts:     '⚠️',
}

const MODULE_LABELS = {
  spray:      'Spray',
  irrigation: 'Irrigation',
  equipment:  'Equipment',
  alerts:     'Alert',
}

export function getModuleIcon(module)  { return MODULE_ICONS[module]  ?? '•' }
export function getModuleLabel(module) { return MODULE_LABELS[module] ?? module }
export function getSeverityMeta(severity) { return SEVERITY_TOKENS[severity] ?? SEVERITY_TOKENS.info }

export function formatRelativeTime(timestamp) {
  const diffMs   = Date.now() - new Date(timestamp).getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7)   return `${diffDays}d ago`
  if (diffDays < 30)  return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

export function formatActivityDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
