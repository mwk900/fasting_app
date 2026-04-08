import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import type { WeightLog } from '../../types'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

export default function WeightTab() {
  const [entries, setEntries] = useState<WeightLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchEntries()
  }, [])

  async function fetchEntries() {
    setError(null)
    const { data, error: err } = await supabase
      .from('weight_log')
      .select('*')
      .order('logged_date', { ascending: true })
    if (err) { setError('Failed to load weight data'); setLoading(false); return }
    setEntries(data ?? [])
    setLoading(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!weight) return
    setSaving(true)
    setError(null)

    const { error: err } = await supabase.from('weight_log').insert({
      logged_date: date,
      weight_kg: parseFloat(weight),
      notes: notes || null,
    })

    if (err) { setError('Failed to save entry'); setSaving(false); return }
    setWeight('')
    setNotes('')
    setSaving(false)
    fetchEntries()
  }

  const chartData = entries.map((e) => ({
    date: format(new Date(e.logged_date), 'd MMM'),
    weight_kg: e.weight_kg,
  }))

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-fg">Weight</h1>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</p>
      )}

      <form onSubmit={handleSave} className="space-y-3 rounded-xl border border-card-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg outline-none focus:border-teal focus:ring-1 focus:ring-teal"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Weight (kg)</label>
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="82.5"
              required
              className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-secondary">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Morning weigh-in"
            className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !weight}
          className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className="mt-8">
        {entries.length === 0 ? (
          <p className="py-12 text-center text-muted">No weight entries yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-chart-grid)" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="var(--color-chart-axis)"
                tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--color-chart-axis)"
                tick={{ fontSize: 11, fill: 'var(--color-chart-tick)' }}
                tickLine={false}
                axisLine={false}
                domain={['dataMin - 1', 'dataMax + 1']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-tooltip-bg)',
                  border: '1px solid var(--color-tooltip-border)',
                  borderRadius: '8px',
                  color: 'var(--color-fg)',
                  fontSize: '13px',
                }}
              />
              <Line
                type="monotone"
                dataKey="weight_kg"
                stroke="#00D4C8"
                strokeWidth={2}
                dot={{ fill: '#00D4C8', r: 3 }}
                activeDot={{ r: 5, fill: '#00D4C8' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
