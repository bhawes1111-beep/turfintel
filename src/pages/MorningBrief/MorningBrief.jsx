// Phase 6A.1 — top-level Morning Brief route.
//
// The Morning Brief was previously reachable only as tab 1 of 6 inside
// /crew (the Operations workspace). It is the superintendent's highest-
// value 5:30am surface, so it gets its own /morning-brief route and
// sidebar entry near the top. The Operations tab stays intact for
// back-compat — this page is a thin PageShell wrapper around the
// existing MorningBriefTab component (no logic duplicated).

import PageShell from '../../components/layout/PageShell'
import MorningBriefTab from '../Operations/MorningBriefTab'

export default function MorningBrief() {
  return (
    <PageShell
      title="Morning Brief"
      description="Today's operational picture at a glance"
    >
      <MorningBriefTab />
    </PageShell>
  )
}
