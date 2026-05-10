/**
 * PlaceholderPage — production-safe shell for workspace routes whose
 * feature isn't built yet.
 *
 * Wraps PageShell (so sidebar/header chrome stays consistent) and renders
 * an EmptyState in the content area. Used by Weather and Reports during
 * Phase 1 of the workspace migration.
 *
 * Props:
 *   title       — workspace title (rendered in PageShell header)
 *   emptyTitle  — EmptyState title (default: "No records available.")
 *   emptyDesc   — EmptyState description
 *                 (default: "This workspace is ready for live data.")
 */

import PageShell from '../layout/PageShell'
import { EmptyState } from './EmptyState'

export default function PlaceholderPage({
  title,
  emptyTitle = 'No records available.',
  emptyDesc  = 'This workspace is ready for live data.',
}) {
  return (
    <PageShell title={title}>
      <EmptyState title={emptyTitle} description={emptyDesc} />
    </PageShell>
  )
}
