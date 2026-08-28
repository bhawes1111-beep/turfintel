import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageShell from '../../components/layout/PageShell'
import SprayCalendarWorkspace from './tabs/SprayCalendarWorkspace'
import BuildSpraySheet        from './tabs/BuildSpraySheet'
import SprayRecords           from './tabs/SprayRecords'
import MixCalculator          from './tabs/MixCalculator'
import SprayReports           from './tabs/SprayReports'
import ProgramIntelligence    from './tabs/ProgramIntelligence'
import SprayProgramPlanner    from './tabs/SprayProgramPlanner'
import SprayTrainingBriefs    from './tabs/SprayTrainingBriefs'
import { createTrainingBrief } from '../../utils/sprays/trainingBriefsStore'
import { useToast } from '../../utils/feedback/toastContext'

// One clean Applications tab strip. Duplicate calendar/E.O.P labels from older
// layouts are routed to the closest working destination below.
const SPRAY_TABS = [
  'Calendar',
  'New Application',
  'Records',
  'Resistance',
  'E.O.P',
  'Training Briefs',
  'Calculator',
  'Reports',
]

const LEGACY_TAB_ALIASES = {
  'Workspace':               'Calendar',
  'Today':                   'Calendar',
  'Build Spray':             'New Application',
  'Spray Records':           'Records',
  'Spray Calendar':          'Records',
  'Records Calendar':        'Records',
  'Planned Sprays':          'E.O.P',
  'Planned Spray Calendar':  'E.O.P',
  'Planning Calendar':       'E.O.P',
  'Mix Calculator':          'Calculator',
  'Spray Intelligence':      'Resistance',
  'Season Insights':         'Resistance',
  'Overview':                'Calendar',
  'Planning':                'E.O.P',
  'EOP':                     'E.O.P',
  'E.O.P':                   'E.O.P',
  'Spray Training':          'Training Briefs',
  'Training Briefs':         'Training Briefs',
  'Calendar':                'Calendar',
  'Calculator':              'Calculator',
  'Reports':                 'Reports',
}

function resolveInitialTab(candidate) {
  if (!candidate) return 'Calendar'
  if (SPRAY_TABS.includes(candidate)) return candidate
  if (LEGACY_TAB_ALIASES[candidate]) return LEGACY_TAB_ALIASES[candidate]
  return 'Calendar'
}

export default function Spray() {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const [applicationContext, setApplicationContext] = useState(() => {
    const nutrientSampleId = location.state?.nutrientSampleId
    return nutrientSampleId
      ? { nutrientSampleId, area: location.state?.area ?? '' }
      : null
  })
  const [activeTab, setActiveTab] = useState(() => resolveInitialTab(location.state?.activeTab))
  const [trainingBriefId, setTrainingBriefId] = useState(location.state?.trainingBriefId ?? null)

  useEffect(() => {
    if (!location.state?.nutrientSampleId && !location.state?.activeTab) return
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [location.pathname, location.search, location.state, navigate])

  const handleInitialContextApplied = useCallback(() => {
    setApplicationContext(null)
  }, [])

  function goToNewApplication() {
    setActiveTab('New Application')
  }

  const startTrainingBrief = useCallback(async (source) => {
    try {
      const brief = await createTrainingBrief(source)
      setTrainingBriefId(brief.id)
      setActiveTab('Training Briefs')
      toast.success?.('Training brief draft created. Review it before approval.')
      return brief
    } catch (error) {
      toast.error?.(error.message || 'Could not create training brief')
      throw error
    }
  }, [toast])

  return (
    <PageShell
      title="Applications"
      description="Log liquid sprays and granular applications, review records, and watch resistance."
      tabs={SPRAY_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'Calendar' && (
        <SprayCalendarWorkspace onStartNewSpray={goToNewApplication} onCreateTrainingBrief={startTrainingBrief} />
      )}
      {activeTab === 'New Application' && (
        <BuildSpraySheet
          initialNutrientSampleId={applicationContext?.nutrientSampleId}
          initialArea={applicationContext?.area}
          onInitialContextApplied={handleInitialContextApplied}
          onCreateTrainingBrief={startTrainingBrief}
        />
      )}
      {activeTab === 'Records'         && <SprayRecords onCreateTrainingBrief={startTrainingBrief} />}
      {activeTab === 'Resistance'      && <ProgramIntelligence />}
      {activeTab === 'E.O.P'           && <SprayProgramPlanner onCreateTrainingBrief={startTrainingBrief} />}
      {activeTab === 'Training Briefs' && <SprayTrainingBriefs initialBriefId={trainingBriefId} onBriefSelected={setTrainingBriefId} />}
      {activeTab === 'Calculator'      && <MixCalculator />}
      {activeTab === 'Reports'         && <SprayReports />}
    </PageShell>
  )
}
