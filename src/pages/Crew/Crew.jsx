import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import CrewTasks     from './tabs/CrewTasks'
import CrewHours     from './tabs/CrewHours'
import CrewSchedule  from './tabs/CrewSchedule'
import CrewEmployees from './tabs/CrewEmployees'
import CrewNotes     from './tabs/CrewNotes'

const TABS = ['Tasks', 'Hours', 'Schedule', 'Employees', 'Notes']

// Placeholder crew roster — swap this array for an API call when backend is ready.
// status: 'available' | 'later' | 'off'
// time: required when status === 'later'
const CREW = [
  { id: 1, name: 'Carlos M.',  role: 'Equipment Operator', status: 'available' },
  { id: 2, name: 'Juan R.',    role: 'Grounds Crew',        status: 'later',    time: '10:00 AM' },
  { id: 3, name: 'Miguel S.',  role: 'Spray Tech',          status: 'available' },
  { id: 4, name: 'Derek L.',   role: 'Crew Lead',           status: 'off' },
  { id: 5, name: 'James T.',   role: 'Grounds Crew',        status: 'available' },
]

export default function Crew() {
  const [activeTab, setActiveTab] = useState('Tasks')

  return (
    <PageShell title="Crew" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'Tasks'     && <CrewTasks     crew={CREW} />}
      {activeTab === 'Hours'     && <CrewHours     crew={CREW} />}
      {activeTab === 'Schedule'  && <CrewSchedule  crew={CREW} />}
      {activeTab === 'Employees' && <CrewEmployees crew={CREW} />}
      {activeTab === 'Notes'     && <CrewNotes />}
    </PageShell>
  )
}
