import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Measurement } from '../../types'
import DateInput from '../DateInput'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

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

const FIELD_COLORS: Record<string, string> = {
  weight_kg: '#00D4C8',
  neck_cm: '#F59E0B',
  chest_cm: '#8B5CF6',
  waist_cm: '#EF4444',
  hips_cm: '#EC4899',
  thigh_cm: '#3B82F6',
  calf_cm: '#10B981',
  body_fat_pct: '#F97316',
}

export default function MeasurementsTab() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [form, setForm] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [visibleFields, setVisibleFields] = useState<Set<string>>(
    () => new Set(FIELDS.map((f) => f.key)),
  )
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [logPage, setLogPage] = useState(0)
  const LOG_PAGE_SIZE = 10

  useEffect(() => {
    if (user) fetchEntries()
  }, [user])

  async function fetchEntries() {
    setError(null)
    const { data, error: err } = await supabase
      .from('measurements')
      .select('*')
      .eq('user_id', user!.id)
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

    row.user_id = user!.id
    const { error: err } = await supabase.from('measurements').insert(row)
    if (err) { setError('Failed to save measurement'); setSaving(false); return }

    setForm({})
    setNotes('')
    setSaving(false)
    fetchEntries()
  }

  async function deleteEntry(id: number) {
    setError(null)
    const { error: err } = await supabase.from('measurements').delete().eq('id', id)
    if (err) { setError('Failed to delete entry'); return }
    setEntries((prev) => prev.filter((e) => e.id !== id))
    setDeletingId(null)
  }

  function toggleAllFields() {
    setVisibleFields((prev) =>
      prev.size === FIELDS.length ? new Set() : new Set(FIELDS.map((f) => f.key)),
    )
  }

  function toggleField(key: string) {
    setVisibleFields((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Compute % change from first recorded value per category (ascending order)
  const pctChangeData = useMemo(() => {
    if (entries.length < 2) return []
    const asc = [...entries].reverse() // entries are desc, reverse to asc
    // Find first non-null value for each field
    const baseline: Record<string, number> = {}
    for (const f of FIELDS) {
      for (const e of asc) {
        const v = e[f.key] as number | null
        if (v != null) { baseline[f.key] = v; break }
      }
    }
    return asc.map((e) => {
      const point: Record<string, unknown> = {
        date: format(parseISO(e.logged_date), 'dd/MM'),
        fullDate: e.logged_date,
      }
      for (const f of FIELDS) {
        const v = e[f.key] as number | null
        const base = baseline[f.key]
        if (v != null && base != null && base !== 0) {
          point[f.key] = parseFloat((((v - base) / base) * 100).toFixed(1))
        } else {
          point[f.key] = null
        }
      }
      return point
    })
  }, [entries])

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
          <DateInput
            value={date}
            onChange={setDate}
            required
            className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="min-w-0">
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

      {/* % Change chart */}
      {pctChangeData.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-fg">% Change from First Entry</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              onClick={toggleAllFields}
              className="rounded-lg border border-card-border px-2.5 py-1 text-[11px] font-semibold text-secondary transition-colors hover:text-fg"
            >
              {visibleFields.size === FIELDS.length ? 'Deselect All' : 'Select All'}
            </button>
            {FIELDS.map((f) => (
              <button
                key={f.key}
                onClick={() => toggleField(f.key)}
                className="rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors"
                style={{
                  backgroundColor: visibleFields.has(f.key)
                    ? FIELD_COLORS[f.key] + '22'
                    : 'var(--color-card)',
                  color: visibleFields.has(f.key)
                    ? FIELD_COLORS[f.key]
                    : 'var(--color-dim)',
                  border: `1px solid ${
                    visibleFields.has(f.key)
                      ? FIELD_COLORS[f.key] + '55'
                      : 'var(--color-card-border)'
                  }`,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={pctChangeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
                tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`}
                width={52}
              />
              <Tooltip
                cursor={{ stroke: 'var(--color-dim)', strokeWidth: 1, strokeDasharray: '4 2' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div
                      style={{
                        backgroundColor: 'var(--color-tooltip-bg)',
                        border: '1px solid var(--color-tooltip-border)',
                        borderRadius: '8px',
                        color: 'var(--color-fg)',
                        fontSize: '13px',
                        padding: '8px 12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      }}
                    >
                      <p className="mb-1 text-xs text-secondary">
                        {d?.fullDate ? format(parseISO(d.fullDate), 'dd/MM/yyyy') : label}
                      </p>
                      {payload
                        .filter((p: any) => p.value != null)
                        .map((p: any) => {
                          const field = FIELDS.find((f) => f.key === p.dataKey)
                          return (
                            <p key={p.dataKey} style={{ color: p.color }} className="text-xs font-medium">
                              {field?.label}: {p.value > 0 ? '+' : ''}{p.value}%
                            </p>
                          )
                        })}
                    </div>
                  )
                }}
              />
              {FIELDS.filter((f) => visibleFields.has(f.key)).map((f) => (
                <Line
                  key={f.key}
                  type="monotone"
                  dataKey={f.key}
                  stroke={FIELD_COLORS[f.key]}
                  strokeWidth={2}
                  dot={{ fill: FIELD_COLORS[f.key], r: 2.5 }}
                  activeDot={{ r: 4.5 }}
                  connectNulls
                  animationDuration={200}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Measurement log */}
      <div className="mt-8">
        {entries.length === 0 ? (
          <p className="py-12 text-center text-muted">No measurements logged yet.</p>
        ) : (() => {
          const totalPages = Math.ceil(entries.length / LOG_PAGE_SIZE)
          const pageEntries = entries.slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE)
          return (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">Log</h2>
                <span className="text-xs text-dim">{entries.length} entries</span>
              </div>
              <div className="space-y-3">
                {pageEntries.map((m, i) => {
                  const isConfirming = deletingId === m.id
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.25 }}
                      className="rounded-xl border border-card-border bg-card p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-fg">
                            {format(parseISO(m.logged_date), 'dd/MM/yyyy')}
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
                        </div>
                        <div className="ml-3 flex-shrink-0">
                          {isConfirming ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => deleteEntry(m.id)}
                                className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="rounded-lg border border-card-border px-2.5 py-1 text-[11px] font-medium text-secondary transition-colors hover:text-fg"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingId(m.id)}
                              className="p-1 text-muted transition-colors hover:text-red-500"
                              aria-label="Delete entry"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    onClick={() => setLogPage((p) => Math.max(0, p - 1))}
                    disabled={logPage === 0}
                    className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold text-secondary transition-colors hover:text-fg disabled:opacity-30 disabled:hover:text-secondary"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-dim">
                    {logPage + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setLogPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={logPage >= totalPages - 1}
                    className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-semibold text-secondary transition-colors hover:text-fg disabled:opacity-30 disabled:hover:text-secondary"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}
