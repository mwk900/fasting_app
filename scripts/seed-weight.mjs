import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://epjpkyobecsckzfedfdp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwanBreW9iZWNzY2t6ZmVkZmRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NDA0NTEsImV4cCI6MjA5MTIxNjQ1MX0.6ehs-b8Y6PYnnluoV3LOhDKGdzU_TCyv4gYzf4mAcHM',
)

const entries = [
  { logged_date: '2026-01-15', weight_kg: 100.0, notes: 'Start' },
  { logged_date: '2026-01-20', weight_kg: 100.0, notes: null },
  { logged_date: '2026-01-21', weight_kg: 100.5, notes: null },
  { logged_date: '2026-01-22', weight_kg: 100.4, notes: null },
  { logged_date: '2026-01-23', weight_kg: 100.5, notes: null },
  { logged_date: '2026-01-24', weight_kg: 99.5, notes: null },
  { logged_date: '2026-01-25', weight_kg: 99.9, notes: null },
  { logged_date: '2026-01-27', weight_kg: 100.5, notes: null },
  { logged_date: '2026-01-29', weight_kg: 99.5, notes: null },
  { logged_date: '2026-01-30', weight_kg: 99.2, notes: null },
  { logged_date: '2026-01-31', weight_kg: 99.1, notes: null },
  { logged_date: '2026-02-01', weight_kg: 99.1, notes: null },
  { logged_date: '2026-02-02', weight_kg: 99.9, notes: null },
  { logged_date: '2026-02-03', weight_kg: 99.3, notes: null },
  { logged_date: '2026-02-05', weight_kg: 99.2, notes: 'after leg day' },
  { logged_date: '2026-02-06', weight_kg: 99.9, notes: null },
  { logged_date: '2026-02-07', weight_kg: 99.9, notes: null },
  { logged_date: '2026-02-08', weight_kg: 100.5, notes: null },
  { logged_date: '2026-02-10', weight_kg: 99.9, notes: null },
  { logged_date: '2026-02-11', weight_kg: 100.6, notes: null },
  { logged_date: '2026-02-12', weight_kg: 100.6, notes: null },
  { logged_date: '2026-02-13', weight_kg: 100.5, notes: null },
  { logged_date: '2026-02-14', weight_kg: 100.1, notes: null },
  { logged_date: '2026-02-15', weight_kg: 100.3, notes: 'after chest PR, 142.5kg' },
  { logged_date: '2026-02-17', weight_kg: 100.6, notes: 'after leg day PR 122.5kg' },
  { logged_date: '2026-02-19', weight_kg: 100.1, notes: null },
  { logged_date: '2026-02-21', weight_kg: 99.9, notes: null },
  { logged_date: '2026-02-25', weight_kg: 100.5, notes: null },
  { logged_date: '2026-03-02', weight_kg: 99.7, notes: null },
  { logged_date: '2026-03-03', weight_kg: 100.6, notes: null },
  { logged_date: '2026-03-08', weight_kg: 100.3, notes: null },
  { logged_date: '2026-03-10', weight_kg: 100.7, notes: 'post legs, fragmented sleep' },
  { logged_date: '2026-03-12', weight_kg: 98.8, notes: 'post fast 36hrs' },
  { logged_date: '2026-03-13', weight_kg: 100.9, notes: null },
  { logged_date: '2026-03-15', weight_kg: 100.8, notes: null },
  { logged_date: '2026-03-17', weight_kg: 101.5, notes: null },
  { logged_date: '2026-03-18', weight_kg: 99.7, notes: 'post fast 36hrs' },
  { logged_date: '2026-03-19', weight_kg: 101.1, notes: null },
  { logged_date: '2026-03-24', weight_kg: 101.8, notes: null },
  { logged_date: '2026-03-25', weight_kg: 99.5, notes: 'post fast 36hrs' },
  { logged_date: '2026-03-26', weight_kg: 102.0, notes: null },
  { logged_date: '2026-03-27', weight_kg: 101.1, notes: null },
  { logged_date: '2026-03-28', weight_kg: 102.0, notes: null },
  { logged_date: '2026-03-29', weight_kg: 102.0, notes: '132kg PR squat' },
  { logged_date: '2026-03-30', weight_kg: 102.7, notes: null },
  { logged_date: '2026-03-31', weight_kg: 101.8, notes: null },
  { logged_date: '2026-04-01', weight_kg: 100.3, notes: 'post fast 40hrs' },
  { logged_date: '2026-04-03', weight_kg: 102.6, notes: null },
  { logged_date: '2026-04-05', weight_kg: 102.5, notes: null },
  { logged_date: '2026-04-07', weight_kg: 102.0, notes: null },
  { logged_date: '2026-04-08', weight_kg: 100.2, notes: 'post fast 40hrs' },
]

console.log(`Inserting ${entries.length} weight entries...`)

const { data, error } = await supabase
  .from('weight_log')
  .insert(entries)
  .select()

if (error) {
  console.error('Error:', error.message)
  process.exit(1)
}

console.log(`Successfully inserted ${data.length} entries.`)
