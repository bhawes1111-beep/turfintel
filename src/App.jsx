import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { CourseProvider } from './context/CourseContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login/Login'
import Dashboard from './pages/Dashboard/Dashboard'
import Crew from './pages/Crew/Crew'
import Chemical from './pages/Chemical/Chemical'
import Spray from './pages/Spray/Spray'
import Disease from './pages/Disease/Disease'
import PlantNutrition from './pages/PlantNutrition/PlantNutrition'
import CulturalPractices from './pages/CulturalPractices/CulturalPractices'
import Budget from './pages/Budget/Budget'
import Inventory from './pages/Inventory/Inventory'
import Equipment  from './pages/Equipment/Equipment'
import Irrigation from './pages/Irrigation/Irrigation'
import Settings   from './pages/Settings/Settings'

export default function App() {
  return (
    <CourseProvider>
    <BrowserRouter>
      <Routes>
        {/* Login lives outside Layout — no sidebar rendered */}
        <Route path="/login" element={<Login />} />

        {/* All app routes share the sidebar Layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="crew/*" element={<Crew />} />
          <Route path="chemical/*" element={<Chemical />} />
          <Route path="spray/*" element={<Spray />} />
          <Route path="disease/*" element={<Disease />} />
          <Route path="plant-nutrition/*" element={<PlantNutrition />} />
          <Route path="cultural-practices/*" element={<CulturalPractices />} />
          <Route path="budget/*" element={<Budget />} />
          <Route path="inventory/*" element={<Inventory />} />
          <Route path="equipment/*"  element={<Equipment />} />
          <Route path="irrigation/*" element={<Irrigation />} />
          <Route path="settings/*"   element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </CourseProvider>
  )
}
