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

const TABS = ['Overview', 'Applications', 'Soil Reports', 'Tissue Reports', 'Water Reports', 'Nutrient Trends', 'Recommendations', 'Upload Center']

export default function PlantNutrition() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <PageShell title="Plant Nutrition" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'Overview'        && <PlantNutritionOverview />}
      {activeTab === 'Applications'    && <NutritionApplications />}
      {activeTab === 'Soil Reports'    && <SoilReports />}
      {activeTab === 'Tissue Reports'  && <TissueReports />}
      {activeTab === 'Water Reports'   && <WaterReports />}
      {activeTab === 'Nutrient Trends' && <NutrientTrends />}
      {activeTab === 'Recommendations' && <Recommendations />}
      {activeTab === 'Upload Center'   && <UploadCenter />}
    </PageShell>
  )
}
