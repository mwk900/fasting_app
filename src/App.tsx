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

export type Tab = 'timer' | 'history' | 'gym' | 'weight' | 'measurements'
export type Theme = 'dark' | 'light'

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('timer')
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

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
    <div className="min-h-screen bg-bg font-sans transition-colors duration-300">
      <div className="fixed right-4 top-4 z-30 flex items-center gap-2">
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
        <button
          onClick={signOut}
          className="rounded-full bg-card px-3 py-2 text-xs font-medium text-muted shadow-lg border border-card-border transition-colors hover:text-fg"
        >
          Sign out
        </button>
      </div>

      <main className="mx-auto max-w-lg px-4 pb-28 pt-6">
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
  )
}
