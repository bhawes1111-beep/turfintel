/**
 * PlaceholderPage — production-safe shell for routes whose feature isn't
 * built yet. Wraps PageShell (so the sidebar/header chrome stays consistent)
 * and renders an EmptyState in the content area.
 *
 * Use when:
 *   - A sidebar entry needs a route NOW
 *   - The real page is on a future roadmap
 *   - You need an honest "no data yet" surface, not fake records
 *
 * Props:
 *   title       — page title (renders in the PageShell header)
 *   emptyTitle  — EmptyState title (default: "No records available.")
 *   emptyDesc   — EmptyState description
 *               (default: "This section is ready for live data.")
 */

import PageShell from '../layout/PageShell'
import { EmptyState } from './EmptyState'

export default function PlaceholderPage({
  title,
  emptyTitle = 'No records available.',
  emptyDesc  = 'This section is ready for live data.',
}) {
  return (
    <PageShell title={title}>
      <EmptyState title={emptyTitle} description={emptyDesc} />
    </PageShell>
  )
}
