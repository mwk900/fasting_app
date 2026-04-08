import { useState } from 'react'
import { useAuth } from '../../lib/auth'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [signupDone, setSignupDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (mode === 'login') {
      const err = await signIn(email, password)
      if (err) setError(err)
    } else {
      const err = await signUp(email, password)
      if (err) {
        setError(err)
      } else {
        setSignupDone(true)
      }
    }
    setLoading(false)
  }

  if (signupDone) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-sm rounded-xl border border-card-border bg-card p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal/10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00D4C8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-bold text-fg">Confirm your email</h2>
          <p className="text-sm text-secondary">
            We sent a confirmation email to:
          </p>
          <p className="mt-1 text-sm font-semibold text-fg">{email}</p>
          <div className="mt-4 rounded-lg bg-bg p-3 text-left text-xs text-secondary space-y-1.5">
            <p>1. Open your email inbox</p>
            <p>2. Find the email from <span className="text-fg">Supabase</span> (check spam if needed)</p>
            <p>3. Click the <span className="text-fg">confirmation link</span> in the email</p>
            <p>4. Come back here and sign in</p>
          </div>
          <button
            onClick={() => { setSignupDone(false); setMode('login') }}
            className="mt-5 w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            I've confirmed — sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-bold text-fg">Fasting Tracker</h1>
        <p className="mb-8 text-center text-sm text-secondary">
          {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
        </p>

        {error && (
          <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-card-border bg-card p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg outline-none focus:border-teal focus:ring-1 focus:ring-teal"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg outline-none focus:border-teal focus:ring-1 focus:ring-teal"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (mode === 'login' ? 'Signing in...' : 'Creating account...') : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-secondary">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
            className="font-semibold text-teal hover:underline"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
