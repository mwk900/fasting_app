import { supabase } from './supabase'
import type { WorkoutCategory } from '../types'

export const DEFAULT_CATEGORIES: Omit<WorkoutCategory, 'id' | 'user_id' | 'created_at'>[] = [
  { key: 'push',   label: 'Push',   description: 'Chest, shoulders, triceps',          color: '#f97316', sort_order: 0, is_cardio: false, is_builtin: true },
  { key: 'pull',   label: 'Pull',   description: 'Back, biceps, rear delts',           color: '#8b5cf6', sort_order: 1, is_cardio: false, is_builtin: true },
  { key: 'legs',   label: 'Legs',   description: 'Quads, hamstrings, glutes, calves',  color: '#22c55e', sort_order: 2, is_cardio: false, is_builtin: true },
  { key: 'cardio', label: 'Cardio', description: 'Running, cycling, swimming',         color: '#06b6d4', sort_order: 3, is_cardio: true,  is_builtin: true },
]

export const CATEGORY_PALETTE = [
  '#f97316', '#8b5cf6', '#22c55e', '#06b6d4',
  '#ef4444', '#eab308', '#ec4899', '#14b8a6',
  '#3b82f6', '#a855f7', '#f59e0b', '#10b981',
]

export async function loadCategories(userId: string): Promise<WorkoutCategory[]> {
  const { data, error } = await supabase
    .from('workout_categories')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
  if (error) throw error

  if (!data || data.length === 0) {
    return await seedDefaults(userId)
  }
  return data as WorkoutCategory[]
}

async function seedDefaults(userId: string): Promise<WorkoutCategory[]> {
  const rows = DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id: userId }))
  const { data, error } = await supabase
    .from('workout_categories')
    .insert(rows)
    .select()
  if (error) throw error
  return (data as WorkoutCategory[]).sort((a, b) => a.sort_order - b.sort_order)
}

export async function createCategory(
  userId: string,
  input: { label: string; description: string | null; color: string; sort_order: number },
): Promise<WorkoutCategory> {
  const key = slugify(input.label) || `custom-${Date.now()}`
  const { data, error } = await supabase
    .from('workout_categories')
    .insert({
      user_id: userId,
      key,
      label: input.label,
      description: input.description,
      color: input.color,
      sort_order: input.sort_order,
      is_cardio: false,
      is_builtin: false,
    })
    .select()
    .single()
  if (error) throw error
  return data as WorkoutCategory
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<WorkoutCategory, 'label' | 'description' | 'color' | 'sort_order'>>,
): Promise<WorkoutCategory> {
  const { data, error } = await supabase
    .from('workout_categories')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as WorkoutCategory
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('workout_categories').delete().eq('id', id)
  if (error) throw error
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
