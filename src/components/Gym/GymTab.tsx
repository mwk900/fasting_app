import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Exercise, WorkoutSession, WorkoutType } from '../../types'

/* ─── Local types ─────────────────────────────────────────────────── */

interface LocalSet {
  exercise_id: number
  set_number: number
  weight_kg: number
  reps: number
}

type Screen = 'select' | 'manage' | 'workout' | 'complete'

/* ─── Constants ───────────────────────────────────────────────────── */

const WORKOUT_META: Record<WorkoutType, { label: string; desc: string; color: string }> = {
  push: { label: 'Push', desc: 'Chest, shoulders, triceps', color: '#f97316' },
  pull: { label: 'Pull', desc: 'Back, biceps, rear delts', color: '#8b5cf6' },
  legs: { label: 'Legs', desc: 'Quads, hamstrings, glutes, calves', color: '#22c55e' },
}

const TYPES: WorkoutType[] = ['push', 'pull', 'legs']

/* ─── Component ───────────────────────────────────────────────────── */

export default function GymTab() {
  const { user } = useAuth()

  /* Navigation */
  const [screen, setScreen] = useState<Screen>('select')
  const [selectedType, setSelectedType] = useState<WorkoutType>('push')

  /* Data */
  const [exercises, setExercises] = useState<Record<WorkoutType, Exercise[]>>({
    push: [], pull: [], legs: [],
  })
  const [lastSessions, setLastSessions] = useState<Record<WorkoutType, WorkoutSession | null>>({
    push: null, pull: null, legs: null,
  })
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* Exercise management */
  const [newExName, setNewExName] = useState('')
  const [savingEx, setSavingEx] = useState(false)
  const [deletingExId, setDeletingExId] = useState<number | null>(null)

  /* Active workout */
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [exIndex, setExIndex] = useState(0)
  const [sessionSets, setSessionSets] = useState<Record<number, LocalSet[]>>({})
  const [prevSets, setPrevSets] = useState<Record<number, LocalSet[]>>({})
  const [workoutStart, setWorkoutStart] = useState<Date | null>(null)
  const [animDir, setAnimDir] = useState<'next' | 'prev'>('next')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [saving, setSaving] = useState(false)

  /* ─── Data fetching ────────────────────────────────────────────── */

  useEffect(() => {
    if (user) {
      fetchExercises()
      fetchLastSessions()
      fetchRecentWorkouts()
    }
  }, [user])

  async function fetchExercises() {
    const { data, error: err } = await supabase
      .from('exercises')
      .select('*')
      .eq('user_id', user!.id)
      .order('sort_order', { ascending: true })

    if (err) { setError('Failed to load exercises'); setLoading(false); return }

    const grouped: Record<WorkoutType, Exercise[]> = { push: [], pull: [], legs: [] }
    for (const ex of data ?? []) {
      grouped[ex.workout_type as WorkoutType]?.push(ex)
    }
    setExercises(grouped)
    setLoading(false)
  }

  async function fetchLastSessions() {
    const result: Record<WorkoutType, WorkoutSession | null> = { push: null, pull: null, legs: null }

    const promises = TYPES.map(async (type) => {
      const { data } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('user_id', user!.id)
        .eq('workout_type', type)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .single()
      result[type] = data
    })
    await Promise.all(promises)
    setLastSessions(result)
  }

  async function fetchRecentWorkouts() {
    const { data } = await supabase
      .from('workout_sessions')
      .select('*')
      .eq('user_id', user!.id)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(8)

    setRecentWorkouts(data ?? [])
  }

  /* ─── Exercise management ──────────────────────────────────────── */

  async function addExercise(e: React.FormEvent) {
    e.preventDefault()
    if (!newExName.trim()) return
    setSavingEx(true)
    setError(null)

    const list = exercises[selectedType]
    const maxOrder = list.length > 0 ? Math.max(...list.map((x) => x.sort_order)) + 1 : 0

    const { error: err } = await supabase.from('exercises').insert({
      user_id: user!.id,
      name: newExName.trim(),
      workout_type: selectedType,
      sort_order: maxOrder,
    })

    if (err) { setError('Failed to add exercise'); setSavingEx(false); return }
    setNewExName('')
    setSavingEx(false)
    fetchExercises()
  }

  async function deleteExercise(id: number) {
    setError(null)
    const { error: err } = await supabase.from('exercises').delete().eq('id', id)
    if (err) { setError('Failed to delete exercise'); return }
    setDeletingExId(null)
    fetchExercises()
  }

  async function moveExercise(id: number, direction: 'up' | 'down') {
    const list = [...exercises[selectedType]]
    const idx = list.findIndex((x) => x.id === id)
    if (idx < 0) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= list.length) return

    const orderA = list[idx].sort_order
    const orderB = list[swapIdx].sort_order

    await Promise.all([
      supabase.from('exercises').update({ sort_order: orderB }).eq('id', list[idx].id),
      supabase.from('exercises').update({ sort_order: orderA }).eq('id', list[swapIdx].id),
    ])
    fetchExercises()
  }

  /* ─── Workout flow ─────────────────────────────────────────────── */

  async function startWorkout(type: WorkoutType) {
    const exList = exercises[type]
    if (exList.length === 0) {
      setSelectedType(type)
      setScreen('manage')
      return
    }

    setSelectedType(type)
    setError(null)

    // Create session
    const { data: session, error: err } = await supabase
      .from('workout_sessions')
      .insert({ user_id: user!.id, workout_type: type })
      .select()
      .single()

    if (err || !session) { setError('Failed to start workout'); return }
    setSessionId(session.id)
    setExIndex(0)
    setAnimDir('next')
    setConfirmCancel(false)
    setWorkoutStart(new Date())

    // Fetch previous session sets for progressive overload
    const { data: prevSession } = await supabase
      .from('workout_sessions')
      .select('id')
      .eq('user_id', user!.id)
      .eq('workout_type', type)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .single()

    let prevGrouped: Record<number, LocalSet[]> = {}

    if (prevSession) {
      const { data: sets } = await supabase
        .from('workout_sets')
        .select('*')
        .eq('session_id', prevSession.id)
        .order('set_number', { ascending: true })

      for (const s of sets ?? []) {
        if (!prevGrouped[s.exercise_id]) prevGrouped[s.exercise_id] = []
        prevGrouped[s.exercise_id].push({
          exercise_id: s.exercise_id,
          set_number: s.set_number,
          weight_kg: Number(s.weight_kg),
          reps: s.reps,
        })
      }
    }
    setPrevSets(prevGrouped)

    // Pre-populate sets from previous workout or default empty
    const initial: Record<number, LocalSet[]> = {}
    for (const ex of exList) {
      const prev = prevGrouped[ex.id]
      if (prev && prev.length > 0) {
        initial[ex.id] = prev.map((s) => ({
          exercise_id: ex.id,
          set_number: s.set_number,
          weight_kg: s.weight_kg,
          reps: s.reps,
        }))
      } else {
        initial[ex.id] = [{ exercise_id: ex.id, set_number: 1, weight_kg: 0, reps: 0 }]
      }
    }
    setSessionSets(initial)
    setScreen('workout')
  }

  function currentExercise(): Exercise | null {
    return exercises[selectedType][exIndex] ?? null
  }

  function currentSets(): LocalSet[] {
    const ex = currentExercise()
    return ex ? sessionSets[ex.id] ?? [] : []
  }

  function updateSet(setIdx: number, field: 'weight_kg' | 'reps', value: number) {
    const ex = currentExercise()
    if (!ex) return
    const sets = [...(sessionSets[ex.id] ?? [])]
    sets[setIdx] = { ...sets[setIdx], [field]: value }
    setSessionSets((prev) => ({ ...prev, [ex.id]: sets }))
  }

  function addSet() {
    const ex = currentExercise()
    if (!ex) return
    const sets = sessionSets[ex.id] ?? []
    const last = sets[sets.length - 1]
    setSessionSets((prev) => ({
      ...prev,
      [ex.id]: [
        ...sets,
        {
          exercise_id: ex.id,
          set_number: sets.length + 1,
          weight_kg: last?.weight_kg ?? 0,
          reps: last?.reps ?? 0,
        },
      ],
    }))
  }

  function removeSet(setIdx: number) {
    const ex = currentExercise()
    if (!ex) return
    const sets = sessionSets[ex.id] ?? []
    if (sets.length <= 1) return
    const updated = sets.filter((_, i) => i !== setIdx).map((s, i) => ({ ...s, set_number: i + 1 }))
    setSessionSets((prev) => ({ ...prev, [ex.id]: updated }))
  }

  async function saveAndAdvance() {
    const ex = currentExercise()
    if (!ex || !sessionId) return
    setSaving(true)

    const sets = sessionSets[ex.id] ?? []
    const valid = sets.filter((s) => s.weight_kg > 0 || s.reps > 0)

    if (valid.length > 0) {
      // Upsert: delete old, insert new (handles going back and re-doing)
      await supabase
        .from('workout_sets')
        .delete()
        .eq('session_id', sessionId)
        .eq('exercise_id', ex.id)

      await supabase.from('workout_sets').insert(
        valid.map((s) => ({
          user_id: user!.id,
          session_id: sessionId,
          exercise_id: ex.id,
          set_number: s.set_number,
          weight_kg: s.weight_kg,
          reps: s.reps,
        }))
      )
    }

    const exList = exercises[selectedType]
    if (exIndex < exList.length - 1) {
      setAnimDir('next')
      setExIndex((i) => i + 1)
    } else {
      // Complete workout
      await supabase
        .from('workout_sessions')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', sessionId)

      setScreen('complete')
      fetchLastSessions()
      fetchRecentWorkouts()
    }
    setSaving(false)
  }

  function goBack() {
    if (exIndex > 0) {
      setAnimDir('prev')
      setExIndex((i) => i - 1)
    }
  }

  async function cancelWorkout() {
    if (sessionId) {
      await supabase.from('workout_sets').delete().eq('session_id', sessionId)
      await supabase.from('workout_sessions').delete().eq('id', sessionId)
    }
    resetWorkout()
  }

  function resetWorkout() {
    setSessionId(null)
    setExIndex(0)
    setSessionSets({})
    setPrevSets({})
    setWorkoutStart(null)
    setConfirmCancel(false)
    setScreen('select')
  }

  /* ─── Helpers ──────────────────────────────────────────────────── */

  function formatPrevSets(exerciseId: number): string {
    const sets = prevSets[exerciseId]
    if (!sets || sets.length === 0) return ''
    return sets.map((s) => `${s.weight_kg}kg x ${s.reps}`).join('  /  ')
  }

  function calcVolume(sets: Record<number, LocalSet[]>): number {
    return Object.values(sets)
      .flat()
      .reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
  }

  function calcPrevVolume(exerciseId: number): number {
    return (prevSets[exerciseId] ?? []).reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
  }

  function calcExVolume(exerciseId: number): number {
    return (sessionSets[exerciseId] ?? []).reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
  }

  function durationStr(): string {
    if (!workoutStart) return '0m'
    const mins = Math.round((Date.now() - workoutStart.getTime()) / 60000)
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
    return `${mins}m`
  }

  /* ─── Loading ──────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════════
     SELECTION SCREEN
     ═══════════════════════════════════════════════════════════════════ */

  if (screen === 'select') {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-fg">Gym</h1>

        {error && (
          <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</p>
        )}

        <div className="space-y-3">
          {TYPES.map((type) => {
            const meta = WORKOUT_META[type]
            const exList = exercises[type]
            const last = lastSessions[type]

            return (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: TYPES.indexOf(type) * 0.08, duration: 0.25 }}
                className="rounded-xl border bg-card p-4"
                style={{ borderColor: 'var(--color-card-border)', borderLeftWidth: '3px', borderLeftColor: meta.color }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-fg">{meta.label}</h3>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: meta.color + '18', color: meta.color }}
                  >
                    {exList.length} exercise{exList.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="mb-1 text-sm text-muted">{meta.desc}</p>
                {last?.completed_at && (
                  <p className="mb-3 text-xs text-dim">
                    Last: {formatDistanceToNow(parseISO(last.completed_at), { addSuffix: true })}
                  </p>
                )}
                {!last && <div className="mb-3" />}

                <div className="flex gap-2">
                  <button
                    onClick={() => startWorkout(type)}
                    className="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ backgroundColor: meta.color + '18', color: meta.color }}
                  >
                    {exList.length > 0 ? 'Start Workout' : 'Add Exercises'}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedType(type)
                      setDeletingExId(null)
                      setNewExName('')
                      setScreen('manage')
                    }}
                    className="rounded-lg border border-card-border px-4 py-2.5 text-sm text-muted transition-colors hover:text-fg"
                  >
                    Edit
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Recent Workouts */}
        {recentWorkouts.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-fg">Recent Workouts</h2>
            <div className="space-y-2">
              {recentWorkouts.map((session) => {
                const meta = WORKOUT_META[session.workout_type as WorkoutType]
                return (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-xl border border-card-border bg-card px-4 py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: meta.color + '18', color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <span className="text-sm text-secondary">
                        {format(parseISO(session.completed_at!), 'dd/MM/yyyy')}
                      </span>
                    </div>
                    <span className="text-xs text-dim">
                      {formatDistanceToNow(parseISO(session.completed_at!), { addSuffix: true })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════════
     MANAGE EXERCISES SCREEN
     ═══════════════════════════════════════════════════════════════════ */

  if (screen === 'manage') {
    const meta = WORKOUT_META[selectedType]
    const exList = exercises[selectedType]

    return (
      <div>
        <button
          onClick={() => { setScreen('select'); setError(null) }}
          className="mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>

        <h1 className="mb-1 text-xl font-bold text-fg">{meta.label} Exercises</h1>
        <p className="mb-5 text-sm text-muted">
          Add and reorder your exercises. The workout follows this order.
        </p>

        {error && (
          <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</p>
        )}

        <form onSubmit={addExercise} className="mb-6 flex gap-2">
          <input
            type="text"
            value={newExName}
            onChange={(e) => setNewExName(e.target.value)}
            placeholder="Exercise name"
            className="flex-1 rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal"
          />
          <button
            type="submit"
            disabled={savingEx || !newExName.trim()}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: meta.color + '18', color: meta.color }}
          >
            {savingEx ? 'Adding...' : 'Add'}
          </button>
        </form>

        {exList.length === 0 ? (
          <p className="py-12 text-center text-muted">No exercises yet. Add your first exercise above.</p>
        ) : (
          <div className="space-y-2">
            {exList.map((ex, i) => (
              <motion.div
                key={ex.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.2 }}
                className="flex items-center gap-2 rounded-xl border border-card-border bg-card px-4 py-3"
              >
                <span className="w-6 text-xs font-medium text-dim">{i + 1}.</span>
                <span className="flex-1 text-sm font-medium text-fg">{ex.name}</span>

                {deletingExId === ex.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => deleteExercise(ex.id)}
                      className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeletingExId(null)}
                      className="rounded-lg border border-card-border px-2.5 py-1 text-[11px] font-medium text-secondary transition-colors hover:text-fg"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => moveExercise(ex.id, 'up')}
                      disabled={i === 0}
                      className="rounded p-1.5 text-muted transition-colors hover:text-fg disabled:opacity-20"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveExercise(ex.id, 'down')}
                      disabled={i === exList.length - 1}
                      className="rounded p-1.5 text-muted transition-colors hover:text-fg disabled:opacity-20"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeletingExId(ex.id)}
                      className="rounded p-1.5 text-muted transition-colors hover:text-red-500"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════════
     ACTIVE WORKOUT SCREEN
     ═══════════════════════════════════════════════════════════════════ */

  if (screen === 'workout') {
    const meta = WORKOUT_META[selectedType]
    const exList = exercises[selectedType]
    const ex = currentExercise()
    const sets = currentSets()
    const prevStr = ex ? formatPrevSets(ex.id) : ''
    const isLast = exIndex === exList.length - 1

    return (
      <div>
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          {confirmCancel ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Cancel workout?</span>
              <button
                onClick={cancelWorkout}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmCancel(false)}
                className="rounded-lg border border-card-border px-2.5 py-1 text-[11px] font-medium text-secondary"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmCancel(true)}
              className="text-sm text-muted transition-colors hover:text-fg"
            >
              Cancel
            </button>
          )}
          <span className="text-sm font-semibold" style={{ color: meta.color }}>
            {meta.label} Day
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>Exercise {exIndex + 1} of {exList.length}</span>
            <span>{Math.round(((exIndex + 1) / exList.length) * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-card-border">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: meta.color }}
              initial={false}
              animate={{ width: `${((exIndex + 1) / exList.length) * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Exercise content with directional animation */}
        <AnimatePresence mode="wait">
          {ex && (
            <motion.div
              key={ex.id}
              initial={{ opacity: 0, x: animDir === 'next' ? 60 : -60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: animDir === 'next' ? -60 : 60 }}
              transition={{ duration: 0.2 }}
            >
              {/* Exercise name */}
              <h2 className="mb-1 text-2xl font-bold text-fg">{ex.name}</h2>

              {/* Previous performance */}
              {prevStr && (
                <div className="mb-5 rounded-lg border border-card-border bg-card/50 px-3 py-2">
                  <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-dim">
                    Previous
                  </p>
                  <p className="text-sm text-secondary">{prevStr}</p>
                </div>
              )}
              {!prevStr && <p className="mb-5 text-xs text-dim">First time — set your baseline!</p>}

              {/* Set rows */}
              <div className="mb-3 space-y-2">
                <div className="flex items-center gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-dim">
                  <span className="w-11">Set</span>
                  <span className="flex-1 text-center">Weight (kg)</span>
                  <span className="w-4" />
                  <span className="flex-1 text-center">Reps</span>
                  <span className="w-8" />
                </div>

                {sets.map((s, i) => {
                  const prevSet = prevSets[ex.id]?.[i]
                  const weightUp = prevSet && s.weight_kg > prevSet.weight_kg
                  const repsUp = prevSet && s.reps > prevSet.reps

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-2"
                    >
                      <span className="w-11 text-center text-sm font-semibold text-dim">{i + 1}</span>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          value={s.weight_kg > 0 ? s.weight_kg : ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? 0 : parseFloat(e.target.value)
                            if (!isNaN(v)) updateSet(i, 'weight_kg', v)
                          }}
                          placeholder="0"
                          className={`w-full rounded-lg border bg-bg px-3 py-2.5 text-center text-sm font-medium text-fg placeholder-dim outline-none transition-colors focus:border-teal focus:ring-1 focus:ring-teal ${
                            weightUp ? 'border-green-500/50' : 'border-card-border'
                          }`}
                        />
                        {weightUp && (
                          <span className="absolute -top-1.5 right-1.5 text-[10px] font-bold text-green-500">
                            +{(s.weight_kg - prevSet.weight_kg).toFixed(1)}
                          </span>
                        )}
                      </div>
                      <span className="w-4 text-center text-xs text-dim">x</span>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={s.reps > 0 ? s.reps : ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                            if (!isNaN(v)) updateSet(i, 'reps', v)
                          }}
                          placeholder="0"
                          className={`w-full rounded-lg border bg-bg px-3 py-2.5 text-center text-sm font-medium text-fg placeholder-dim outline-none transition-colors focus:border-teal focus:ring-1 focus:ring-teal ${
                            repsUp ? 'border-green-500/50' : 'border-card-border'
                          }`}
                        />
                        {repsUp && (
                          <span className="absolute -top-1.5 right-1.5 text-[10px] font-bold text-green-500">
                            +{s.reps - prevSet.reps}
                          </span>
                        )}
                      </div>
                      <div className="w-8 flex justify-center">
                        {sets.length > 1 && (
                          <button
                            onClick={() => removeSet(i)}
                            className="rounded p-1 text-muted transition-colors hover:text-red-500"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>

              <button
                onClick={addSet}
                className="mb-8 text-sm font-medium text-teal transition-opacity hover:opacity-80"
              >
                + Add Set
              </button>

              {/* Navigation buttons */}
              <div className="flex gap-3">
                <button
                  onClick={goBack}
                  disabled={exIndex === 0}
                  className="flex-1 rounded-xl border border-card-border py-3.5 text-sm font-semibold text-muted transition-colors hover:text-fg disabled:opacity-25"
                >
                  Previous
                </button>
                <button
                  onClick={saveAndAdvance}
                  disabled={saving}
                  className="flex-1 rounded-xl py-3.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: meta.color }}
                >
                  {saving ? 'Saving...' : isLast ? 'Finish Workout' : 'Complete & Next'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════════
     WORKOUT COMPLETE SCREEN
     ═══════════════════════════════════════════════════════════════════ */

  if (screen === 'complete') {
    const meta = WORKOUT_META[selectedType]
    const exList = exercises[selectedType]
    const totalVolume = calcVolume(sessionSets)
    const prevTotalVolume = Object.keys(prevSets).length > 0
      ? Object.values(prevSets).flat().reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
      : 0
    const totalSetsCount = Object.values(sessionSets).flat().filter((s) => s.weight_kg > 0 || s.reps > 0).length
    const volumeDiff = totalVolume - prevTotalVolume

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Checkmark */}
        <div className="pt-4 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: meta.color + '18' }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={meta.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 className="mb-1 text-2xl font-bold text-fg">Workout Complete</h1>
          <p className="mb-6 text-sm" style={{ color: meta.color }}>
            {meta.label} Day
          </p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-card-border bg-card p-3 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Duration</p>
            <p className="mt-1 text-lg font-bold text-fg">{durationStr()}</p>
          </div>
          <div className="rounded-xl border border-card-border bg-card p-3 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Sets</p>
            <p className="mt-1 text-lg font-bold text-fg">{totalSetsCount}</p>
          </div>
          <div className="rounded-xl border border-card-border bg-card p-3 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Volume</p>
            <p className="mt-1 text-lg font-bold text-teal">{Math.round(totalVolume).toLocaleString()} kg</p>
          </div>
        </div>

        {/* Volume comparison */}
        {prevTotalVolume > 0 && (
          <div className={`mb-6 rounded-xl border px-4 py-3 text-center text-sm font-medium ${
            volumeDiff >= 0
              ? 'border-green-500/20 bg-green-500/5 text-green-500'
              : 'border-red-500/20 bg-red-500/5 text-red-500'
          }`}>
            {volumeDiff >= 0 ? 'Volume up' : 'Volume down'} {Math.abs(Math.round(volumeDiff)).toLocaleString()} kg
            {prevTotalVolume > 0 && ` (${volumeDiff >= 0 ? '+' : ''}${((volumeDiff / prevTotalVolume) * 100).toFixed(1)}%)`}
            {' '}vs last session
          </div>
        )}

        {/* Exercise breakdown */}
        <h2 className="mb-3 text-sm font-semibold text-fg">Exercise Summary</h2>
        <div className="space-y-2">
          {exList.map((exercise) => {
            const sets = sessionSets[exercise.id] ?? []
            const validSets = sets.filter((s) => s.weight_kg > 0 || s.reps > 0)
            if (validSets.length === 0) return null
            const vol = calcExVolume(exercise.id)
            const prevVol = calcPrevVolume(exercise.id)
            const diff = vol - prevVol

            return (
              <div
                key={exercise.id}
                className="rounded-xl border border-card-border bg-card px-4 py-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold text-fg">{exercise.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">
                      {validSets.length} set{validSets.length !== 1 ? 's' : ''}
                    </span>
                    {prevVol > 0 && (
                      <span className={`text-xs font-semibold ${diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {diff >= 0 ? '+' : ''}{Math.round(diff)} kg
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-dim">
                  {validSets.map((s) => `${s.weight_kg}kg x ${s.reps}`).join('  /  ')}
                </p>
              </div>
            )
          })}
        </div>

        <button
          onClick={resetWorkout}
          className="mt-6 w-full rounded-xl bg-teal py-3.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          Done
        </button>
      </motion.div>
    )
  }

  return null
}
