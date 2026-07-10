import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './auth/AuthContext'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import GroupSwitcherPage from './pages/GroupSwitcherPage'
import GroupShell from './layouts/GroupShell'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="border-primary size-6 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <GroupSwitcherPage />
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/*"
        element={
          <RequireAuth>
            <GroupShell />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
