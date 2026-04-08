import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import type { Measurement } from '../../types'

const FIELDS: { key: keyof Measurement; label: string; unit: string }[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg' },
  { key: 'neck_cm', label: 'Neck', unit: 'cm' },
  { key: 'chest_cm', label: 'Chest', unit: 'cm' },
  { key: 'waist_cm', label: 'Waist', unit: 'cm' },
  { key: 'hips_cm', label: 'Hips', unit: 'cm' },
  { key: 'thigh_cm', label: 'Thigh', unit: 'cm' },
  { key: 'calf_cm', label: 'Calf', unit: 'cm' },
  { key: 'body_fat_pct', label: 'Body Fat', unit: '%' },
]

export default function MeasurementsTab() {
  const [entries, setEntries] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [form, setForm] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchEntries()
  }, [])

  async function fetchEntries() {
    setError(null)
    const { data, error: err } = await supabase
      .from('measurements')
      .select('*')
      .order('logged_date', { ascending: false })
    if (err) { setError('Failed to load measurements'); setLoading(false); return }
    setEntries(data ?? [])
    setLoading(false)
  }

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const row: Record<string, unknown> = { logged_date: date, notes: notes || null }
    for (const f of FIELDS) {
      const v = form[f.key]
      row[f.key] = v ? parseFloat(v) : null
    }

    const { error: err } = await supabase.from('measurements').insert(row)
    if (err) { setError('Failed to save measurement'); setSaving(false); return }

    setForm({})
    setNotes('')
    setSaving(false)
    fetchEntries()
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-fg">Measurements</h1>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</p>
      )}

      <form onSubmit={handleSave} className="space-y-3 rounded-xl border border-card-border bg-card p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-secondary">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg outline-none focus:border-teal focus:ring-1 focus:ring-teal"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-medium text-secondary">
                {f.label} ({f.unit})
              </label>
              <input
                type="number"
                step="0.1"
                value={form[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder="—"
                className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal"
              />
            </div>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-secondary">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Morning measurement"
            className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className="mt-8">
        {entries.length === 0 ? (
          <p className="py-12 text-center text-muted">No measurements logged yet.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.25 }}
                className="rounded-xl border border-card-border bg-card p-4"
              >
                <p className="text-sm font-medium text-fg">
                  {format(new Date(m.logged_date), 'd MMM yyyy')}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-secondary">
                  {m.weight_kg != null && <span>Weight: {m.weight_kg} kg</span>}
                  {m.waist_cm != null && <span>Waist: {m.waist_cm} cm</span>}
                  {m.body_fat_pct != null && <span>BF: {m.body_fat_pct}%</span>}
                  {m.neck_cm != null && <span>Neck: {m.neck_cm} cm</span>}
                  {m.chest_cm != null && <span>Chest: {m.chest_cm} cm</span>}
                  {m.hips_cm != null && <span>Hips: {m.hips_cm} cm</span>}
                  {m.thigh_cm != null && <span>Thigh: {m.thigh_cm} cm</span>}
                  {m.calf_cm != null && <span>Calf: {m.calf_cm} cm</span>}
                </div>
                {m.notes && (
                  <p className="mt-1.5 text-sm text-muted">{m.notes}</p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
