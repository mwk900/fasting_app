import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import GymProgress from './GymProgress'
import DateInput from '../DateInput'
import type { Exercise, WorkoutSession, WorkoutType } from '../../types'

/* ─── Local types ─────────────────────────────────────────────────── */

interface LocalSet {
  exercise_id: number
  set_number: number
  weight_kg: number
  reps: number
}

interface DetailSet {
  exercise_id: number
  set_number: number
  weight_kg: number
  reps: number
  exercises: { name: string } | null
}

type Screen = 'select' | 'manage' | 'workout' | 'cardio' | 'complete' | 'progress' | 'detail'

/* ─── Constants ───────────────────────────────────────────────────── */

const WORKOUT_META: Record<WorkoutType, { label: string; desc: string; color: string }> = {
  push: { label: 'Push', desc: 'Chest, shoulders, triceps', color: '#f97316' },
  pull: { label: 'Pull', desc: 'Back, biceps, rear delts', color: '#8b5cf6' },
  legs: { label: 'Legs', desc: 'Quads, hamstrings, glutes, calves', color: '#22c55e' },
  cardio: { label: 'Cardio', desc: 'Running, cycling, swimming', color: '#06b6d4' },
}

const STRENGTH_TYPES: WorkoutType[] = ['push', 'pull', 'legs']
const ALL_TYPES: WorkoutType[] = ['push', 'pull', 'legs', 'cardio']

/* ─── Component ───────────────────────────────────────────────────── */

export default function GymTab() {
  const { user } = useAuth()

  /* Navigation */
  const [screen, setScreen] = useState<Screen>('select')
  const [selectedType, setSelectedType] = useState<WorkoutType>('push')

  /* Data */
  const [exercises, setExercises] = useState<Record<WorkoutType, Exercise[]>>({
    push: [], pull: [], legs: [], cardio: [],
  })
  const [lastSessions, setLastSessions] = useState<Record<WorkoutType, WorkoutSession | null>>({
    push: null, pull: null, legs: null, cardio: null,
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
  const [isFasted, setIsFasted] = useState(false)
  const [skippedExercises, setSkippedExercises] = useState<Set<number>>(new Set())
  const [showAddMidWorkout, setShowAddMidWorkout] = useState(false)
  const [midWorkoutExName, setMidWorkoutExName] = useState('')
  const [showExList, setShowExList] = useState(false)
  const [workoutNotes, setWorkoutNotes] = useState('')

  /* Workout date (for backdating) */
  const [workoutDate, setWorkoutDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  /* Cardio */
  const [cardioDistance, setCardioDistance] = useState('')
  const [cardioMinutes, setCardioMinutes] = useState('')
  const [cardioFeel, setCardioFeel] = useState('')
  const [cardioFasted, setCardioFasted] = useState(false)

  /* Detail / Recent */
  const [detailSession, setDetailSession] = useState<WorkoutSession | null>(null)
  const [detailSets, setDetailSets] = useState<DetailSet[]>([])
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null)

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

    const grouped: Record<WorkoutType, Exercise[]> = { push: [], pull: [], legs: [], cardio: [] }
    for (const ex of data ?? []) {
      grouped[ex.workout_type as WorkoutType]?.push(ex)
    }
    setExercises(grouped)
    setLoading(false)
  }

  async function fetchLastSessions() {
    const result: Record<WorkoutType, WorkoutSession | null> = { push: null, pull: null, legs: null, cardio: null }
    const promises = ALL_TYPES.map(async (type) => {
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
      .limit(15)
    setRecentWorkouts(data ?? [])
  }

  /* ─── Exercise management ──────────────────────────────────────── */

  async function addExercise(e: React.FormEvent) {
    e.preventDefault()
    if (!newExName.trim()) return
    const duplicate = exercises[selectedType].some(
      (ex) => ex.name.toLowerCase() === newExName.trim().toLowerCase(),
    )
    if (duplicate) { setError('Exercise already exists'); return }
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
    setIsFasted(false)
    setSkippedExercises(new Set())
    setWorkoutNotes('')
    setShowAddMidWorkout(false)
    setMidWorkoutExName('')
    setShowExList(false)
    setWorkoutDate(format(new Date(), 'yyyy-MM-dd'))

    const { data: session, error: err } = await supabase
      .from('workout_sessions')
      .insert({ user_id: user!.id, workout_type: type, is_fasted: false })
      .select()
      .single()
    if (err || !session) { setError('Failed to start workout'); return }
    setSessionId(session.id)
    setExIndex(0)
    setAnimDir('next')
    setConfirmCancel(false)
    setWorkoutStart(new Date())

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
          exercise_id: s.exercise_id, set_number: s.set_number,
          weight_kg: Number(s.weight_kg), reps: s.reps,
        })
      }
    }
    setPrevSets(prevGrouped)

    const initial: Record<number, LocalSet[]> = {}
    for (const ex of exList) {
      const prev = prevGrouped[ex.id]
      if (prev && prev.length > 0) {
        initial[ex.id] = prev.map((s) => ({
          exercise_id: ex.id, set_number: s.set_number,
          weight_kg: s.weight_kg, reps: s.reps,
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
      [ex.id]: [...sets, {
        exercise_id: ex.id, set_number: sets.length + 1,
        weight_kg: last?.weight_kg ?? 0, reps: last?.reps ?? 0,
      }],
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

  async function toggleFasted() {
    const v = !isFasted
    setIsFasted(v)
    if (sessionId) {
      const { error: err } = await supabase.from('workout_sessions').update({ is_fasted: v }).eq('id', sessionId)
      if (err) { setIsFasted(!v); setError('Failed to update fasted status') }
    }
  }

  async function addExerciseMidWorkout(e: React.FormEvent) {
    e.preventDefault()
    if (!midWorkoutExName.trim() || savingEx) return
    const duplicate = exercises[selectedType].some(
      (ex) => ex.name.toLowerCase() === midWorkoutExName.trim().toLowerCase(),
    )
    if (duplicate) { setError('Exercise already exists'); return }
    setSavingEx(true)
    setError(null)
    const list = exercises[selectedType]
    const insertIdx = exIndex + 1 // insert right after current exercise
    const currentSortOrder = list[exIndex]?.sort_order ?? 0

    // Shift sort_order for all exercises after the insertion point
    const toShift = list.slice(insertIdx)
    if (toShift.length > 0) {
      await Promise.all(
        toShift.map((ex) =>
          supabase.from('exercises').update({ sort_order: ex.sort_order + 1 }).eq('id', ex.id)
        )
      )
    }

    const { data: newEx, error: err } = await supabase
      .from('exercises')
      .insert({
        user_id: user!.id, name: midWorkoutExName.trim(),
        workout_type: selectedType, sort_order: currentSortOrder + 1,
      })
      .select().single()
    if (err || !newEx) { setError('Failed to add exercise'); setSavingEx(false); return }
    // Save current exercise sets before jumping
    const curEx = currentExercise()
    if (curEx && sessionId) {
      const sets = sessionSets[curEx.id] ?? []
      const valid = sets.filter((s) => s.weight_kg > 0 || s.reps > 0)
      if (valid.length > 0) {
        await supabase.from('workout_sets').delete().eq('session_id', sessionId).eq('exercise_id', curEx.id)
        await supabase.from('workout_sets').insert(
          valid.map((s) => ({
            user_id: user!.id, session_id: sessionId, exercise_id: curEx.id,
            set_number: s.set_number, weight_kg: s.weight_kg, reps: s.reps,
          }))
        )
      }
    }
    // Insert at position right after current exercise
    const newList = [...list]
    newList.splice(insertIdx, 0, newEx)
    for (let i = insertIdx + 1; i < newList.length; i++) {
      newList[i] = { ...newList[i], sort_order: newList[i].sort_order + 1 }
    }
    setExercises((prev) => ({ ...prev, [selectedType]: newList }))
    setSessionSets((prev) => ({
      ...prev, [newEx.id]: [{ exercise_id: newEx.id, set_number: 1, weight_kg: 0, reps: 0 }],
    }))
    setAnimDir('next')
    setExIndex(insertIdx)
    setMidWorkoutExName('')
    setShowAddMidWorkout(false)
    setShowExList(false)
    setSavingEx(false)
  }

  async function deleteExerciseMidWorkout(exId: number) {
    const exList = exercises[selectedType]
    const delIdx = exList.findIndex((e) => e.id === exId)
    if (delIdx < 0) return
    setError(null)
    if (sessionId) {
      await supabase.from('workout_sets').delete().eq('session_id', sessionId).eq('exercise_id', exId)
    }
    await supabase.from('exercises').delete().eq('id', exId)
    const newList = exList.filter((e) => e.id !== exId)
    setExercises((prev) => ({ ...prev, [selectedType]: newList }))
    setSessionSets((prev) => { const next = { ...prev }; delete next[exId]; return next })
    setSkippedExercises((prev) => { const next = new Set(prev); next.delete(exId); return next })
    setDeletingExId(null)
    if (newList.length === 0) { cancelWorkout(); return }
    if (delIdx < exIndex) {
      setExIndex((i) => i - 1)
    } else if (delIdx === exIndex && exIndex >= newList.length) {
      setExIndex(newList.length - 1)
    }
  }

  async function jumpToExercise(targetIdx: number) {
    if (targetIdx === exIndex) return
    const ex = currentExercise()
    if (ex && sessionId) {
      const sets = sessionSets[ex.id] ?? []
      const valid = sets.filter((s) => s.weight_kg > 0 || s.reps > 0)
      if (valid.length > 0) {
        await supabase.from('workout_sets').delete().eq('session_id', sessionId).eq('exercise_id', ex.id)
        await supabase.from('workout_sets').insert(
          valid.map((s) => ({
            user_id: user!.id, session_id: sessionId, exercise_id: ex.id,
            set_number: s.set_number, weight_kg: s.weight_kg, reps: s.reps,
          }))
        )
      }
    }
    setAnimDir(targetIdx > exIndex ? 'next' : 'prev')
    setExIndex(targetIdx)
    setShowExList(false)
    setDeletingExId(null)
  }

  async function saveAndAdvance() {
    const ex = currentExercise()
    if (!ex || !sessionId) return
    setSaving(true)
    const sets = sessionSets[ex.id] ?? []
    const valid = sets.filter((s) => s.weight_kg > 0 || s.reps > 0)
    if (valid.length > 0) {
      await supabase.from('workout_sets').delete().eq('session_id', sessionId).eq('exercise_id', ex.id)
      await supabase.from('workout_sets').insert(
        valid.map((s) => ({
          user_id: user!.id, session_id: sessionId, exercise_id: ex.id,
          set_number: s.set_number, weight_kg: s.weight_kg, reps: s.reps,
        }))
      )
    }
    const exList = exercises[selectedType]
    if (exIndex < exList.length - 1) {
      setAnimDir('next')
      setExIndex((i) => i + 1)
    } else {
      await supabase.from('workout_sessions')
        .update(sessionTimestamps())
        .eq('id', sessionId)
      setScreen('complete')
      fetchLastSessions()
      fetchRecentWorkouts()
    }
    setSaving(false)
  }

  async function skipExercise() {
    const ex = currentExercise()
    if (!ex || saving) return
    setSaving(true)
    setSkippedExercises((prev) => new Set([...prev, ex.id]))
    // Remove any saved sets for this exercise
    if (sessionId) {
      await supabase.from('workout_sets').delete().eq('session_id', sessionId).eq('exercise_id', ex.id)
    }
    setSessionSets((prev) => { const next = { ...prev }; delete next[ex.id]; return next })
    const exList = exercises[selectedType]
    if (exIndex < exList.length - 1) {
      setAnimDir('next')
      setExIndex((i) => i + 1)
    } else {
      await supabase.from('workout_sessions')
        .update(sessionTimestamps())
        .eq('id', sessionId)
      setScreen('complete')
      fetchLastSessions()
      fetchRecentWorkouts()
    }
    setSaving(false)
  }

  function goBack() {
    if (exIndex <= 0) return
    setAnimDir('prev')
    const prevEx = exercises[selectedType][exIndex - 1]
    if (prevEx && skippedExercises.has(prevEx.id)) {
      // Un-skip: remove from skipped set and restore sets from previous data or default
      setSkippedExercises((prev) => { const next = new Set(prev); next.delete(prevEx.id); return next })
      if (!sessionSets[prevEx.id]) {
        const prev = prevSets[prevEx.id]
        if (prev && prev.length > 0) {
          setSessionSets((s) => ({
            ...s, [prevEx.id]: prev.map((p) => ({
              exercise_id: prevEx.id, set_number: p.set_number,
              weight_kg: p.weight_kg, reps: p.reps,
            })),
          }))
        } else {
          setSessionSets((s) => ({
            ...s, [prevEx.id]: [{ exercise_id: prevEx.id, set_number: 1, weight_kg: 0, reps: 0 }],
          }))
        }
      }
    }
    setExIndex((i) => i - 1)
  }

  async function cancelWorkout() {
    if (sessionId) {
      await supabase.from('workout_sets').delete().eq('session_id', sessionId)
      await supabase.from('workout_sessions').delete().eq('id', sessionId)
    }
    resetWorkout()
  }

  function resetWorkout() {
    setSessionId(null); setExIndex(0); setSessionSets({}); setPrevSets({})
    setWorkoutStart(null); setConfirmCancel(false); setIsFasted(false)
    setSkippedExercises(new Set()); setWorkoutNotes(''); setShowExList(false)
    setCardioDistance(''); setCardioMinutes(''); setCardioFeel(''); setCardioFasted(false)
    setWorkoutDate(format(new Date(), 'yyyy-MM-dd'))
    setScreen('select')
  }

  async function saveNotesAndFinish() {
    if (sessionId && workoutNotes.trim()) {
      await supabase.from('workout_sessions').update({ notes: workoutNotes.trim() }).eq('id', sessionId)
    }
    resetWorkout()
  }

  /* ─── Cardio flow ──────────────────────────────────────────────── */

  function startCardio() {
    setSelectedType('cardio')
    setCardioDistance(''); setCardioMinutes(''); setCardioFeel('')
    setCardioFasted(false); setWorkoutNotes(''); setWorkoutStart(new Date())
    setWorkoutDate(format(new Date(), 'yyyy-MM-dd'))
    setScreen('cardio')
  }

  async function completeCardio() {
    setSaving(true)
    const timestamps = sessionTimestamps()
    const { data: session, error: err } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: user!.id, workout_type: 'cardio' as WorkoutType,
        is_fasted: cardioFasted,
        distance_km: cardioDistance ? parseFloat(cardioDistance) : null,
        duration_minutes: cardioMinutes ? parseFloat(cardioMinutes) : null,
        feel_note: cardioFeel || null,
        started_at: timestamps.started_at,
        completed_at: timestamps.completed_at,
      })
      .select().single()
    if (err || !session) { setError('Failed to save cardio'); setSaving(false); return }
    setSessionId(session.id)
    setSaving(false)
    setScreen('complete')
    fetchLastSessions()
    fetchRecentWorkouts()
  }

  /* ─── Detail / Delete ──────────────────────────────────────────── */

  async function viewWorkoutDetail(session: WorkoutSession) {
    setDetailSession(session)
    if (session.workout_type !== 'cardio') {
      const { data } = await supabase
        .from('workout_sets')
        .select('exercise_id, set_number, weight_kg, reps, exercises(name)')
        .eq('session_id', session.id)
        .order('exercise_id')
        .order('set_number')
      setDetailSets((data as unknown as DetailSet[]) ?? [])
    } else {
      setDetailSets([])
    }
    setScreen('detail')
  }

  async function deleteWorkout(id: number) {
    await supabase.from('workout_sets').delete().eq('session_id', id)
    await supabase.from('workout_sessions').delete().eq('id', id)
    setRecentWorkouts((prev) => prev.filter((s) => s.id !== id))
    setDeletingSessionId(null)
    if (detailSession?.id === id) setScreen('select')
    fetchLastSessions()
  }

  async function toggleDetailFasted() {
    if (!detailSession) return
    const newVal = !detailSession.is_fasted
    const { error: err } = await supabase.from('workout_sessions').update({ is_fasted: newVal }).eq('id', detailSession.id)
    if (err) { setError('Failed to update fasted status'); return }
    setDetailSession({ ...detailSession, is_fasted: newVal })
    setRecentWorkouts((prev) => prev.map((s) => s.id === detailSession.id ? { ...s, is_fasted: newVal } : s))
  }

  async function updateDetailDate(newDate: string) {
    if (!detailSession) return
    const ts = new Date(newDate + 'T12:00:00').toISOString()
    const { error: err } = await supabase.from('workout_sessions')
      .update({ started_at: ts, completed_at: ts })
      .eq('id', detailSession.id)
    if (err) { setError('Failed to update date'); return }
    setDetailSession({ ...detailSession, started_at: ts, completed_at: ts })
    setRecentWorkouts((prev) => prev.map((s) => s.id === detailSession.id ? { ...s, started_at: ts, completed_at: ts } : s))
    fetchLastSessions()
  }

  /* ─── Helpers ──────────────────────────────────────────────────── */

  function formatPrevSets(exerciseId: number): string {
    const sets = prevSets[exerciseId]
    if (!sets || sets.length === 0) return ''
    return sets.map((s) => `${s.weight_kg}kg x ${s.reps}`).join('  /  ')
  }

  function calcVolume(sets: Record<number, LocalSet[]>): number {
    return Object.values(sets).flat().reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
  }

  function calcPrevVolume(exerciseId: number): number {
    return (prevSets[exerciseId] ?? []).reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
  }

  function calcExVolume(exerciseId: number): number {
    return (sessionSets[exerciseId] ?? []).reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
  }

  function sessionTimestamps(): { started_at: string; completed_at: string } {
    const today = format(new Date(), 'yyyy-MM-dd')
    if (workoutDate === today) {
      return { started_at: workoutStart?.toISOString() ?? new Date().toISOString(), completed_at: new Date().toISOString() }
    }
    const backdated = new Date(workoutDate + 'T12:00:00').toISOString()
    return { started_at: backdated, completed_at: backdated }
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

  /* ═════════════════════════════════════════════════════════════════
     PROGRESS SCREEN (delegated)
     ═════════════════════════════════════════════════════════════════ */

  if (screen === 'progress') {
    return <GymProgress userId={user!.id} onBack={() => setScreen('select')} />
  }

  /* ═════════════════════════════════════════════════════════════════
     DETAIL SCREEN
     ═════════════════════════════════════════════════════════════════ */

  if (screen === 'detail' && detailSession) {
    const meta = WORKOUT_META[detailSession.workout_type as WorkoutType]
    const isCardio = detailSession.workout_type === 'cardio'
    const dur = detailSession.completed_at && detailSession.started_at
      ? Math.round((new Date(detailSession.completed_at).getTime() - new Date(detailSession.started_at).getTime()) / 60000)
      : null

    // Group sets by exercise
    const grouped: Record<number, { name: string; sets: DetailSet[] }> = {}
    for (const s of detailSets) {
      if (!grouped[s.exercise_id]) grouped[s.exercise_id] = { name: s.exercises?.name ?? 'Unknown', sets: [] }
      grouped[s.exercise_id].sets.push(s)
    }

    return (
      <div>
        <button onClick={() => setScreen('select')} className="mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>

        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: meta.color + '18', color: meta.color }}>{meta.label}</span>
          <button onClick={toggleDetailFasted}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
              detailSession.is_fasted
                ? 'bg-teal/15 text-teal border border-teal/30'
                : 'border border-card-border text-dim hover:text-secondary'
            }`}>
            {detailSession.is_fasted ? 'Fasted' : 'Not Fasted'}
          </button>
          <DateInput
            value={format(parseISO(detailSession.completed_at!), 'yyyy-MM-dd')}
            onChange={updateDetailDate}
            className="rounded-lg border border-card-border bg-bg px-2.5 py-1 text-xs text-fg"
          />
        </div>

        {!isCardio && dur != null && dur > 0 && (
          <p className="mb-4 text-xs text-dim">Duration: {dur >= 60 ? `${Math.floor(dur / 60)}h ${dur % 60}m` : `${dur}m`}</p>
        )}

        {isCardio ? (
          <div className="space-y-3">
            {detailSession.distance_km != null && (
              <div className="rounded-xl border border-card-border bg-card px-4 py-3">
                <p className="text-xs text-dim">Distance</p>
                <p className="text-lg font-bold text-fg">{detailSession.distance_km} km</p>
              </div>
            )}
            {detailSession.duration_minutes != null && (
              <div className="rounded-xl border border-card-border bg-card px-4 py-3">
                <p className="text-xs text-dim">Time</p>
                <p className="text-lg font-bold text-fg">{detailSession.duration_minutes} min</p>
              </div>
            )}
            {detailSession.feel_note && (
              <div className="rounded-xl border border-card-border bg-card px-4 py-3">
                <p className="text-xs text-dim">How it felt</p>
                <p className="text-sm text-fg">{detailSession.feel_note}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([exId, { name, sets }]) => (
              <div key={exId} className="rounded-xl border border-card-border bg-card px-4 py-3">
                <p className="mb-2 text-sm font-semibold text-fg">{name}</p>
                <div className="space-y-1">
                  {sets.map((s) => (
                    <p key={s.set_number} className="text-xs text-secondary">
                      Set {s.set_number}: <span className="font-medium text-fg">{Number(s.weight_kg)}kg</span> x <span className="font-medium text-fg">{s.reps}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
            {detailSets.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">No exercises recorded.</p>
            )}
          </div>
        )}

        {detailSession.notes && (
          <div className="mt-4 rounded-xl border border-card-border bg-card px-4 py-3">
            <p className="text-xs text-dim">Notes</p>
            <p className="mt-1 text-sm text-fg">{detailSession.notes}</p>
          </div>
        )}

        <div className="mt-6">
          {deletingSessionId === detailSession.id ? (
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs text-muted">Delete this workout?</span>
              <button onClick={() => deleteWorkout(detailSession.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white">Confirm</button>
              <button onClick={() => setDeletingSessionId(null)} className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-secondary">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setDeletingSessionId(detailSession.id)} className="w-full rounded-xl border border-red-500/20 py-2.5 text-sm font-medium text-red-500 transition-opacity hover:opacity-80">
              Delete Workout
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ═════════════════════════════════════════════════════════════════
     SELECTION SCREEN
     ═════════════════════════════════════════════════════════════════ */

  if (screen === 'select') {
    return (
      <div>
        <h1 className="mb-4 text-xl font-bold text-fg">Gym</h1>

        <button
          onClick={() => setScreen('progress')}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl border border-card-border bg-card py-3 text-sm font-semibold text-muted transition-colors hover:text-fg"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          View Progress
        </button>

        {error && <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</p>}

        {/* Strength cards */}
        <div className="space-y-3">
          {STRENGTH_TYPES.map((type, ti) => {
            const meta = WORKOUT_META[type]
            const exList = exercises[type]
            const last = lastSessions[type]
            return (
              <motion.div key={type} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: ti * 0.08, duration: 0.25 }}
                className="rounded-xl border bg-card p-4"
                style={{ borderColor: 'var(--color-card-border)', borderLeftWidth: '3px', borderLeftColor: meta.color }}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-fg">{meta.label}</h3>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: meta.color + '18', color: meta.color }}>
                    {exList.length} exercise{exList.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="mb-1 text-sm text-muted">{meta.desc}</p>
                {last?.completed_at && (
                  <p className="mb-3 text-xs text-dim">Last: {formatDistanceToNow(parseISO(last.completed_at), { addSuffix: true })}</p>
                )}
                {!last && <div className="mb-3" />}
                <div className="flex gap-2">
                  <button onClick={() => startWorkout(type)}
                    className="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ backgroundColor: meta.color + '18', color: meta.color }}>
                    {exList.length > 0 ? 'Start Workout' : 'Add Exercises'}
                  </button>
                  <button onClick={() => { setSelectedType(type); setDeletingExId(null); setNewExName(''); setScreen('manage') }}
                    className="rounded-lg border border-card-border px-4 py-2.5 text-sm text-muted transition-colors hover:text-fg">
                    Edit
                  </button>
                </div>
              </motion.div>
            )
          })}

          {/* Cardio card */}
          {(() => {
            const meta = WORKOUT_META.cardio
            const last = lastSessions.cardio
            return (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.25 }}
                className="rounded-xl border bg-card p-4"
                style={{ borderColor: 'var(--color-card-border)', borderLeftWidth: '3px', borderLeftColor: meta.color }}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-fg">{meta.label}</h3>
                </div>
                <p className="mb-1 text-sm text-muted">{meta.desc}</p>
                {last?.completed_at && (
                  <p className="mb-3 text-xs text-dim">Last: {formatDistanceToNow(parseISO(last.completed_at), { addSuffix: true })}</p>
                )}
                {!last && <div className="mb-3" />}
                <button onClick={startCardio}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: meta.color + '18', color: meta.color }}>
                  Log Cardio
                </button>
              </motion.div>
            )
          })()}
        </div>

        {/* Recent Workouts */}
        {recentWorkouts.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-fg">Recent Workouts</h2>
            <div className="space-y-2">
              {recentWorkouts.map((session) => {
                const meta = WORKOUT_META[session.workout_type as WorkoutType]
                const isDeleting = deletingSessionId === session.id
                return (
                  <div key={session.id} className="rounded-xl border border-card-border bg-card px-4 py-3">
                    <div className="flex items-center justify-between">
                      <button onClick={() => viewWorkoutDetail(session)} className="flex flex-1 items-center gap-2 text-left">
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: meta.color + '18', color: meta.color }}>{meta.label}</span>
                        {session.is_fasted && (
                          <span className="rounded-full bg-teal/15 px-1.5 py-0.5 text-[10px] font-bold text-teal">F</span>
                        )}
                        <span className="text-sm text-secondary">{format(parseISO(session.completed_at!), 'dd/MM/yyyy')}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-dim">{formatDistanceToNow(parseISO(session.completed_at!), { addSuffix: true })}</span>
                        {isDeleting ? (
                          <div className="flex gap-1">
                            <button onClick={() => deleteWorkout(session.id)} className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-medium text-white">Del</button>
                            <button onClick={() => setDeletingSessionId(null)} className="rounded-lg border border-card-border px-2 py-1 text-[11px] text-secondary">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeletingSessionId(session.id)} className="p-1 text-muted transition-colors hover:text-red-500">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ═════════════════════════════════════════════════════════════════
     MANAGE EXERCISES SCREEN
     ═════════════════════════════════════════════════════════════════ */

  if (screen === 'manage') {
    const meta = WORKOUT_META[selectedType]
    const exList = exercises[selectedType]
    return (
      <div>
        <button onClick={() => { setScreen('select'); setError(null) }}
          className="mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <h1 className="mb-1 text-xl font-bold text-fg">{meta.label} Exercises</h1>
        <p className="mb-5 text-sm text-muted">Add and reorder your exercises. The workout follows this order.</p>
        {error && <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</p>}
        <form onSubmit={addExercise} className="mb-6 flex gap-2">
          <input type="text" value={newExName} onChange={(e) => setNewExName(e.target.value)} placeholder="Exercise name"
            className="flex-1 rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal" />
          <button type="submit" disabled={savingEx || !newExName.trim()}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: meta.color + '18', color: meta.color }}>
            {savingEx ? 'Adding...' : 'Add'}
          </button>
        </form>
        {exList.length === 0 ? (
          <p className="py-12 text-center text-muted">No exercises yet. Add your first exercise above.</p>
        ) : (
          <div className="space-y-2">
            {exList.map((ex, i) => (
              <motion.div key={ex.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.2 }}
                className="flex items-center gap-2 rounded-xl border border-card-border bg-card px-4 py-3">
                <span className="w-6 text-xs font-medium text-dim">{i + 1}.</span>
                <span className="flex-1 text-sm font-medium text-fg">{ex.name}</span>
                {deletingExId === ex.id ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => deleteExercise(ex.id)} className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white">Delete</button>
                    <button onClick={() => setDeletingExId(null)} className="rounded-lg border border-card-border px-2.5 py-1 text-[11px] font-medium text-secondary">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => moveExercise(ex.id, 'up')} disabled={i === 0} className="rounded p-1.5 text-muted transition-colors hover:text-fg disabled:opacity-20">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                    </button>
                    <button onClick={() => moveExercise(ex.id, 'down')} disabled={i === exList.length - 1} className="rounded p-1.5 text-muted transition-colors hover:text-fg disabled:opacity-20">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    <button onClick={() => setDeletingExId(ex.id)} className="rounded p-1.5 text-muted transition-colors hover:text-red-500">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
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

  /* ═════════════════════════════════════════════════════════════════
     CARDIO SCREEN
     ═════════════════════════════════════════════════════════════════ */

  if (screen === 'cardio') {
    const meta = WORKOUT_META.cardio
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <button onClick={resetWorkout} className="text-sm text-muted transition-colors hover:text-fg">Cancel</button>
          <span className="text-sm font-semibold" style={{ color: meta.color }}>Cardio</span>
          <div className="w-16" />
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DateInput value={workoutDate} onChange={setWorkoutDate} max={format(new Date(), 'yyyy-MM-dd')}
              className="rounded-lg border border-card-border bg-bg px-2.5 py-1.5 text-xs text-fg" />
            {workoutDate !== format(new Date(), 'yyyy-MM-dd') && (
              <span className="text-[11px] font-medium text-amber-500">Backdated</span>
            )}
          </div>
          <button onClick={() => setCardioFasted(!cardioFasted)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              cardioFasted ? 'bg-teal/15 text-teal border border-teal/30' : 'border border-card-border text-dim'
            }`}>
            {cardioFasted ? 'Fasted' : 'Not Fasted'}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Distance (km)</label>
            <input type="number" inputMode="decimal" step="0.1" value={cardioDistance}
              onChange={(e) => setCardioDistance(e.target.value)} placeholder="5.0"
              className="w-full rounded-lg border border-card-border bg-bg px-3 py-3 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Time (minutes)</label>
            <input type="number" inputMode="decimal" step="0.5" value={cardioMinutes}
              onChange={(e) => setCardioMinutes(e.target.value)} placeholder="30"
              className="w-full rounded-lg border border-card-border bg-bg px-3 py-3 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">How did you feel?</label>
            <textarea value={cardioFeel} onChange={(e) => setCardioFeel(e.target.value)}
              placeholder="Steady pace, felt good..." rows={2}
              className="w-full rounded-lg border border-card-border bg-bg px-3 py-3 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal resize-none" />
          </div>
        </div>

        <button onClick={completeCardio} disabled={saving || (!cardioDistance && !cardioMinutes)}
          className="mt-6 w-full rounded-xl py-3.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: meta.color }}>
          {saving ? 'Saving...' : 'Complete Cardio'}
        </button>
      </div>
    )
  }

  /* ═════════════════════════════════════════════════════════════════
     ACTIVE WORKOUT SCREEN
     ═════════════════════════════════════════════════════════════════ */

  if (screen === 'workout') {
    const meta = WORKOUT_META[selectedType]
    const exList = exercises[selectedType]
    const ex = currentExercise()
    const sets = currentSets()
    const prevStr = ex ? formatPrevSets(ex.id) : ''
    const isLast = exIndex === exList.length - 1
    const isSkipped = ex ? skippedExercises.has(ex.id) : false

    return (
      <div>
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          {confirmCancel ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Cancel workout?</span>
              <button onClick={cancelWorkout} className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white">Yes</button>
              <button onClick={() => setConfirmCancel(false)} className="rounded-lg border border-card-border px-2.5 py-1 text-[11px] font-medium text-secondary">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmCancel(true)} className="text-sm text-muted transition-colors hover:text-fg">Cancel</button>
          )}
          <span className="text-sm font-semibold" style={{ color: meta.color }}>{meta.label} Day</span>
          <div className="w-16" />
        </div>

        {/* Date + Fasted row */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DateInput value={workoutDate} onChange={setWorkoutDate} max={format(new Date(), 'yyyy-MM-dd')}
              className="rounded-lg border border-card-border bg-bg px-2.5 py-1.5 text-xs text-fg" />
            {workoutDate !== format(new Date(), 'yyyy-MM-dd') && (
              <span className="text-[11px] font-medium text-amber-500">Backdated</span>
            )}
          </div>
          <button onClick={toggleFasted}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              isFasted ? 'bg-teal/15 text-teal border border-teal/30' : 'border border-card-border text-dim'
            }`}>
            {isFasted ? 'Fasted' : 'Not Fasted'}
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-5">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>Exercise {exIndex + 1} of {exList.length}</span>
            <span>{Math.round(((exIndex + 1) / exList.length) * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-card-border">
            <motion.div className="h-full rounded-full" style={{ backgroundColor: meta.color }}
              initial={false} animate={{ width: `${((exIndex + 1) / exList.length) * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }} />
          </div>
        </div>

        {/* Exercise content */}
        <AnimatePresence mode="wait">
          {ex && (
            <motion.div key={ex.id}
              initial={{ opacity: 0, x: animDir === 'next' ? 60 : -60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: animDir === 'next' ? -60 : 60 }}
              transition={{ duration: 0.2 }}>

              <h2 className="mb-1 text-2xl font-bold text-fg">{ex.name}</h2>
              {isSkipped && <p className="mb-2 text-xs font-medium text-amber-500">Skipped — go back to unskip</p>}

              {prevStr && (
                <div className="mb-4 rounded-lg border border-card-border bg-card/50 px-3 py-2">
                  <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-dim">Previous</p>
                  <p className="text-sm text-secondary">{prevStr}</p>
                </div>
              )}
              {!prevStr && !isSkipped && <p className="mb-4 text-xs text-dim">First time — set your baseline!</p>}

              {/* Set rows */}
              {!isSkipped && (
                <>
                  <div className="mb-2 space-y-2">
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
                        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.15 }} className="flex items-center gap-2">
                          <span className="w-11 text-center text-sm font-semibold text-dim">{i + 1}</span>
                          <div className="relative flex-1">
                            <input type="number" inputMode="decimal" step="0.5"
                              value={s.weight_kg > 0 ? s.weight_kg : ''}
                              onChange={(e) => { const v = e.target.value === '' ? 0 : parseFloat(e.target.value); if (!isNaN(v)) updateSet(i, 'weight_kg', v) }}
                              placeholder="0"
                              className={`w-full rounded-lg border bg-bg px-3 py-2.5 text-center text-sm font-medium text-fg placeholder-dim outline-none transition-colors focus:border-teal focus:ring-1 focus:ring-teal ${weightUp ? 'border-green-500/50' : 'border-card-border'}`} />
                            {weightUp && <span className="absolute -top-1.5 right-1.5 text-[10px] font-bold text-green-500">+{(s.weight_kg - prevSet.weight_kg).toFixed(1)}</span>}
                          </div>
                          <span className="w-4 text-center text-xs text-dim">x</span>
                          <div className="relative flex-1">
                            <input type="number" inputMode="numeric"
                              value={s.reps > 0 ? s.reps : ''}
                              onChange={(e) => { const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10); if (!isNaN(v)) updateSet(i, 'reps', v) }}
                              placeholder="0"
                              className={`w-full rounded-lg border bg-bg px-3 py-2.5 text-center text-sm font-medium text-fg placeholder-dim outline-none transition-colors focus:border-teal focus:ring-1 focus:ring-teal ${repsUp ? 'border-green-500/50' : 'border-card-border'}`} />
                            {repsUp && <span className="absolute -top-1.5 right-1.5 text-[10px] font-bold text-green-500">+{s.reps - prevSet.reps}</span>}
                          </div>
                          <div className="flex w-8 justify-center">
                            {sets.length > 1 && (
                              <button onClick={() => removeSet(i)} className="rounded p-1 text-muted transition-colors hover:text-red-500">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>

                  {/* Full-width Add Set button */}
                  <button onClick={addSet}
                    className="mb-4 w-full rounded-xl border border-dashed border-card-border py-3 text-sm font-medium text-teal transition-colors hover:border-teal/40 hover:bg-teal/5">
                    + Add Set
                  </button>
                </>
              )}

              {/* Add exercise mid-workout */}
              {showAddMidWorkout ? (
                <form onSubmit={addExerciseMidWorkout} className="mb-4 flex gap-2">
                  <input type="text" value={midWorkoutExName} onChange={(e) => setMidWorkoutExName(e.target.value)}
                    placeholder="New exercise name" autoFocus
                    className="flex-1 rounded-lg border border-card-border bg-bg px-3 py-2 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal" />
                  <button type="submit" disabled={!midWorkoutExName.trim()}
                    className="rounded-lg bg-teal/15 px-3 py-2 text-sm font-semibold text-teal disabled:opacity-50">Add</button>
                  <button type="button" onClick={() => { setShowAddMidWorkout(false); setMidWorkoutExName('') }}
                    className="rounded-lg border border-card-border px-3 py-2 text-sm text-muted">No</button>
                </form>
              ) : (
                <div className="mb-5 flex items-center gap-4">
                  <button onClick={() => setShowAddMidWorkout(true)}
                    className="text-xs font-medium text-muted transition-colors hover:text-fg">
                    + Add New Exercise
                  </button>
                  <button onClick={() => { setShowExList((v) => !v); setDeletingExId(null) }}
                    className="text-xs font-medium text-muted transition-colors hover:text-fg">
                    {showExList ? 'Hide Exercise List' : 'Exercise List'}
                  </button>
                </div>
              )}

              {/* Exercise list overlay */}
              <AnimatePresence>
                {showExList && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-5 overflow-hidden rounded-xl border border-card-border bg-card"
                  >
                    <div className="px-4 py-2.5 border-b border-card-border">
                      <p className="text-xs font-semibold text-secondary">Exercises ({exList.length})</p>
                    </div>
                    <div className="divide-y divide-card-border">
                      {exList.map((exercise, i) => {
                        const isCurrent = i === exIndex
                        const isSkippedEx = skippedExercises.has(exercise.id)
                        const isDeleting = deletingExId === exercise.id
                        return (
                          <div key={exercise.id} className={`flex items-center justify-between px-4 py-2.5 ${isCurrent ? 'bg-teal/5' : ''}`}>
                            <button onClick={() => jumpToExercise(i)} disabled={isCurrent}
                              className="flex items-center gap-2 min-w-0 text-left disabled:cursor-default">
                              <span className="w-5 text-[11px] font-medium text-dim">{i + 1}.</span>
                              <span className={`text-sm truncate ${isCurrent ? 'font-semibold text-teal' : isSkippedEx ? 'text-dim line-through' : 'text-fg hover:text-teal transition-colors'}`}>
                                {exercise.name}
                              </span>
                              {isCurrent && <span className="text-[10px] font-bold text-teal">Current</span>}
                            </button>
                            <div className="ml-2 flex-shrink-0">
                              {isDeleting ? (
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => deleteExerciseMidWorkout(exercise.id)}
                                    className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-medium text-white">Delete</button>
                                  <button onClick={() => setDeletingExId(null)}
                                    className="rounded-lg border border-card-border px-2 py-1 text-[11px] text-secondary">Cancel</button>
                                </div>
                              ) : (
                                <button onClick={() => setDeletingExId(exercise.id)}
                                  className="p-1 text-muted transition-colors hover:text-red-500">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Navigation buttons */}
              <div className="flex gap-2">
                <button onClick={goBack} disabled={exIndex === 0}
                  className="flex-1 rounded-xl border border-card-border py-3.5 text-sm font-semibold text-muted transition-colors hover:text-fg disabled:opacity-25">
                  Previous
                </button>
                <button onClick={skipExercise}
                  className="rounded-xl border border-card-border px-4 py-3.5 text-sm font-medium text-dim transition-colors hover:text-muted">
                  Skip
                </button>
                <button onClick={saveAndAdvance} disabled={saving}
                  className="flex-1 rounded-xl py-3.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: meta.color }}>
                  {saving ? 'Saving...' : isLast ? 'Finish Workout' : 'Complete & Next'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  /* ═════════════════════════════════════════════════════════════════
     WORKOUT COMPLETE SCREEN
     ═════════════════════════════════════════════════════════════════ */

  if (screen === 'complete') {
    const meta = WORKOUT_META[selectedType]
    const isCardio = selectedType === 'cardio'

    if (isCardio) {
      return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
          <div className="pt-4 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: meta.color + '18' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h1 className="mb-1 text-2xl font-bold text-fg">Cardio Complete</h1>
            <div className="mb-6 flex items-center justify-center gap-2">
              <span className="text-sm" style={{ color: meta.color }}>Cardio</span>
              {cardioFasted && <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[11px] font-bold text-teal">F</span>}
            </div>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3">
            {cardioDistance && (
              <div className="rounded-xl border border-card-border bg-card p-3 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Distance</p>
                <p className="mt-1 text-lg font-bold text-fg">{cardioDistance} km</p>
              </div>
            )}
            {cardioMinutes && (
              <div className="rounded-xl border border-card-border bg-card p-3 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Time</p>
                <p className="mt-1 text-lg font-bold text-fg">{cardioMinutes} min</p>
              </div>
            )}
          </div>
          {cardioFeel && (
            <div className="mb-6 rounded-xl border border-card-border bg-card px-4 py-3">
              <p className="text-xs text-dim">How it felt</p>
              <p className="mt-1 text-sm text-fg">{cardioFeel}</p>
            </div>
          )}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-secondary">Notes (optional)</label>
            <textarea value={workoutNotes} onChange={(e) => setWorkoutNotes(e.target.value)}
              placeholder="Anything else to note?" rows={2}
              className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal resize-none" />
          </div>
          <button onClick={saveNotesAndFinish}
            className="w-full rounded-xl bg-teal py-3.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90">
            Done
          </button>
        </motion.div>
      )
    }

    // Strength workout complete
    const exList = exercises[selectedType]
    const totalVolume = calcVolume(sessionSets)
    const prevTotalVolume = Object.keys(prevSets).length > 0
      ? Object.values(prevSets).flat().reduce((sum, s) => sum + s.weight_kg * s.reps, 0) : 0
    const totalSetsCount = Object.values(sessionSets).flat().filter((s) => s.weight_kg > 0 || s.reps > 0).length
    const volumeDiff = totalVolume - prevTotalVolume

    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
        <div className="pt-4 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: meta.color + '18' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 className="mb-1 text-2xl font-bold text-fg">Workout Complete</h1>
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className="text-sm" style={{ color: meta.color }}>{meta.label} Day</span>
            {isFasted && <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[11px] font-bold text-teal">F</span>}
          </div>
        </div>

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

        {prevTotalVolume > 0 && (
          <div className={`mb-6 rounded-xl border px-4 py-3 text-center text-sm font-medium ${
            volumeDiff >= 0 ? 'border-green-500/20 bg-green-500/5 text-green-500' : 'border-red-500/20 bg-red-500/5 text-red-500'
          }`}>
            {volumeDiff >= 0 ? 'Volume up' : 'Volume down'} {Math.abs(Math.round(volumeDiff)).toLocaleString()} kg
            {prevTotalVolume > 0 && ` (${volumeDiff >= 0 ? '+' : ''}${((volumeDiff / prevTotalVolume) * 100).toFixed(1)}%)`} vs last session
          </div>
        )}

        <h2 className="mb-3 text-sm font-semibold text-fg">Exercise Summary</h2>
        <div className="space-y-2">
          {exList.map((exercise) => {
            const isSkipped = skippedExercises.has(exercise.id)
            if (isSkipped) {
              return (
                <div key={exercise.id} className="rounded-xl border border-card-border bg-card px-4 py-3 opacity-50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-fg">{exercise.name}</span>
                    <span className="text-xs font-medium text-amber-500">Skipped</span>
                  </div>
                </div>
              )
            }
            const exSets = sessionSets[exercise.id] ?? []
            const validSets = exSets.filter((s) => s.weight_kg > 0 || s.reps > 0)
            if (validSets.length === 0) return null
            const vol = calcExVolume(exercise.id)
            const prevVol = calcPrevVolume(exercise.id)
            const diff = vol - prevVol
            return (
              <div key={exercise.id} className="rounded-xl border border-card-border bg-card px-4 py-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold text-fg">{exercise.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{validSets.length} set{validSets.length !== 1 ? 's' : ''}</span>
                    {prevVol > 0 && (
                      <span className={`text-xs font-semibold ${diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {diff >= 0 ? '+' : ''}{Math.round(diff)} kg
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-dim">{validSets.map((s) => `${s.weight_kg}kg x ${s.reps}`).join('  /  ')}</p>
              </div>
            )
          })}
        </div>

        <div className="mt-6">
          <label className="mb-1 block text-xs font-medium text-secondary">Notes (optional)</label>
          <textarea value={workoutNotes} onChange={(e) => setWorkoutNotes(e.target.value)}
            placeholder="How was the workout? Anything to note?" rows={2}
            className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal resize-none" />
        </div>

        <button onClick={saveNotesAndFinish}
          className="mt-4 w-full rounded-xl bg-teal py-3.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90">
          Done
        </button>
      </motion.div>
    )
  }

  return null
}
