import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api, tokens } from '../api/client'
import type { User } from '../types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore the session on reload if a token is present.
    if (!tokens.access) {
      setLoading(false)
      return
    }
    api<User>('/api/auth/me/')
      .then(setUser)
      .catch(() => tokens.clear())
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const t = await api<{ access: string; refresh: string }>('/api/auth/login/', {
      method: 'POST',
      body: { email, password },
    })
    tokens.set(t)
    setUser(await api<User>('/api/auth/me/'))
  }

  async function register(email: string, name: string, password: string) {
    await api('/api/auth/register/', { method: 'POST', body: { email, name, password } })
    await login(email, password)
  }

  function logout() {
    tokens.clear()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
