import { createContext, useContext, useState, type ReactNode } from 'react'
import type { WorkoutType } from '../types'

export interface ActiveGymSession {
  sessionId: number
  workoutType: WorkoutType
  startedAt: string
}

interface GymSessionContextValue {
  activeSession: ActiveGymSession | null
  setActiveSession: (s: ActiveGymSession | null) => void
}

const GymSessionContext = createContext<GymSessionContextValue | null>(null)

const STORAGE_KEY = 'gym-active-session-v1'

export function GymSessionProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSessionState] = useState<ActiveGymSession | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as ActiveGymSession) : null
    } catch {
      return null
    }
  })

  function setActiveSession(s: ActiveGymSession | null) {
    setActiveSessionState(s)
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    else localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <GymSessionContext.Provider value={{ activeSession, setActiveSession }}>
      {children}
    </GymSessionContext.Provider>
  )
}

export function useGymSession() {
  const ctx = useContext(GymSessionContext)
  if (!ctx) throw new Error('useGymSession must be used within GymSessionProvider')
  return ctx
}
