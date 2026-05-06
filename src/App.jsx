import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard/Dashboard'
import Crew from './pages/Crew/Crew'
import Chemical from './pages/Chemical/Chemical'
import Budget from './pages/Budget/Budget'
import Inventory from './pages/Inventory/Inventory'
import Equipment from './pages/Equipment/Equipment'
import Settings from './pages/Settings/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="crew/*" element={<Crew />} />
          <Route path="chemical/*" element={<Chemical />} />
          <Route path="budget/*" element={<Budget />} />
          <Route path="inventory/*" element={<Inventory />} />
          <Route path="equipment/*" element={<Equipment />} />
          <Route path="settings/*" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
