import { useState } from 'react'
import PageShell from '../../components/layout/PageShell'

const TABS = ['Soil Reports', 'Tissue Reports', 'Water Reports', 'Nutrient Trends']

export default function PlantNutrition() {
  const [activeTab, setActiveTab] = useState('Soil Reports')

  return (
    <PageShell title="Plant Nutrition" tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab}>
      <p style={{ color: 'var(--color-text-muted)' }}>{activeTab} — coming soon</p>
    </PageShell>
  )
}
