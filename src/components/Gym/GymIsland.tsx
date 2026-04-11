import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGymSession } from '../../lib/gymSession'
import type { WorkoutType } from '../../types'

const LABELS: Record<WorkoutType, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  cardio: 'Cardio',
}

const COLORS: Record<WorkoutType, string> = {
  push: '#f97316',
  pull: '#8b5cf6',
  legs: '#22c55e',
  cardio: '#06b6d4',
}

export default function GymIsland({ onOpen, hidden }: { onOpen: () => void; hidden?: boolean }) {
  const { activeSession } = useGymSession()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!activeSession) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeSession])

  const visible = !!activeSession && !hidden

  let timeStr = '0:00'
  let label = ''
  let color = '#f97316'
  if (activeSession) {
    const start = new Date(activeSession.startedAt).getTime()
    const secs = Math.max(0, Math.floor((now - start) / 1000))
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    timeStr = h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`
    label = LABELS[activeSession.workoutType] ?? 'Workout'
    color = COLORS[activeSession.workoutType] ?? '#f97316'
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
    >
      <div className="mx-auto flex w-full max-w-lg justify-center">
        <AnimatePresence>
          {visible && (
            <motion.button
              onClick={onOpen}
              initial={{ opacity: 0, y: -16, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-card-border bg-card-border px-4 py-2 shadow-lg backdrop-blur-md transition-opacity hover:opacity-90"
              aria-label="Resume workout"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ backgroundColor: color }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
                {label}
              </span>
              <span className="font-mono text-xs font-bold tabular-nums text-fg">{timeStr}</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
