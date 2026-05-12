import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { CourseProvider } from './context/CourseContext'
import ToastProvider from './components/feedback/ToastProvider'
import Layout from './components/layout/Layout'
import Login from './pages/Login/Login'
import Dashboard from './pages/Dashboard/Dashboard'
import OperationsBoard from './pages/Operations/OperationsBoard'
import Employees from './pages/Employees/Employees'
import DisplayBoard from './pages/DisplayBoard/DisplayBoard'
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
import Weather from './pages/Weather/Weather'
import Reports from './pages/Reports/Reports'

export default function App() {
  return (
    <CourseProvider>
    <ToastProvider>
    <BrowserRouter>
      <Routes>
        {/* Login lives outside Layout — no sidebar rendered */}
        <Route path="/login" element={<Login />} />

        {/* Full-screen Display Board mode — outside Layout so the
            sidebar + top bar are hidden for TV / tablet display. */}
        <Route path="/display-board/board" element={<DisplayBoard boardMode />} />

        {/* All app routes share the sidebar Layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="crew/*" element={<OperationsBoard />} />
          <Route path="employees/*" element={<Employees />} />
          <Route path="display-board" element={<DisplayBoard />} />
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
          <Route path="activity/*"  element={<Activity />} />
          <Route path="course-map"  element={<CourseMapPreview />} />
          <Route path="weather"     element={<Weather />} />
          <Route path="reports"     element={<Reports />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ToastProvider>
    </CourseProvider>
  )
}
