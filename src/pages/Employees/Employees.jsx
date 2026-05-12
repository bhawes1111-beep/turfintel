// Phase 4 — Employee Management workspace.
//
// Personnel source-of-truth for TurfIntel. Pay rate, hire date, and
// pesticide license are surfaced here and ONLY here — Operations Board
// and (future) Display Board renderers must omit pay_rate.
//
// Tabs:
//   Overview          stat row + recent hires
//   Active            grid of status=active employees + quick edit
//   Inactive          grid of status=inactive employees + Reactivate
//   Schedule          weekly schedule view (reuses CrewSchedule)
//   Crew Roles        distinct roles with member counts
//   Certifications    placeholder for future credential tracking

import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import WorkspaceActions from '../../components/shared/WorkspaceActions'
import EmployeesOverview     from './tabs/EmployeesOverview'
import EmployeeRoster        from './tabs/EmployeeRoster'
import EmployeeScheduleTab   from './tabs/EmployeeScheduleTab'
import CrewRoles             from './tabs/CrewRoles'
import Certifications        from './tabs/Certifications'
import EmployeeFormModal     from './components/EmployeeFormModal'
import workspace from '../../styles/workspace.module.css'

const TABS = [
  'Overview',
  'Active Employees',
  'Inactive Employees',
  'Schedule',
  'Crew Roles',
  'Certifications',
]

export default function Employees() {
  const [activeTab, setActiveTab] = useState('Overview')
  const [formOpen, setFormOpen]   = useState(false)
  const [editing,  setEditing]    = useState(null)

  function openNewHire() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(emp) {
    setEditing(emp)
    setFormOpen(true)
  }

  return (
    <>
      <PageShell
        title="Employee Management"
        description="Personnel roster, schedules, pay rates, and certifications."
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        actions={
          <WorkspaceActions>
            <button
              type="button"
              className={workspace.workspaceActionBtn}
              onClick={openNewHire}
            >
              + New Hire
            </button>
          </WorkspaceActions>
        }
      >
        {activeTab === 'Overview'           && <EmployeesOverview onAdd={openNewHire} onEdit={openEdit} />}
        {activeTab === 'Active Employees'   && <EmployeeRoster filter="active"   onEdit={openEdit} />}
        {activeTab === 'Inactive Employees' && <EmployeeRoster filter="inactive" onEdit={openEdit} />}
        {activeTab === 'Schedule'           && <EmployeeScheduleTab />}
        {activeTab === 'Crew Roles'         && <CrewRoles onEdit={openEdit} />}
        {activeTab === 'Certifications'     && <Certifications />}
      </PageShell>

      {formOpen && (
        <EmployeeFormModal
          employee={editing}
          onClose={() => setFormOpen(false)}
        />
      )}
    </>
  )
}
