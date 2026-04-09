export interface ActiveFast {
  id: number
  start_time: string | null
  is_active: boolean
}

export interface Fast {
  id: number
  start_time: string
  end_time: string
  duration_minutes: number
  end_weight_kg: number | null
  notes: string | null
  created_at: string
}

export interface WeightLog {
  id: number
  logged_date: string
  weight_kg: number
  notes: string | null
  created_at: string
}

export interface Measurement {
  id: number
  logged_date: string
  weight_kg: number | null
  neck_cm: number | null
  chest_cm: number | null
  waist_cm: number | null
  hips_cm: number | null
  thigh_cm: number | null
  calf_cm: number | null
  body_fat_pct: number | null
  notes: string | null
  created_at: string
}

export type WorkoutType = 'push' | 'pull' | 'legs' | 'cardio'

export interface Exercise {
  id: number
  user_id: string
  name: string
  workout_type: WorkoutType
  sort_order: number
  created_at: string
}

export interface WorkoutSession {
  id: number
  user_id: string
  workout_type: WorkoutType
  started_at: string
  completed_at: string | null
  notes: string | null
  is_fasted: boolean
  distance_km: number | null
  duration_minutes: number | null
  feel_note: string | null
  created_at: string
}

export interface WorkoutSet {
  id: number
  user_id: string
  session_id: number
  exercise_id: number
  set_number: number
  weight_kg: number
  reps: number
  created_at: string
}
