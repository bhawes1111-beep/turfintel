import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import PlantNutritionOverview from './tabs/PlantNutritionOverview'
import NutritionApplications  from './tabs/NutritionApplications'
import SoilReports            from './tabs/SoilReports'
import TissueReports          from './tabs/TissueReports'
import WaterReports           from './tabs/WaterReports'
import NutrientTrends         from './tabs/NutrientTrends'
import Recommendations        from './tabs/Recommendations'
import UploadCenter           from './tabs/UploadCenter'
import styles                 from './PlantNutrition.module.css'

const TABS = ['Overview', 'Log Nutrients', 'Lab Reports', 'Trends', 'Recommendations']

function LabReportsHub() {
  return (
    <div className={styles.labReportsHub}>
      <SoilReports />
      <TissueReports />
      <WaterReports />
      <UploadCenter />
    </div>
  )
}

export default function PlantNutrition() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <PageShell title="Plant Nutrition" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'Overview'        && <PlantNutritionOverview />}
      {activeTab === 'Log Nutrients'   && <NutritionApplications />}
      {activeTab === 'Lab Reports'     && <LabReportsHub />}
      {activeTab === 'Trends'          && <NutrientTrends />}
      {activeTab === 'Recommendations' && <Recommendations />}
    </PageShell>
  )
}
