import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { CourseProvider } from './context/CourseContext'
import { OperationsProvider } from './utils/operations/OperationsContext'
import ToastProvider from './components/feedback/ToastProvider'
import Layout from './components/layout/Layout'
import Login from './pages/Login/Login'
import Dashboard from './pages/Dashboard/Dashboard'
import OperationsBoard from './pages/Operations/OperationsBoard'
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
import Activity   from './pages/Activity/Activity'
import CourseMapPreview from './pages/CourseMapPreview/CourseMapPreview'

// New placeholder pages (production-safe shells with EmptyState messaging)
import NewSprays            from './pages/Spray/NewSprays'
import IrrigationParts      from './pages/Inventory/IrrigationParts'
import EquipmentParts       from './pages/Inventory/EquipmentParts'
import PeriodicMaintenance  from './pages/Equipment/PeriodicMaintenance'
import VinNumbers           from './pages/Equipment/VinNumbers'
import Depreciation         from './pages/Equipment/Depreciation'
import NewEquipmentNeeds    from './pages/Equipment/NewEquipmentNeeds'
import WeatherHistory       from './pages/Weather/WeatherHistory'
import RainTotals           from './pages/Weather/RainTotals'
import TemperatureAverages  from './pages/Weather/TemperatureAverages'

export default function App() {
  return (
    <OperationsProvider>
    <CourseProvider>
    <ToastProvider>
    <BrowserRouter>
      <Routes>
        {/* Login lives outside Layout — no sidebar rendered */}
        <Route path="/login" element={<Login />} />

        {/* All app routes share the sidebar Layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />

          {/* Daily Operations — reuses OperationsBoard (rule 5: don't duplicate) */}
          <Route path="operations" element={<OperationsBoard />} />

          {/* Sprays */}
          <Route path="spray/new" element={<NewSprays />} />
          <Route path="spray/*"   element={<Spray />} />
          <Route path="chemical/*" element={<Chemical />} />

          {/* Plant Health */}
          <Route path="disease/*"             element={<Disease />} />
          <Route path="plant-nutrition/*"     element={<PlantNutrition />} />
          <Route path="cultural-practices/*"  element={<CulturalPractices />} />

          {/* Inventory — specific sub-routes BEFORE wildcard */}
          <Route path="inventory/irrigation-parts" element={<IrrigationParts />} />
          <Route path="inventory/equipment-parts"  element={<EquipmentParts />} />
          <Route path="inventory/*"                element={<Inventory />} />

          {/* Equipment — specific sub-routes BEFORE wildcard */}
          <Route path="equipment/maintenance"           element={<PeriodicMaintenance />} />
          <Route path="equipment/vin-numbers"           element={<VinNumbers />} />
          <Route path="equipment/depreciation"          element={<Depreciation />} />
          <Route path="equipment/new-equipment-needs"   element={<NewEquipmentNeeds />} />
          <Route path="equipment/*"                     element={<Equipment />} />

          {/* Weather */}
          <Route path="weather/history"               element={<WeatherHistory />} />
          <Route path="weather/rain-totals"           element={<RainTotals />} />
          <Route path="weather/temperature-averages"  element={<TemperatureAverages />} />

          {/* Existing routes preserved (reachable via direct URL) */}
          <Route path="crew/*"      element={<OperationsBoard />} />
          <Route path="budget/*"    element={<Budget />} />
          <Route path="irrigation/*" element={<Irrigation />} />
          <Route path="settings/*"  element={<Settings />} />
          <Route path="activity/*"  element={<Activity />} />
          <Route path="course-map"  element={<CourseMapPreview />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ToastProvider>
    </CourseProvider>
    </OperationsProvider>
  )
}
