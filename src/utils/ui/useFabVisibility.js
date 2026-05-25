// Phase 7B.1 — Route-aware FAB visibility.
//
// Each capture FAB is visible only where it makes operational sense:
//   - Moisture FAB on /irrigation/* and /dashboard
//   - Turf Health FAB on /turf-health/* and /dashboard
//   - Both visible together on /dashboard (and the FAB CSS handles stacking)
//   - Hidden everywhere else (so /reports, /equipment, etc. stay clean)
//
// One hook so the rules live in a single place; FAB components just read it.
// Path matching: exact equality OR startsWith(prefix + '/') so /irrigation
// matches /irrigation/moisture etc., but /irrigation-foo doesn't accidentally
// match (matters less in this codebase but follows the React Router norm).

import { useLocation } from 'react-router-dom'

const FAB_VISIBILITY = {
  moisture:    ['/dashboard', '/irrigation'],
  turfHealth:  ['/dashboard', '/turf-health'],
}

function matchesAny(pathname, prefixes) {
  for (const p of prefixes) {
    if (pathname === p) return true
    if (pathname.startsWith(p + '/')) return true
  }
  return false
}

/**
 * @param {'moisture' | 'turfHealth'} kind
 * @returns {{ visible: boolean, onDashboard: boolean }}
 *   visible      — should this FAB render at all?
 *   onDashboard  — is the current route /dashboard (so the FAB needs to
 *                  honor the stacking offset)?
 */
export function useFabVisibility(kind) {
  const { pathname } = useLocation()
  const prefixes = FAB_VISIBILITY[kind] ?? []
  return {
    visible:     matchesAny(pathname, prefixes),
    onDashboard: pathname === '/dashboard' || pathname.startsWith('/dashboard/'),
  }
}
