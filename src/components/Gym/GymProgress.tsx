import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import type { WorkoutType } from '../../types'

/* ─── Types ───────────────────────────────────────────────────────── */

interface ProgressExercise {
  id: number
  name: string
  dataPoints: { date: string; fullDate: string; maxWeight: number; totalVolume: number }[]
  firstMaxWeight: number
  latestMaxWeight: number
  bestMaxWeight: number
  percentChange: number
}

interface Props {
  userId: string
  onBack: () => void
}

const STRENGTH_TYPES: WorkoutType[] = ['push', 'pull', 'legs']

const TYPE_COLORS: Record<string, string> = {
  push: '#f97316', pull: '#8b5cf6', legs: '#22c55e',
}

const TYPE_LABELS: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs',
}

/* ─── Component ───────────────────────────────────────────────────── */

export default function GymProgress({ userId, onBack }: Props) {
  const [type, setType] = useState<WorkoutType>('push')
  const [exercises, setExercises] = useState<ProgressExercise[]>([])
  const [volumeTrend, setVolumeTrend] = useState<{ date: string; fullDate: string; volume: number }[]>([])
  const [totalWorkouts, setTotalWorkouts] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProgress(type)
  }, [type])

  async function fetchProgress(wType: WorkoutType) {
    setLoading(true)

    // Fetch sessions with nested sets + exercise names in one query
    const { data: sessions, error: err } = await supabase
      .from('workout_sessions')
      .select(`
        id, completed_at,
        workout_sets (
          exercise_id, weight_kg, reps,
          exercises (id, name)
        )
      `)
      .eq('user_id', userId)
      .eq('workout_type', wType)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: true })

    if (err || !sessions || sessions.length === 0) {
      setExercises([])
      setVolumeTrend([])
      setTotalWorkouts(0)
      setLoading(false)
      return
    }

    setTotalWorkouts(sessions.length)

    // Build per-exercise data
    const exMap = new Map<number, {
      name: string
      sessions: Map<string, { maxWeight: number; volume: number }>
    }>()

    const volTrend: { date: string; fullDate: string; volume: number }[] = []

    for (const session of sessions) {
      const dateStr = format(parseISO(session.completed_at!), 'dd/MM')
      const fullDate = session.completed_at!
      let sessionVolume = 0

      for (const set of (session.workout_sets as any[]) ?? []) {
        const exId = set.exercise_id as number
        const weight = Number(set.weight_kg)
        const reps = set.reps as number
        const exName = (set.exercises as any)?.name ?? 'Unknown'

        if (!exMap.has(exId)) {
          exMap.set(exId, { name: exName, sessions: new Map() })
        }

        const exData = exMap.get(exId)!
        if (!exData.sessions.has(fullDate)) {
          exData.sessions.set(fullDate, { maxWeight: 0, volume: 0 })
        }
        const sData = exData.sessions.get(fullDate)!
        sData.maxWeight = Math.max(sData.maxWeight, weight)
        sData.volume += weight * reps
        sessionVolume += weight * reps
      }

      volTrend.push({ date: dateStr, fullDate, volume: Math.round(sessionVolume) })
    }

    setVolumeTrend(volTrend)

    // Convert exercise map to sorted array
    const progressExercises: ProgressExercise[] = Array.from(exMap.entries()).map(([id, data]) => {
      const dataPoints = Array.from(data.sessions.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([fd, stats]) => ({
          date: format(parseISO(fd), 'dd/MM'),
          fullDate: fd,
          maxWeight: stats.maxWeight,
          totalVolume: Math.round(stats.volume),
        }))

      const first = dataPoints[0]?.maxWeight ?? 0
      const latest = dataPoints[dataPoints.length - 1]?.maxWeight ?? 0
      const best = dataPoints.length > 0 ? Math.max(...dataPoints.map((d) => d.maxWeight)) : 0
      const pct = first > 0 ? ((latest - first) / first) * 100 : 0

      return { id, name: data.name, dataPoints, firstMaxWeight: first, latestMaxWeight: latest, bestMaxWeight: best, percentChange: pct }
    })

    setExercises(progressExercises)
    setLoading(false)
  }

  const color = TYPE_COLORS[type] ?? '#00D4C8'
  const totalVol = volumeTrend.reduce((s, d) => s + d.volume, 0)
  const avgVol = totalWorkouts > 0 ? Math.round(totalVol / totalWorkouts) : 0

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Back
      </button>

      <h1 className="mb-4 text-xl font-bold text-fg">Progress</h1>

      {/* Type tabs */}
      <div className="mb-6 flex gap-2">
        {STRENGTH_TYPES.map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              type === t ? 'text-bg' : 'border border-card-border text-secondary hover:text-fg'
            }`}
            style={type === t ? { backgroundColor: TYPE_COLORS[t] } : undefined}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
        </div>
      ) : exercises.length === 0 ? (
        <p className="py-16 text-center text-muted">Complete your first {TYPE_LABELS[type]} workout to see progress.</p>
      ) : (
        <>
          {/* Summary stats */}
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-card-border bg-card p-3 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Workouts</p>
              <p className="mt-1 text-lg font-bold text-fg">{totalWorkouts}</p>
            </div>
            <div className="rounded-xl border border-card-border bg-card p-3 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Total Vol</p>
              <p className="mt-1 text-lg font-bold text-teal">{totalVol.toLocaleString()} kg</p>
            </div>
            <div className="rounded-xl border border-card-border bg-card p-3 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Avg Vol</p>
              <p className="mt-1 text-lg font-bold text-fg">{avgVol.toLocaleString()} kg</p>
            </div>
          </div>

          {/* Volume trend chart */}
          {volumeTrend.length > 1 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-semibold text-fg">Volume per Session</h2>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={volumeTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--color-chart-axis)" tick={{ fontSize: 10, fill: 'var(--color-chart-tick)' }} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-chart-axis)" tick={{ fontSize: 10, fill: 'var(--color-chart-tick)' }} tickLine={false} axisLine={false} width={42}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div style={{ backgroundColor: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--color-fg)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                          <p className="font-semibold">{d.volume.toLocaleString()} kg</p>
                          <p style={{ color: 'var(--color-secondary)' }}>{format(parseISO(d.fullDate), 'dd/MM/yyyy')}</p>
                        </div>
                      )
                    }}
                  />
                  <Area type="monotone" dataKey="volume" stroke={color} strokeWidth={2} fill="url(#volGrad)" dot={{ fill: color, r: 2.5 }} activeDot={{ r: 4, fill: color }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-exercise progress */}
          <h2 className="mb-3 text-sm font-semibold text-fg">Per Exercise</h2>
          <div className="space-y-3">
            {exercises.map((ex, i) => {
              const pctColor = ex.percentChange >= 0 ? '#22c55e' : '#ef4444'
              const pctStr = ex.percentChange >= 0 ? `+${ex.percentChange.toFixed(1)}%` : `${ex.percentChange.toFixed(1)}%`
              const hasMultiple = ex.dataPoints.length > 1

              return (
                <motion.div key={ex.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                  className="rounded-xl border border-card-border bg-card p-4">
                  {/* Header */}
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-fg">{ex.name}</span>
                    {hasMultiple && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: pctColor + '18', color: pctColor }}>
                        {pctStr}
                      </span>
                    )}
                  </div>

                  {/* Sparkline chart */}
                  {hasMultiple && (
                    <div className="mb-3">
                      <ResponsiveContainer width="100%" height={70}>
                        <AreaChart data={ex.dataPoints} margin={{ top: 2, right: 4, left: 4, bottom: 2 }}>
                          <defs>
                            <linearGradient id={`exGrad-${ex.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                              <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" hide />
                          <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null
                              const d = payload[0].payload
                              return (
                                <div style={{ backgroundColor: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: 'var(--color-fg)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                                  <p className="font-semibold">{d.maxWeight} kg</p>
                                  <p style={{ color: 'var(--color-secondary)' }}>{d.date}</p>
                                </div>
                              )
                            }}
                          />
                          <Area type="monotone" dataKey="maxWeight" stroke={color} strokeWidth={2} fill={`url(#exGrad-${ex.id})`} dot={{ fill: color, r: 2 }} activeDot={{ r: 3.5, fill: color }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-1 text-xs text-secondary">
                    <span className="font-medium text-fg">{ex.firstMaxWeight}kg</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-dim">
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>
                    <span className="font-medium text-fg">{ex.latestMaxWeight}kg</span>
                    <span className="mx-1 text-dim">|</span>
                    <span>Best: <span className="font-semibold text-teal">{ex.bestMaxWeight}kg</span></span>
                    <span className="mx-1 text-dim">|</span>
                    <span>{ex.dataPoints.length} sessions</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
