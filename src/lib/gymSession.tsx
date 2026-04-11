import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { WorkoutCategory, WorkoutType } from '../types'
import { useAuth } from './auth'
import { loadCategories } from './workoutCategories'

export interface ActiveGymSession {
  sessionId: number
  workoutType: WorkoutType
  startedAt: string
}

interface GymSessionContextValue {
  activeSession: ActiveGymSession | null
  setActiveSession: (s: ActiveGymSession | null) => void
  categories: WorkoutCategory[]
  categoriesLoading: boolean
  refreshCategories: () => Promise<void>
  setCategories: (cats: WorkoutCategory[]) => void
}

const GymSessionContext = createContext<GymSessionContextValue | null>(null)

const STORAGE_KEY = 'gym-active-session-v1'

export function GymSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [activeSession, setActiveSessionState] = useState<ActiveGymSession | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as ActiveGymSession) : null
    } catch {
      return null
    }
  })
  const [categories, setCategories] = useState<WorkoutCategory[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)

  const refreshCategories = useCallback(async () => {
    if (!user) {
      setCategories([])
      setCategoriesLoading(false)
      return
    }
    setCategoriesLoading(true)
    try {
      const cats = await loadCategories(user.id)
      setCategories(cats)
    } catch (e) {
      console.error('Failed to load workout categories', e)
    } finally {
      setCategoriesLoading(false)
    }
  }, [user])

  useEffect(() => {
    refreshCategories()
  }, [refreshCategories])

  function setActiveSession(s: ActiveGymSession | null) {
    setActiveSessionState(s)
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    else localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <GymSessionContext.Provider
      value={{
        activeSession,
        setActiveSession,
        categories,
        categoriesLoading,
        refreshCategories,
        setCategories,
      }}
    >
      {children}
    </GymSessionContext.Provider>
  )
}

export function useGymSession() {
  const ctx = useContext(GymSessionContext)
  if (!ctx) throw new Error('useGymSession must be used within GymSessionProvider')
  return ctx
}
