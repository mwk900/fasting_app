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
