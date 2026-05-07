import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'
import ActiveIssues from './tabs/ActiveIssues'
import DiseaseLibrary from './tabs/DiseaseLibrary'
import CourseMap from './tabs/CourseMap'
import PhotoGallery from './tabs/PhotoGallery'
import DiseaseAlerts from './tabs/DiseaseAlerts'
import DiseaseReports from './tabs/DiseaseReports'

const TABS = ['Active Issues', 'Disease Library', 'Course Map', 'Photo Gallery', 'Alerts', 'Reports']

export default function Disease() {
  const [activeTab, setActiveTab] = useState('Active Issues')

  return (
    <PageShell title="Disease" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'Active Issues'   && <ActiveIssues />}
      {activeTab === 'Disease Library' && <DiseaseLibrary />}
      {activeTab === 'Course Map'      && <CourseMap />}
      {activeTab === 'Photo Gallery'   && <PhotoGallery />}
      {activeTab === 'Alerts'          && <DiseaseAlerts />}
      {activeTab === 'Reports'         && <DiseaseReports />}
    </PageShell>
  )
}
