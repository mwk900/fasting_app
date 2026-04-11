import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './lib/auth'
import LoginPage from './components/Auth/LoginPage'
import TabBar from './components/TabBar'
import TimerTab from './components/Timer/TimerTab'
import HistoryTab from './components/History/HistoryTab'
import WeightTab from './components/Weight/WeightTab'
import MeasurementsTab from './components/Measurements/MeasurementsTab'
import GymTab from './components/Gym/GymTab'
import GymIsland from './components/Gym/GymIsland'
import { GymSessionProvider } from './lib/gymSession'

export type Tab = 'timer' | 'history' | 'gym' | 'weight' | 'measurements'
export type Theme = 'dark' | 'light'

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('gym')
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'dark'
  })

  // Detect email confirmation redirect (Supabase appends #...&type=signup)
  const [emailConfirmed, setEmailConfirmed] = useState(() => {
    const hash = window.location.hash
    if (hash.includes('type=signup')) {
      window.history.replaceState(null, '', window.location.pathname)
      return true
    }
    return false
  })

  useEffect(() => {
    if (emailConfirmed) signOut()
  }, [emailConfirmed])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  if (emailConfirmed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-sm rounded-xl border border-card-border bg-card p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-bold text-fg">Email Verified</h2>
          <p className="text-sm text-secondary">
            Your email address has been verified successfully. You can now sign in using your credentials.
          </p>
          <button
            onClick={() => setEmailConfirmed(false)}
            className="mt-5 w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  const tabs: Record<Tab, React.ReactNode> = {
    timer: <TimerTab />,
    history: <HistoryTab />,
    gym: <GymTab />,
    weight: <WeightTab />,
    measurements: <MeasurementsTab />,
  }

  return (
    <GymSessionProvider>
    <div className="min-h-screen bg-bg font-sans transition-colors duration-300">
      <GymIsland onOpen={() => setActiveTab('gym')} />
      <div
        className="fixed right-4 z-30 flex items-center gap-2"
        style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <button
          onClick={toggleTheme}
          className="rounded-full bg-card p-2.5 text-muted shadow-lg border border-card-border transition-colors hover:text-fg"
          aria-label="Toggle theme"
        >
        {theme === 'dark' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
      </div>

      {activeTab === 'timer' && (
        <div
          className="fixed inset-x-0 z-30 flex justify-center px-4"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
        >
          <button
            onClick={signOut}
            className="rounded-full bg-card px-4 py-2 text-xs font-medium text-muted shadow-lg border border-card-border transition-colors hover:text-fg"
          >
            Sign out
          </button>
        </div>
      )}

      <main
        className="mx-auto max-w-lg px-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 3.75rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 7rem)',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {tabs[activeTab]}
          </motion.div>
        </AnimatePresence>
      </main>
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
    </GymSessionProvider>
  )
}
