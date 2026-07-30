import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout from './layouts/AppLayout'
import Spinner from './components/Spinner'

import Login from './pages/Login'
import RegisterWorkspace from './pages/RegisterWorkspace'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Meetings from './pages/Meetings'
import MeetingDetail from './pages/MeetingDetail'
import Tracker from './pages/Tracker'
import Settings from './pages/Settings'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <Spinner large center />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function GuestRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <Spinner large center />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      {/* Guest routes */}
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterWorkspace /></GuestRoute>} />

      {/* Protected routes */}
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="meetings" element={<Meetings />} />
        <Route path="meetings/:meetingId" element={<MeetingDetail />} />
        <Route path="tracker" element={<Tracker />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/:tab" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
