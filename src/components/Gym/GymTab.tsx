import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useGymSession } from '../../lib/gymSession'
import GymProgress from './GymProgress'
import DateInput from '../DateInput'
import ScreenLoader from '../ScreenLoader'
import type { Exercise, WorkoutCategory, WorkoutSession, WorkoutType } from '../../types'
import { createCategory, updateCategory, deleteCategory, CATEGORY_PALETTE } from '../../lib/workoutCategories'

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

type Screen = 'select' | 'manage' | 'categories' | 'workout' | 'cardio' | 'complete' | 'progress' | 'detail'

/* ─── Fallback meta for deleted / unknown category keys ──────────── */

const FALLBACK_META = { label: 'Workout', desc: '', color: '#6b7280' }

function metaFromCategory(c: WorkoutCategory | undefined) {
  if (!c) return FALLBACK_META
  return { label: c.label, desc: c.description ?? '', color: c.color }
}

/* ─── Weight input (supports BW + decimals) ──────────────────────── */

function weightDisplay(v: number) {
  return v === -1 ? 'BW' : v > 0 ? String(v) : ''
}

function WeightInput({ value, onChange, className }: {
  value: number
  onChange: (v: number) => void
  className: string
}) {
  const [text, setText] = useState(() => weightDisplay(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(weightDisplay(value))
  }, [value, focused])

  function handleChange(raw: string) {
    setText(raw)
    const upper = raw.trim().toUpperCase()
    if (upper === 'BW') { onChange(-1); return }
    if (upper === '' || upper === 'B') { onChange(0); return }
    const v = parseFloat(upper)
    if (!isNaN(v) && v >= 0) onChange(v)
  }

  return (
    <input type="text" inputMode="text"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); setText(weightDisplay(value)) }}
      placeholder="0"
      className={className} />
  )
}

/* ─── Component ───────────────────────────────────────────────────── */

const WORKOUT_STATE_KEY = 'gym-workout-state-v1'

interface PersistedWorkoutState {
  sessionId: number
  selectedType: WorkoutType
  exIndex: number
  sessionSets: Record<number, LocalSet[]>
  prevSets: Record<number, LocalSet[]>
  workoutStart: string
  workoutEnd: string | null
  isFasted: boolean
  skippedExercises: number[]
  workoutNotes: string
  workoutDate: string
  screen: 'workout' | 'complete'
}

export default function GymTab() {
  const { user } = useAuth()
  const { setActiveSession, categories, categoriesLoading, setCategories } = useGymSession()

  /* Derived category helpers */
  const categoryByKey = useMemo<Record<string, WorkoutCategory>>(() => {
    const next: Record<string, WorkoutCategory> = {}
    for (const c of categories) next[c.key] = c
    return next
  }, [categories])
  const strengthCategories = useMemo(() => categories.filter((c) => !c.is_cardio), [categories])
  const cardioCategory = useMemo(() => categories.find((c) => c.is_cardio), [categories])
  const cardioKey = cardioCategory?.key ?? 'cardio'
  const metaFor = (key: WorkoutType) => metaFromCategory(categoryByKey[key])
  const isCardioKey = (key: WorkoutType) => categoryByKey[key]?.is_cardio === true || key === cardioKey

  /* Navigation */
  const [screen, setScreen] = useState<Screen>('select')
  const [hydrated, setHydrated] = useState(false)
  const [selectedType, setSelectedType] = useState<WorkoutType>('push')

  /* Data */
  const [exercises, setExercises] = useState<Record<string, Exercise[]>>({})
  const [lastSessions, setLastSessions] = useState<Record<string, WorkoutSession | null>>({})

  /* Category editor state */
  const [catEditError, setCatEditError] = useState<string | null>(null)
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatDesc, setNewCatDesc] = useState('')
  const [newCatColor, setNewCatColor] = useState(CATEGORY_PALETTE[0])
  const [addingCat, setAddingCat] = useState(false)
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatLabel, setEditCatLabel] = useState('')
  const [editCatDesc, setEditCatDesc] = useState('')
  const [editCatColor, setEditCatColor] = useState(CATEGORY_PALETTE[0])
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
  const [workoutEnd, setWorkoutEnd] = useState<string | null>(null)
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
  const [historyPage, setHistoryPage] = useState(0)

  /* ─── Data fetching ────────────────────────────────────────────── */

  useEffect(() => {
    if (user) {
      void fetchExercises()
      void refreshWorkoutHistory()
    }
  }, [user])

  /* Rehydrate in-progress workout from localStorage once exercises load */
  useEffect(() => {
    if (loading || hydrated) return
    setHydrated(true)
    try {
      const raw = localStorage.getItem(WORKOUT_STATE_KEY)
      if (!raw) return
      const s = JSON.parse(raw) as PersistedWorkoutState
      const exList = exercises[s.selectedType] ?? []
      if (exList.length === 0) {
        localStorage.removeItem(WORKOUT_STATE_KEY)
        setActiveSession(null)
        return
      }
      setSessionId(s.sessionId)
      setSelectedType(s.selectedType)
      setExIndex(Math.min(s.exIndex, exList.length - 1))
      setSessionSets(s.sessionSets ?? {})
      setPrevSets(s.prevSets ?? {})
      setWorkoutStart(new Date(s.workoutStart))
      setWorkoutEnd(s.workoutEnd ?? null)
      setIsFasted(!!s.isFasted)
      setSkippedExercises(new Set(s.skippedExercises ?? []))
      setWorkoutNotes(s.workoutNotes ?? '')
      setWorkoutDate(s.workoutDate ?? format(new Date(), 'yyyy-MM-dd'))
      setScreen(s.screen === 'complete' ? 'complete' : 'workout')
      if (s.screen === 'workout') {
        setActiveSession({
          sessionId: s.sessionId,
          workoutType: s.selectedType,
          startedAt: s.workoutStart,
        })
      } else {
        setActiveSession(null)
      }
    } catch {
      localStorage.removeItem(WORKOUT_STATE_KEY)
    }
  }, [loading, hydrated, exercises, setActiveSession])

  /* Persist in-progress workout so it survives tab switches / reloads */
  useEffect(() => {
    if (!hydrated) return
    if ((screen !== 'workout' && screen !== 'complete') || !sessionId || !workoutStart) return
    if (isCardioKey(selectedType)) return
    const state: PersistedWorkoutState = {
      sessionId,
      selectedType,
      exIndex,
      sessionSets,
      prevSets,
      workoutStart: workoutStart.toISOString(),
      workoutEnd,
      isFasted,
      skippedExercises: Array.from(skippedExercises),
      workoutNotes,
      workoutDate,
      screen,
    }
    localStorage.setItem(WORKOUT_STATE_KEY, JSON.stringify(state))
  }, [hydrated, screen, sessionId, selectedType, exIndex, sessionSets, prevSets, workoutStart, workoutEnd, isFasted, skippedExercises, workoutNotes, workoutDate])

  function isSetFilled(set: LocalSet) {
    return set.weight_kg > 0 || set.weight_kg === -1 || set.reps > 0
  }

  function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    return fallback
  }

  function normalizeExerciseOrder(list: Exercise[]) {
    return list.map((exercise, index) => ({
      ...exercise,
      sort_order: index,
    }))
  }

  function formatWorkoutDuration(startIso: string, endIso: string) {
    const startMs = new Date(startIso).getTime()
    const endMs = new Date(endIso).getTime()
    const mins = Math.max(0, Math.round((endMs - startMs) / 60000))

    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
    return `${mins}m`
  }

  async function replaceExerciseSets(targetSessionId: number, exerciseId: number, sets: LocalSet[]) {
    if (!user) throw new Error('You must be signed in to save workout data.')

    const { error: deleteErr } = await supabase
      .from('workout_sets')
      .delete()
      .eq('session_id', targetSessionId)
      .eq('exercise_id', exerciseId)

    if (deleteErr) {
      throw new Error(deleteErr.message)
    }

    const validSets = sets.filter(isSetFilled)

    if (validSets.length === 0) return

    const { error: insertErr } = await supabase.from('workout_sets').insert(
      validSets.map((set) => ({
        user_id: user.id,
        session_id: targetSessionId,
        exercise_id: exerciseId,
        set_number: set.set_number,
        weight_kg: Math.max(0, set.weight_kg),
        reps: set.reps,
      })),
    )

    if (insertErr) {
      throw new Error(insertErr.message)
    }
  }

  async function persistExerciseOrder(workoutType: WorkoutType, list: Exercise[]) {
    const normalized = normalizeExerciseOrder(list)

    if (normalized.length > 0) {
      const { error: orderErr } = await supabase.from('exercises').upsert(
        normalized.map((exercise) => ({
          id: exercise.id,
          user_id: exercise.user_id,
          name: exercise.name,
          workout_type: exercise.workout_type,
          sort_order: exercise.sort_order,
        })),
        { onConflict: 'id' },
      )

      if (orderErr) {
        throw new Error(orderErr.message)
      }
    }

    setExercises((prev) => ({ ...prev, [workoutType]: normalized }))
    return normalized
  }

  async function completeStrengthWorkout(targetSessionId: number) {
    const timestamps = sessionTimestamps()
    const activeSessionSnapshot = workoutStart
      ? {
          sessionId: targetSessionId,
          workoutType: selectedType,
          startedAt: workoutStart.toISOString(),
        }
      : null

    setActiveSession(null)

    try {
      const { error: completeErr } = await supabase
        .from('workout_sessions')
        .update(timestamps)
        .eq('id', targetSessionId)

      if (completeErr) throw new Error(completeErr.message)

      setWorkoutEnd(timestamps.completed_at)
      setScreen('complete')
      void refreshWorkoutHistory()
    } catch (error) {
      if (activeSessionSnapshot) {
        setActiveSession(activeSessionSnapshot)
      }
      throw error
    }
  }

  async function fetchExercises() {
    if (!user) return

    const { data, error: err } = await supabase
      .from('exercises')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })

    if (err) { setError('Failed to load exercises'); setLoading(false); return }

    const grouped: Record<string, Exercise[]> = {}
    for (const ex of data ?? []) {
      const key = ex.workout_type as string
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(ex)
    }
    setExercises(grouped)
    setLoading(false)
  }

  async function refreshWorkoutHistory() {
    if (!user) return

    const { data, error: err } = await supabase
      .from('workout_sessions')
      .select('*')
      .eq('user_id', user.id)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })

    if (err) {
      setError((current) => current ?? 'Failed to load workout history')
      return
    }

    const sessions = (data ?? []) as WorkoutSession[]
    const latestByType: Record<string, WorkoutSession | null> = {}

    for (const session of sessions) {
      if (!latestByType[session.workout_type]) {
        latestByType[session.workout_type] = session
      }
    }

    setRecentWorkouts(sessions)
    setLastSessions(latestByType)
  }

  /* ─── Exercise management ──────────────────────────────────────── */

  async function addExercise(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!newExName.trim()) return
    const duplicate = (exercises[selectedType] ?? []).some(
      (ex) => ex.name.toLowerCase() === newExName.trim().toLowerCase(),
    )
    if (duplicate) { setError('Exercise already exists'); return }
    setSavingEx(true)
    setError(null)
    const list = exercises[selectedType] ?? []
    const maxOrder = list.length > 0 ? Math.max(...list.map((x) => x.sort_order)) + 1 : 0
    const { error: err } = await supabase.from('exercises').insert({
      user_id: user.id,
      name: newExName.trim(),
      workout_type: selectedType,
      sort_order: maxOrder,
    })
    if (err) {
      console.error('addExercise failed', err)
      setError(`Failed to add exercise: ${err.message}`)
      setSavingEx(false)
      return
    }
    setNewExName('')
    setSavingEx(false)
    fetchExercises()
  }

  async function deleteExercise(id: number) {
    const list = exercises[selectedType] ?? []
    const remaining = list.filter((exercise) => exercise.id !== id)

    setError(null)

    try {
      const { error: err } = await supabase.from('exercises').delete().eq('id', id)
      if (err) throw new Error(err.message)

      await persistExerciseOrder(selectedType, remaining)
      setDeletingExId(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete exercise'))
      void fetchExercises()
    }
  }

  async function moveExercise(id: number, direction: 'up' | 'down') {
    const list = [...(exercises[selectedType] ?? [])]
    const idx = list.findIndex((x) => x.id === id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= list.length) return

    const reordered = [...list]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]

    setError(null)

    try {
      await persistExerciseOrder(selectedType, reordered)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to reorder exercises'))
      void fetchExercises()
    }
  }

  /* ─── Workout flow ─────────────────────────────────────────────── */

  async function startWorkout(type: WorkoutType) {
    if (!user) return

    const exList = exercises[type] ?? []
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
    setWorkoutEnd(null)

    const { data: session, error: err } = await supabase
      .from('workout_sessions')
      .insert({ user_id: user.id, workout_type: type, is_fasted: false })
      .select()
      .single()
    if (err || !session) { setError('Failed to start workout'); return }
    setSessionId(session.id)
    setExIndex(0)
    setAnimDir('next')
    setConfirmCancel(false)
    const startedAt = new Date()
    setWorkoutStart(startedAt)
    setWorkoutEnd(null)
    setActiveSession({
      sessionId: session.id,
      workoutType: type,
      startedAt: startedAt.toISOString(),
    })

    const { data: prevSession } = await supabase
      .from('workout_sessions')
      .select('id')
      .eq('user_id', user.id)
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
        const w = Number(s.weight_kg)
        prevGrouped[s.exercise_id].push({
          exercise_id: s.exercise_id, set_number: s.set_number,
          weight_kg: w === 0 && s.reps > 0 ? -1 : w, reps: s.reps,
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
    return (exercises[selectedType] ?? [])[exIndex] ?? null
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
    if (!user) return
    if (!midWorkoutExName.trim() || savingEx) return
    const duplicate = (exercises[selectedType] ?? []).some(
      (ex) => ex.name.toLowerCase() === midWorkoutExName.trim().toLowerCase(),
    )
    if (duplicate) { setError('Exercise already exists'); return }
    setSavingEx(true)
    setError(null)
    let insertedExerciseId: number | null = null

    try {
      const list = exercises[selectedType] ?? []
      const insertIdx = exIndex + 1

      const { data: newEx, error: err } = await supabase
        .from('exercises')
        .insert({
          user_id: user.id,
          name: midWorkoutExName.trim(),
          workout_type: selectedType,
          sort_order: list.length,
        })
        .select()
        .single()

      if (err || !newEx) {
        throw new Error(err?.message ?? 'Failed to add exercise')
      }

      insertedExerciseId = newEx.id

      const curEx = currentExercise()
      if (curEx && sessionId) {
        await replaceExerciseSets(sessionId, curEx.id, sessionSets[curEx.id] ?? [])
      }

      const newList = [...list]
      newList.splice(insertIdx, 0, newEx)

      await persistExerciseOrder(selectedType, newList)

      setSessionSets((prev) => ({
        ...prev,
        [newEx.id]: [{ exercise_id: newEx.id, set_number: 1, weight_kg: 0, reps: 0 }],
      }))
      setAnimDir('next')
      setExIndex(insertIdx)
      setMidWorkoutExName('')
      setShowAddMidWorkout(false)
      setShowExList(false)
    } catch (err) {
      if (insertedExerciseId) {
        await supabase.from('exercises').delete().eq('id', insertedExerciseId)
      }
      setError(getErrorMessage(err, 'Failed to add exercise'))
      void fetchExercises()
    } finally {
      setSavingEx(false)
    }
  }

  async function deleteExerciseMidWorkout(exId: number) {
    const exList = exercises[selectedType] ?? []
    const delIdx = exList.findIndex((e) => e.id === exId)
    if (delIdx < 0) return
    setError(null)
    const newList = exList.filter((e) => e.id !== exId)

    try {
      if (sessionId) {
        const { error: deleteSetErr } = await supabase
          .from('workout_sets')
          .delete()
          .eq('session_id', sessionId)
          .eq('exercise_id', exId)

        if (deleteSetErr) throw new Error(deleteSetErr.message)
      }

      const { error: deleteExerciseErr } = await supabase.from('exercises').delete().eq('id', exId)
      if (deleteExerciseErr) throw new Error(deleteExerciseErr.message)

      await persistExerciseOrder(selectedType, newList)

      setSessionSets((prev) => {
        const next = { ...prev }
        delete next[exId]
        return next
      })
      setSkippedExercises((prev) => {
        const next = new Set(prev)
        next.delete(exId)
        return next
      })
      setDeletingExId(null)

      if (newList.length === 0) {
        await cancelWorkout()
        return
      }

      if (delIdx < exIndex) {
        setExIndex((i) => i - 1)
      } else if (delIdx === exIndex && exIndex >= newList.length) {
        setExIndex(newList.length - 1)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete exercise'))
      void fetchExercises()
    }
  }

  async function jumpToExercise(targetIdx: number) {
    if (targetIdx === exIndex) return
    const ex = currentExercise()
    if (ex && sessionId) {
      try {
        await replaceExerciseSets(sessionId, ex.id, sessionSets[ex.id] ?? [])
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to save exercise'))
        return
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
    try {
      await replaceExerciseSets(sessionId, ex.id, sessionSets[ex.id] ?? [])

      const exList = exercises[selectedType] ?? []
      if (exIndex < exList.length - 1) {
        setAnimDir('next')
        setExIndex((i) => i + 1)
      } else {
        await completeStrengthWorkout(sessionId)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save exercise'))
    } finally {
      setSaving(false)
    }
  }

  async function skipExercise() {
    const ex = currentExercise()
    if (!ex || saving) return
    setSaving(true)
    try {
      setSkippedExercises((prev) => new Set([...prev, ex.id]))

      if (sessionId) {
        const { error: clearErr } = await supabase
          .from('workout_sets')
          .delete()
          .eq('session_id', sessionId)
          .eq('exercise_id', ex.id)

        if (clearErr) throw new Error(clearErr.message)
      }

      setSessionSets((prev) => {
        const next = { ...prev }
        delete next[ex.id]
        return next
      })

      const exList = exercises[selectedType] ?? []
      if (exIndex < exList.length - 1) {
        setAnimDir('next')
        setExIndex((i) => i + 1)
      } else if (sessionId) {
        await completeStrengthWorkout(sessionId)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to skip exercise'))
    } finally {
      setSaving(false)
    }
  }

  function goBack() {
    if (exIndex <= 0) return
    setAnimDir('prev')
    const prevEx = (exercises[selectedType] ?? [])[exIndex - 1]
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
    try {
      if (sessionId) {
        const { error: deleteSetsErr } = await supabase.from('workout_sets').delete().eq('session_id', sessionId)
        if (deleteSetsErr) throw new Error(deleteSetsErr.message)

        const { error: deleteSessionErr } = await supabase.from('workout_sessions').delete().eq('id', sessionId)
        if (deleteSessionErr) throw new Error(deleteSessionErr.message)
      }

      resetWorkout()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to cancel workout'))
    }
  }

  function resetWorkout() {
    setSessionId(null); setExIndex(0); setSessionSets({}); setPrevSets({})
    setWorkoutStart(null); setConfirmCancel(false); setIsFasted(false)
    setWorkoutEnd(null)
    setSkippedExercises(new Set()); setWorkoutNotes(''); setShowExList(false)
    setCardioDistance(''); setCardioMinutes(''); setCardioFeel(''); setCardioFasted(false)
    setWorkoutDate(format(new Date(), 'yyyy-MM-dd'))
    setScreen('select')
    localStorage.removeItem(WORKOUT_STATE_KEY)
    setActiveSession(null)
  }

  async function saveNotesAndFinish() {
    try {
      if (sessionId && workoutNotes.trim()) {
        const { error: noteErr } = await supabase
          .from('workout_sessions')
          .update({ notes: workoutNotes.trim() })
          .eq('id', sessionId)

        if (noteErr) throw new Error(noteErr.message)
      }

      void refreshWorkoutHistory()
      resetWorkout()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save workout notes'))
    }
  }

  async function goBackToEditWorkout() {
    try {
      if (sessionId) {
        const { error: reopenErr } = await supabase
          .from('workout_sessions')
          .update({ completed_at: null })
          .eq('id', sessionId)

        if (reopenErr) throw new Error(reopenErr.message)
      }

      const exList = exercises[selectedType] ?? []
      setWorkoutEnd(null)
      if (workoutStart && sessionId) {
        setActiveSession({
          sessionId,
          workoutType: selectedType,
          startedAt: workoutStart.toISOString(),
        })
      }
      void refreshWorkoutHistory()
      setExIndex(exList.length - 1)
      setAnimDir('prev')
      setScreen('workout')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to reopen workout'))
    }
  }

  async function goBackToEditCardio() {
    try {
      if (sessionId) {
        const { error: deleteErr } = await supabase.from('workout_sessions').delete().eq('id', sessionId)
        if (deleteErr) throw new Error(deleteErr.message)
        setSessionId(null)
      }

      setScreen('cardio')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to reopen cardio log'))
    }
  }

  /* ─── Cardio flow ──────────────────────────────────────────────── */

  function startCardio() {
    setSelectedType(cardioKey)
    setCardioDistance(''); setCardioMinutes(''); setCardioFeel('')
    setCardioFasted(false); setWorkoutNotes(''); setWorkoutStart(new Date()); setWorkoutEnd(null)
    setWorkoutDate(format(new Date(), 'yyyy-MM-dd'))
    setScreen('cardio')
  }

  async function completeCardio() {
    if (!user) return

    setSaving(true)
    const timestamps = sessionTimestamps()
    const { data: session, error: err } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: user.id, workout_type: cardioKey,
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
    void refreshWorkoutHistory()
  }

  /* ─── Detail / Delete ──────────────────────────────────────────── */

  async function viewWorkoutDetail(session: WorkoutSession) {
    setDetailSession(session)
    if (!isCardioKey(session.workout_type)) {
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
    try {
      const { error: deleteSetsErr } = await supabase.from('workout_sets').delete().eq('session_id', id)
      if (deleteSetsErr) throw new Error(deleteSetsErr.message)

      const { error: deleteSessionErr } = await supabase.from('workout_sessions').delete().eq('id', id)
      if (deleteSessionErr) throw new Error(deleteSessionErr.message)

      setRecentWorkouts((prev) => prev.filter((s) => s.id !== id))
      setDeletingSessionId(null)
      if (detailSession?.id === id) setScreen('select')
      void refreshWorkoutHistory()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete workout'))
    }
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
    void refreshWorkoutHistory()
  }

  /* ─── Helpers ──────────────────────────────────────────────────── */

  function formatPrevSets(exerciseId: number): string {
    const sets = prevSets[exerciseId]
    if (!sets || sets.length === 0) return ''
    return sets.map((s) => `${s.weight_kg === -1 ? 'BW' : s.weight_kg + 'kg'} x ${s.reps}`).join('  /  ')
  }

  function calcVolume(sets: Record<number, LocalSet[]>): number {
    return Object.values(sets).flat().reduce((sum, s) => sum + Math.max(0, s.weight_kg) * s.reps, 0)
  }

  function calcPrevVolume(exerciseId: number): number {
    return (prevSets[exerciseId] ?? []).reduce((sum, s) => sum + Math.max(0, s.weight_kg) * s.reps, 0)
  }

  function calcExVolume(exerciseId: number): number {
    return (sessionSets[exerciseId] ?? []).reduce((sum, s) => sum + Math.max(0, s.weight_kg) * s.reps, 0)
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

  if (loading || categoriesLoading) {
    return <ScreenLoader />
  }

  /* ═════════════════════════════════════════════════════════════════
     PROGRESS SCREEN (delegated)
     ═════════════════════════════════════════════════════════════════ */

  if (screen === 'progress') {
    return <GymProgress userId={user?.id ?? ''} onBack={() => setScreen('select')} />
  }

  /* ═════════════════════════════════════════════════════════════════
     DETAIL SCREEN
     ═════════════════════════════════════════════════════════════════ */

  if (screen === 'detail' && detailSession) {
    const meta = metaFor(detailSession.workout_type)
    const isCardio = isCardioKey(detailSession.workout_type)
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
          {strengthCategories.map((cat, ti) => {
            const meta = metaFromCategory(cat)
            const exList = exercises[cat.key] ?? []
            const last = lastSessions[cat.key] ?? null
            return (
              <motion.div key={cat.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: ti * 0.08, duration: 0.25 }}
                className="rounded-xl border bg-card p-4"
                style={{ borderColor: 'var(--color-card-border)', borderLeftWidth: '3px', borderLeftColor: meta.color }}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-fg">{meta.label}</h3>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: meta.color + '18', color: meta.color }}>
                    {exList.length} exercise{exList.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {meta.desc && <p className="mb-1 text-sm text-muted">{meta.desc}</p>}
                {last?.completed_at && (
                  <p className="mb-3 text-xs text-dim">Last: {formatDistanceToNow(parseISO(last.completed_at), { addSuffix: true })}</p>
                )}
                {!last && <div className="mb-3" />}
                <div className="flex gap-2">
                  <button onClick={() => startWorkout(cat.key)}
                    className="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ backgroundColor: meta.color + '18', color: meta.color }}>
                    {exList.length > 0 ? 'Start Workout' : 'Add Exercises'}
                  </button>
                  <button onClick={() => { setSelectedType(cat.key); setDeletingExId(null); setNewExName(''); setScreen('manage') }}
                    className="rounded-lg border border-card-border px-4 py-2.5 text-sm text-muted transition-colors hover:text-fg">
                    Edit
                  </button>
                </div>
              </motion.div>
            )
          })}

          {/* Cardio card */}
          {cardioCategory && (() => {
            const meta = metaFromCategory(cardioCategory)
            const last = lastSessions[cardioCategory.key] ?? null
            return (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: strengthCategories.length * 0.08, duration: 0.25 }}
                className="rounded-xl border bg-card p-4"
                style={{ borderColor: 'var(--color-card-border)', borderLeftWidth: '3px', borderLeftColor: meta.color }}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-fg">{meta.label}</h3>
                </div>
                {meta.desc && <p className="mb-1 text-sm text-muted">{meta.desc}</p>}
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

          <button
            onClick={() => { setCatEditError(null); setDeletingCatId(null); setEditingCatId(null); setScreen('categories') }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-card-border bg-card py-3 text-sm font-semibold text-muted transition-colors hover:text-fg"
            aria-label="Adjust categories"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Adjust Categories
          </button>
        </div>

        {/* Recent Workouts */}
        {recentWorkouts.length > 0 && (() => {
          const perPage = 10
          const totalPages = Math.ceil(recentWorkouts.length / perPage)
          const page = Math.min(historyPage, totalPages - 1)
          const slice = recentWorkouts.slice(page * perPage, (page + 1) * perPage)
          return (
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">Recent Workouts</h2>
                {totalPages > 1 && (
                  <span className="text-xs text-dim">{page + 1} / {totalPages}</span>
                )}
              </div>
              <div className="space-y-2">
                {slice.map((session) => {
                  const meta = metaFor(session.workout_type)
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
              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button onClick={() => setHistoryPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                    className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-fg disabled:opacity-25">
                    Previous
                  </button>
                  <button onClick={() => setHistoryPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                    className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-fg disabled:opacity-25">
                    Next
                  </button>
                </div>
              )}
            </div>
          )
        })()}
      </div>
    )
  }

  /* ═════════════════════════════════════════════════════════════════
     MANAGE CATEGORIES SCREEN
     ═════════════════════════════════════════════════════════════════ */

  if (screen === 'categories') {
    async function handleAdd() {
      if (!user) return
      const label = newCatLabel.trim()
      if (!label) { setCatEditError('Name is required'); return }
      setAddingCat(true)
      setCatEditError(null)
      try {
        const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), -1)
        const created = await createCategory(user.id, {
          label,
          description: newCatDesc.trim() || null,
          color: newCatColor,
          sort_order: maxOrder + 1,
        })
        setCategories([...categories, created].sort((a, b) => a.sort_order - b.sort_order))
        setNewCatLabel('')
        setNewCatDesc('')
        setNewCatColor(CATEGORY_PALETTE[0])
      } catch (e: unknown) {
        setCatEditError(getErrorMessage(e, 'Failed to add category'))
      } finally {
        setAddingCat(false)
      }
    }

    function startEdit(c: WorkoutCategory) {
      setEditingCatId(c.id)
      setEditCatLabel(c.label)
      setEditCatDesc(c.description ?? '')
      setEditCatColor(c.color)
      setCatEditError(null)
    }

    async function handleSaveEdit(c: WorkoutCategory) {
      const label = editCatLabel.trim()
      if (!label) { setCatEditError('Name is required'); return }
      setCatEditError(null)
      try {
        const updated = await updateCategory(c.id, {
          label,
          description: editCatDesc.trim() || null,
          color: editCatColor,
        })
        setCategories(categories.map((x) => (x.id === c.id ? updated : x)))
        setEditingCatId(null)
      } catch (e: unknown) {
        setCatEditError(getErrorMessage(e, 'Failed to update'))
      }
    }

    async function handleDelete(c: WorkoutCategory) {
      if (c.is_builtin) { setCatEditError('Built-in categories cannot be deleted'); return }
      if (!confirm(`Delete "${c.label}"? Past workouts under this category will remain but lose their label.`)) return
      setDeletingCatId(c.id)
      setCatEditError(null)
      try {
        await deleteCategory(c.id)
        setCategories(categories.filter((x) => x.id !== c.id))
      } catch (e: unknown) {
        setCatEditError(getErrorMessage(e, 'Failed to delete'))
      } finally {
        setDeletingCatId(null)
      }
    }

    return (
      <div>
        <button onClick={() => { setScreen('select'); setCatEditError(null); setEditingCatId(null) }}
          className="mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>

        <h1 className="mb-1 text-xl font-bold text-fg">Workout Categories</h1>
        <p className="mb-4 text-sm text-muted">Rename, recolor, or add your own split (e.g. Upper, Lower, Full Body).</p>

        {catEditError && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{catEditError}</div>
        )}

        <div className="mb-6 space-y-2">
          {categories.map((c) => {
            const isEditing = editingCatId === c.id
            if (isEditing) {
              return (
                <div key={c.id} className="rounded-xl border border-card-border bg-card p-3">
                  <input
                    value={editCatLabel}
                    onChange={(e) => setEditCatLabel(e.target.value)}
                    placeholder="Name"
                    className="mb-2 w-full rounded-lg border border-card-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-teal"
                  />
                  <input
                    value={editCatDesc}
                    onChange={(e) => setEditCatDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="mb-2 w-full rounded-lg border border-card-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-teal"
                  />
                  <div className="mb-3 flex flex-wrap gap-2">
                    {CATEGORY_PALETTE.map((col) => (
                      <button key={col} onClick={() => setEditCatColor(col)}
                        className={`h-7 w-7 rounded-full border-2 transition-transform ${editCatColor === col ? 'scale-110 border-fg' : 'border-transparent'}`}
                        style={{ backgroundColor: col }}
                        aria-label={`Color ${col}`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveEdit(c)}
                      className="flex-1 rounded-lg bg-teal py-2 text-sm font-semibold text-bg hover:opacity-90">
                      Save
                    </button>
                    <button onClick={() => { setEditingCatId(null); setCatEditError(null) }}
                      className="flex-1 rounded-lg border border-card-border py-2 text-sm font-semibold text-fg hover:bg-card-border">
                      Cancel
                    </button>
                  </div>
                </div>
              )
            }
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-card-border bg-card p-3">
                <div className="h-10 w-10 flex-shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">
                    {c.label}
                    {c.is_cardio && <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-dim">Cardio</span>}
                    {c.is_builtin && !c.is_cardio && <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-dim">Default</span>}
                  </p>
                  {c.description && <p className="truncate text-xs text-muted">{c.description}</p>}
                </div>
                <button onClick={() => startEdit(c)}
                  className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold text-fg hover:bg-card-border">
                  Edit
                </button>
                {!c.is_builtin && (
                  <button onClick={() => handleDelete(c)}
                    disabled={deletingCatId === c.id}
                    className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50">
                    {deletingCatId === c.id ? '...' : 'Delete'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="rounded-xl border border-card-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-fg">Add Category</h2>
          <input
            value={newCatLabel}
            onChange={(e) => setNewCatLabel(e.target.value)}
            placeholder="e.g. Upper, Lower, Full Body"
            className="mb-2 w-full rounded-lg border border-card-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-teal"
          />
          <input
            value={newCatDesc}
            onChange={(e) => setNewCatDesc(e.target.value)}
            placeholder="Description (optional)"
            className="mb-3 w-full rounded-lg border border-card-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-teal"
          />
          <div className="mb-3 flex flex-wrap gap-2">
            {CATEGORY_PALETTE.map((col) => (
              <button key={col} onClick={() => setNewCatColor(col)}
                className={`h-7 w-7 rounded-full border-2 transition-transform ${newCatColor === col ? 'scale-110 border-fg' : 'border-transparent'}`}
                style={{ backgroundColor: col }}
                aria-label={`Color ${col}`}
              />
            ))}
          </div>
          <button onClick={handleAdd} disabled={addingCat || !newCatLabel.trim()}
            className="w-full rounded-lg bg-teal py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50">
            {addingCat ? 'Adding...' : 'Add Category'}
          </button>
        </div>
      </div>
    )
  }

  /* ═════════════════════════════════════════════════════════════════
     MANAGE EXERCISES SCREEN
     ═════════════════════════════════════════════════════════════════ */

  if (screen === 'manage') {
    const meta = metaFor(selectedType)
    const exList = exercises[selectedType] ?? []
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
    const meta = metaFromCategory(cardioCategory)
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
    const meta = metaFor(selectedType)
    const exList = exercises[selectedType] ?? []
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
              {isSkipped && (
                <button onClick={() => {
                  setSkippedExercises((prev) => { const next = new Set(prev); next.delete(ex.id); return next })
                  if (!sessionSets[ex.id]) {
                    const prev = prevSets[ex.id]
                    if (prev && prev.length > 0) {
                      setSessionSets((s) => ({ ...s, [ex.id]: prev.map((p) => ({ exercise_id: ex.id, set_number: p.set_number, weight_kg: p.weight_kg, reps: p.reps })) }))
                    } else {
                      setSessionSets((s) => ({ ...s, [ex.id]: [{ exercise_id: ex.id, set_number: 1, weight_kg: 0, reps: 0 }] }))
                    }
                  }
                }} className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-500 transition-opacity hover:opacity-80">
                  Skipped — tap to unskip
                </button>
              )}

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
                      const weightUp = prevSet && s.weight_kg > 0 && prevSet.weight_kg > 0 && s.weight_kg > prevSet.weight_kg
                      const repsUp = prevSet && s.reps > prevSet.reps
                      return (
                        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.15 }} className="flex items-center gap-2">
                          <span className="w-11 text-center text-sm font-semibold text-dim">{i + 1}</span>
                          <div className="relative flex-1">
                            <WeightInput
                              value={s.weight_kg}
                              onChange={(v) => updateSet(i, 'weight_kg', v)}
                              className={`w-full rounded-lg border bg-bg px-3 py-2.5 text-center text-sm font-medium text-fg placeholder-dim outline-none transition-colors focus:border-teal focus:ring-1 focus:ring-teal ${weightUp ? 'border-green-500/50' : 'border-card-border'}`} />
                            {weightUp && <span className="absolute -top-2 right-1 z-10 rounded-full border border-card-border bg-card px-1.5 py-0.5 text-[10px] font-bold leading-none text-green-500 shadow-sm">+{(s.weight_kg - prevSet.weight_kg).toFixed(1)}</span>}
                          </div>
                          <span className="w-4 text-center text-xs text-dim">x</span>
                          <div className="relative flex-1">
                            <input type="number" inputMode="numeric"
                              value={s.reps > 0 ? s.reps : ''}
                              onChange={(e) => { const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10); if (!isNaN(v)) updateSet(i, 'reps', v) }}
                              placeholder="0"
                              className={`w-full rounded-lg border bg-bg px-3 py-2.5 text-center text-sm font-medium text-fg placeholder-dim outline-none transition-colors focus:border-teal focus:ring-1 focus:ring-teal ${repsUp ? 'border-green-500/50' : 'border-card-border'}`} />
                            {repsUp && <span className="absolute -top-2 right-1 z-10 rounded-full border border-card-border bg-card px-1.5 py-0.5 text-[10px] font-bold leading-none text-green-500 shadow-sm">+{s.reps - prevSet.reps}</span>}
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
              {showAddMidWorkout && (
                <form onSubmit={addExerciseMidWorkout} className="mb-4 flex gap-2">
                  <input type="text" value={midWorkoutExName} onChange={(e) => setMidWorkoutExName(e.target.value)}
                    placeholder="New exercise name" autoFocus
                    className="flex-1 rounded-lg border border-card-border bg-bg px-3 py-2 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal" />
                  <button type="submit" disabled={!midWorkoutExName.trim()}
                    className="rounded-lg bg-teal/15 px-3 py-2 text-sm font-semibold text-teal disabled:opacity-50">Add</button>
                  <button type="button" onClick={() => { setShowAddMidWorkout(false); setMidWorkoutExName('') }}
                    className="rounded-lg border border-card-border px-3 py-2 text-sm text-muted">No</button>
                </form>
              )}
              <div className="mb-5 flex items-center gap-2">
                {!showAddMidWorkout && (
                  <button onClick={() => setShowAddMidWorkout(true)}
                    className="flex-1 basis-1/2 rounded-lg border border-card-border bg-card px-3 py-2.5 text-xs font-medium text-muted transition-colors hover:border-teal/50 hover:text-fg">
                    + Add New Exercise
                  </button>
                )}
                <button onClick={() => { setShowExList((v) => !v); setDeletingExId(null) }}
                  className="flex-1 basis-1/2 rounded-lg border border-card-border bg-card px-3 py-2.5 text-xs font-medium text-muted transition-colors hover:border-teal/50 hover:text-fg">
                  {showExList ? 'Hide Exercise List' : 'Exercise List'}
                </button>
              </div>

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
                  {saving ? 'Saving...' : isLast ? 'Summary' : 'Complete & Next'}
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
    const meta = metaFor(selectedType)
    const isCardio = isCardioKey(selectedType)
    const summaryActionBarClass = 'sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] mt-6 grid grid-cols-2 gap-3 rounded-3xl bg-bg/92 pb-1 pt-4 backdrop-blur-md'

    if (isCardio) {
      return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="pb-28">
          <div className="rounded-[28px] border border-card-border bg-card/55 px-5 pb-5 pt-6 text-center shadow-sm backdrop-blur-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: meta.color + '18' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h1 className="mb-1 text-2xl font-bold text-fg">Cardio Summary</h1>
            <div className="mb-2 flex items-center justify-center gap-2">
              <span className="text-sm" style={{ color: meta.color }}>Cardio</span>
              {cardioFasted && <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[11px] font-bold text-teal">F</span>}
            </div>
            <p className="text-sm text-secondary">Review the session, add notes, or jump back in to edit before finishing.</p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {cardioDistance && (
              <div className="rounded-2xl border border-card-border bg-card p-4 text-center shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Distance</p>
                <p className="mt-1 text-lg font-bold text-fg">{cardioDistance} km</p>
              </div>
            )}
            {cardioMinutes && (
              <div className="rounded-2xl border border-card-border bg-card p-4 text-center shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Time</p>
                <p className="mt-1 text-lg font-bold text-fg">{cardioMinutes} min</p>
              </div>
            )}
          </div>
          {cardioFeel && (
            <div className="mt-5 rounded-2xl border border-card-border bg-card px-4 py-4 shadow-sm">
              <p className="text-xs text-dim">How it felt</p>
              <p className="mt-1 text-sm text-fg">{cardioFeel}</p>
            </div>
          )}
          <div className="mt-6 rounded-2xl border border-card-border bg-card px-4 py-4 shadow-sm">
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-dim">Notes (optional)</label>
            <textarea value={workoutNotes} onChange={(e) => setWorkoutNotes(e.target.value)}
              placeholder="Anything else to note?" rows={2}
              className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal resize-none" />
          </div>
          <div className={summaryActionBarClass}>
            <button onClick={goBackToEditCardio}
              className="rounded-2xl border border-card-border bg-card py-3.5 text-sm font-semibold text-muted transition-colors hover:text-fg">
              Go Back & Edit
            </button>
            <button onClick={saveNotesAndFinish}
              className="rounded-2xl bg-teal py-3.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90">
              Finish Workout
            </button>
          </div>
        </motion.div>
      )
    }

    // Strength workout complete
    const exList = exercises[selectedType] ?? []
    const totalVolume = calcVolume(sessionSets)
    const prevTotalVolume = Object.keys(prevSets).length > 0
      ? Object.values(prevSets).flat().reduce((sum, s) => sum + Math.max(0, s.weight_kg) * s.reps, 0) : 0
    const totalSetsCount = Object.values(sessionSets).flat().filter((s) => s.weight_kg > 0 || s.weight_kg === -1 || s.reps > 0).length
    const volumeDiff = totalVolume - prevTotalVolume
    const durationLabel = workoutStart && workoutEnd
      ? formatWorkoutDuration(workoutStart.toISOString(), workoutEnd)
      : durationStr()
    const summaryTone = volumeDiff === 0
      ? 'border-card-border bg-card text-secondary'
      : volumeDiff > 0
        ? 'border-green-500/20 bg-green-500/5 text-green-500'
        : 'border-red-500/20 bg-red-500/5 text-red-500'
    const summaryCopy = volumeDiff === 0
      ? 'Matched the volume from your last session'
      : `${volumeDiff > 0 ? 'Volume up' : 'Volume down'} ${Math.abs(Math.round(volumeDiff)).toLocaleString()} kg`

    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="pb-28">
        <div className="rounded-[28px] border border-card-border bg-card/55 px-5 pb-5 pt-6 text-center shadow-sm backdrop-blur-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: meta.color + '18' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 className="mb-1 text-2xl font-bold text-fg">Workout Summary</h1>
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="text-sm" style={{ color: meta.color }}>{meta.label} Day</span>
            {isFasted && <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[11px] font-bold text-teal">F</span>}
          </div>
          <p className="text-sm text-secondary">Review the session, add notes, or jump back in to edit before finishing.</p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-card-border bg-card p-4 text-center shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Duration</p>
            <p className="mt-1 text-lg font-bold text-fg">{durationLabel}</p>
          </div>
          <div className="rounded-2xl border border-card-border bg-card p-4 text-center shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Sets</p>
            <p className="mt-1 text-lg font-bold text-fg">{totalSetsCount}</p>
          </div>
          <div className="col-span-2 rounded-[24px] border border-card-border bg-card p-5 text-center shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-wider text-dim">Volume</p>
            <p className="mt-2 text-3xl font-bold tabular-nums" style={{ color: meta.color }}>
              {Math.round(totalVolume).toLocaleString()} kg
            </p>
          </div>
        </div>

        {prevTotalVolume > 0 && (
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-center text-sm font-medium shadow-sm ${
            summaryTone
          }`}>
            {summaryCopy}
            {volumeDiff !== 0 && ` (${volumeDiff >= 0 ? '+' : ''}${((volumeDiff / prevTotalVolume) * 100).toFixed(1)}%) vs last session`}
          </div>
        )}

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Exercise Summary</h2>
            <span className="text-xs text-dim">{exList.length} exercises</span>
          </div>
        <div className="space-y-3">
          {exList.map((exercise) => {
            const isSkipped = skippedExercises.has(exercise.id)
            if (isSkipped) {
              return (
                <div key={exercise.id} className="rounded-2xl border border-card-border bg-card px-4 py-4 opacity-60 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-fg">{exercise.name}</span>
                      <p className="mt-1 text-xs text-dim">No sets recorded in this session.</p>
                    </div>
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-500">Skipped</span>
                  </div>
                </div>
              )
            }
            const exSets = sessionSets[exercise.id] ?? []
            const validSets = exSets.filter((s) => s.weight_kg > 0 || s.weight_kg === -1 || s.reps > 0)
            if (validSets.length === 0) return null
            const vol = calcExVolume(exercise.id)
            const prevVol = calcPrevVolume(exercise.id)
            const diff = vol - prevVol
            return (
              <div key={exercise.id} className="rounded-2xl border border-card-border bg-card px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg">{exercise.name}</p>
                    <p className="mt-1 text-xs text-dim">{validSets.length} set{validSets.length !== 1 ? 's' : ''} recorded</p>
                  </div>
                  {prevVol > 0 && (
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${diff === 0 ? 'border border-card-border text-secondary' : diff > 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {diff === 0 ? 'No change' : `${diff >= 0 ? '+' : ''}${Math.round(diff)} kg`}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {validSets.map((set, index) => (
                    <span
                      key={`${exercise.id}-${index}`}
                      className="rounded-full border border-card-border bg-bg px-2.5 py-1 text-xs font-medium text-secondary"
                    >
                      {set.weight_kg === -1 ? 'BW' : `${set.weight_kg}kg`} x {set.reps}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        </div>

        <div className="mt-6 rounded-2xl border border-card-border bg-card px-4 py-4 shadow-sm">
          <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-dim">Notes (optional)</label>
          <textarea value={workoutNotes} onChange={(e) => setWorkoutNotes(e.target.value)}
            placeholder="How was the workout? Anything to note?" rows={2}
            className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal resize-none" />
        </div>

        <div className={summaryActionBarClass}>
          <button onClick={goBackToEditWorkout}
            className="rounded-2xl border border-card-border bg-card py-3.5 text-sm font-semibold text-muted transition-colors hover:text-fg">
            Go Back & Edit
          </button>
          <button onClick={saveNotesAndFinish}
            className="rounded-2xl bg-teal py-3.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90">
            Finish Workout
          </button>
        </div>
      </motion.div>
    )
  }

  return null
}
