import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      toast.error('Invalid email or password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-2xl text-xl font-bold shadow-lg shadow-primary/25">
            ₹
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Split the rent. Keep the friends.
            </p>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 rounded-xl"
              />
            </div>
            <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl text-[15px]">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          New here?{' '}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
