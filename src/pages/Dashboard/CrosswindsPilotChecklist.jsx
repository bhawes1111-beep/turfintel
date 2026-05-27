import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './CrosswindsPilotChecklist.module.css'

// Phase 7P (1/?) — Crosswinds Pilot Setup checklist panel.
//
// Read-only collapsible checklist that mirrors
// docs/crosswinds-pilot-onboarding.md. Each step optionally links
// to the existing surface that addresses it; no step has a "do it
// for me" affordance. The panel itself never mutates and never
// persists which steps the user thinks they've completed — the
// in-page checkbox state is local-only (component state) so the
// dashboard stays a render of live data, not a chore list.
//
// Strict invariants:
//   - never calls a mutation store function
//   - never references /api/ directly
//   - the only affordances are per-step "Open" navigation links
//   - no fix / apply / save / commit / status affordances

const SUBTITLE_COPY = 'Use this checklist to prepare TurfIntel for daily operational use.'
const BOUNDARY_COPY = [
  'Read-only checklist.',
  'Linked surfaces are where the work happens; this panel never writes data.',
]

// Each step's `route` + `routeState` mirrors the existing
// cross-module navigation patterns. The full doc is in
// docs/crosswinds-pilot-onboarding.md.
const STEPS = [
  {
    id: 'inventory',
    title: '1. Inventory setup',
    detail: 'Load every product the course actually applies — chemicals, fertilizers, and any additional spray-sheet items — with kind, unit, and quantity.',
    route: '/inventory', routeState: { activeTab: 'Products' },
    routeLabel: 'Open Products',
  },
  {
    id: 'catalog',
    title: '2. Product Catalog linking',
    detail: 'Wire every chemical / product to its read-only Product Catalog row so Spray Intelligence and the planner can resolve FRAC / HRAC / REI / RUP info.',
    route: '/inventory', routeState: { activeTab: 'Link Review' },
    routeLabel: 'Open Link Review',
  },
  {
    id: 'cost-basis',
    title: '3. Cost basis setup',
    detail: 'For each product the course actually pays for, set Cost per unit + Unit + Source on the Cost basis stewardship editor in the Inventory drawer.',
    route: '/inventory', routeState: { activeTab: 'Products' },
    routeLabel: 'Open Products',
  },
  {
    id: 'program',
    title: '4. Spray Program entry',
    detail: 'Create the current-season program in Program Planner and add planned items for the next 30 days with target area, planned window, rate, and carrier.',
    route: '/spray', routeState: { activeTab: 'Program Planner' },
    routeLabel: 'Open Planner',
  },
  {
    id: 'completed-links',
    title: '5. Completed spray record linking',
    detail: 'For each completed planned item, click Link completed spray and pick the matching record. The link is one-way; nothing on the completed record changes.',
    route: '/spray', routeState: { activeTab: 'Program Planner' },
    routeLabel: 'Open Planner',
  },
  {
    id: 'dashboard',
    title: '6. Dashboard review',
    detail: 'Scroll the Operations strip, Stewardship Alerts, and Spray Program Snapshot. Tiles should reflect today\'s real data; Review links should deep-link cleanly.',
    route: '/dashboard', routeState: null,
    routeLabel: 'Open Dashboard',
  },
  {
    id: 'reports',
    title: '7. Report generation',
    detail: 'Generate Spray Intelligence, Spray Program, and Spray Program Cost from Reports. Confirm each preview renders, the disclaimer is present, and Print opens cleanly.',
    route: '/reports', routeState: null,
    routeLabel: 'Open Reports',
  },
  {
    id: 'mobile',
    title: '8. Mobile field test',
    detail: 'On the phone the field crew will use, confirm the Dashboard Operations strip stacks 2-up, the Inventory drawer scrolls cleanly, and the Program Calendar agenda renders below 700px.',
    route: null, routeState: null,
    routeLabel: null,
  },
  {
    id: 'backup',
    title: '9. Backup / export test',
    detail: 'From Reports, download each report\'s JSON. Confirm metadata.exportVersion, metadata.reportKind, and metadata.printExtras are present in each file.',
    route: '/reports', routeState: null,
    routeLabel: 'Open Reports',
  },
]

export default function CrosswindsPilotChecklist() {
  const navigate = useNavigate()
  // Local-only check state. The dashboard panel deliberately does
  // not persist this — pilot onboarding is a real-world workflow,
  // and the doc remains the source of truth. The boxes are a
  // visual aid only.
  const [checked, setChecked] = useState(() => new Set())
  const [open, setOpen]       = useState(true)

  function toggleChecked(id) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function openRoute(step) {
    if (!step.route) return
    navigate(step.route, step.routeState ? { state: step.routeState } : undefined)
  }

  const done = checked.size
  const total = STEPS.length

  return (
    <section className={styles.panel} aria-label="Crosswinds Pilot Setup">
      <header className={styles.header}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls="crosswinds-pilot-body"
        >
          <span className={styles.toggleChevron} aria-hidden>{open ? '▾' : '▸'}</span>
          <span className={styles.title}>Crosswinds Pilot Setup</span>
          <span className={styles.counter}>{done} / {total}</span>
        </button>
        <p className={styles.subtitle}>{SUBTITLE_COPY}</p>
      </header>

      {open && (
        <div id="crosswinds-pilot-body" className={styles.body}>
          <ul className={styles.list}>
            {STEPS.map(step => {
              const isDone = checked.has(step.id)
              return (
                <li key={step.id} className={`${styles.row} ${isDone ? styles.row_done : ''}`}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={isDone}
                      onChange={() => toggleChecked(step.id)}
                      aria-label={`Mark "${step.title}" complete`}
                    />
                    <span className={styles.stepMain}>
                      <span className={styles.stepTitle}>{step.title}</span>
                      <span className={styles.stepDetail}>{step.detail}</span>
                    </span>
                  </label>
                  {step.route && step.routeLabel && (
                    <button
                      type="button"
                      className={styles.openBtn}
                      onClick={() => openRoute(step)}
                      aria-label={`${step.routeLabel} for ${step.title}`}
                    >
                      {step.routeLabel} →
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          <p className={styles.boundaryNote}>{BOUNDARY_COPY.join(' ')}</p>
        </div>
      )}
    </section>
  )
}
