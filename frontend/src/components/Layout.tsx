import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="font-bold text-lg text-indigo-700">
            SettleUp
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">{user?.name || user?.email}</span>
            <button onClick={logout} className="text-slate-600 hover:text-slate-900">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
