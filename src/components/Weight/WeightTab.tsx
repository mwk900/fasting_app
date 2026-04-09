import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { format, subDays, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { WeightLog } from '../../types'
import DateInput from '../DateInput'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
} from 'recharts'

type RangeKey = '14d' | '30d' | '90d' | 'all'
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '14d', label: '14D', days: 14 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: 'all', label: 'All', days: null },
]

/** Pick a visually pleasant tick step for the given data span */
function niceStep(span: number): number {
  if (span <= 1) return 0.2
  if (span <= 3) return 0.5
  if (span <= 8) return 1
  if (span <= 20) return 2
  if (span <= 50) return 5
  return 10
}

export default function WeightTab() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<WeightLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [range, setRange] = useState<RangeKey>('14d')

  // Visible window [startIdx, endIdx] into chartData. null → derive from range.
  const [activeWindow, setActiveWindow] = useState<[number, number] | null>(null)

  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [logPage, setLogPage] = useState(0)
  const LOG_PAGE_SIZE = 10

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')

  const chartContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user) fetchEntries()
  }, [user])

  async function fetchEntries() {
    setError(null)
    const { data, error: err } = await supabase
      .from('weight_log')
      .select('*')
      .eq('user_id', user!.id)
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
      user_id: user!.id,
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

  async function deleteEntry(id: number) {
    setError(null)
    const { error: err } = await supabase.from('weight_log').delete().eq('id', id)
    if (err) { setError('Failed to delete entry'); return }
    setEntries((prev) => prev.filter((e) => e.id !== id))
    setDeletingId(null)
  }

  const chartData = useMemo(
    () =>
      entries.map((e) => ({
        date: format(parseISO(e.logged_date), 'dd/MM'),
        fullDate: e.logged_date,
        weight_kg: e.weight_kg,
        notes: e.notes,
      })),
    [entries],
  )

  // Default window derived from the range selector
  const defaultWindow = useMemo<[number, number]>(() => {
    if (chartData.length === 0) return [0, 0]
    const end = chartData.length - 1
    if (range === 'all') return [0, end]
    const days = RANGES.find((r) => r.key === range)!.days!
    const cutoff = format(subDays(new Date(), days), 'yyyy-MM-dd')
    let start = chartData.findIndex((d) => d.fullDate >= cutoff)
    if (start < 0) start = 0
    return [start, end]
  }, [chartData, range])

  const [viewStart, viewEnd] = activeWindow ?? defaultWindow

  // Data in the current view (for Y-axis computation)
  const visibleSlice = useMemo(
    () => chartData.slice(viewStart, viewEnd + 1),
    [chartData, viewStart, viewEnd],
  )

  // Compute Y-axis domain and explicit ticks from visible data
  const { yDomain, yTicks, yStep } = useMemo(() => {
    if (visibleSlice.length === 0)
      return { yDomain: [0, 100] as [number, number], yTicks: [] as number[], yStep: 10 }

    const weights = visibleSlice.map((d) => d.weight_kg)
    const min = Math.min(...weights)
    const max = Math.max(...weights)
    const span = max - min || 0.5
    const step = niceStep(span)

    const lo = parseFloat((Math.floor((min - step * 0.5) / step) * step).toFixed(1))
    const hi = parseFloat((Math.ceil((max + step * 0.5) / step) * step).toFixed(1))

    const ticks: number[] = []
    for (let v = lo; v <= hi + step * 0.001; v += step) {
      ticks.push(parseFloat(v.toFixed(1)))
    }

    return { yDomain: [lo, hi] as [number, number], yTicks: ticks, yStep: step }
  }, [visibleSlice])

  // Brush onChange → keep window in sync
  const handleBrushChange = useCallback(
    (brushRange: { startIndex?: number; endIndex?: number }) => {
      if (brushRange.startIndex != null && brushRange.endIndex != null) {
        const s = brushRange.startIndex
        const e = brushRange.endIndex
        setActiveWindow((prev) => {
          if (prev && prev[0] === s && prev[1] === e) return prev
          return [s, e]
        })
      }
    },
    [],
  )

  // Wheel zoom: scroll up → zoom in, scroll down → zoom out (TradingView-style)
  useEffect(() => {
    const el = chartContainerRef.current
    if (!el || chartData.length < 3) return

    function handleWheel(e: WheelEvent) {
      e.preventDefault()
      const total = chartData.length
      const size = viewEnd - viewStart

      // ~12% of current window per scroll tick
      const zoomAmount = Math.max(1, Math.round(size * 0.12))
      const delta = e.deltaY > 0 ? zoomAmount : -zoomAmount

      let newStart = viewStart - delta
      let newEnd = viewEnd + delta

      // Minimum 3 data points visible
      if (newEnd - newStart < 3) {
        const center = Math.round((viewStart + viewEnd) / 2)
        newStart = center - 1
        newEnd = center + 1
      }

      newStart = Math.max(0, newStart)
      newEnd = Math.min(total - 1, newEnd)

      setActiveWindow([newStart, newEnd])
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [chartData.length, viewStart, viewEnd])

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    )
  }

  const isCustomWindow = activeWindow !== null

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-fg">Weight</h1>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</p>
      )}

      <form onSubmit={handleSave} className="space-y-3 rounded-xl border border-card-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium text-secondary">Date</label>
            <DateInput
              value={date}
              onChange={setDate}
              className="w-full max-w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg"
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium text-secondary">Weight (kg)</label>
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="82.5"
              required
              className="w-full max-w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal"
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
          {saving ? 'Saving\u2026' : 'Save'}
        </button>
      </form>

      <div className="mt-8">
        {entries.length === 0 ? (
          <p className="py-12 text-center text-muted">No weight entries yet.</p>
        ) : (
          <>
            {/* Range buttons + reset */}
            <div className="mb-3 flex items-center gap-2">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => { setRange(r.key); setActiveWindow(null) }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    range === r.key && !isCustomWindow
                      ? 'bg-teal text-bg'
                      : 'bg-card text-secondary border border-card-border hover:text-fg'
                  }`}
                >
                  {r.label}
                </button>
              ))}
              {isCustomWindow && (
                <button
                  onClick={() => setActiveWindow(null)}
                  className="ml-auto rounded-lg border border-card-border bg-card px-3 py-1.5 text-xs font-semibold text-secondary hover:text-fg transition-colors"
                >
                  Reset
                </button>
              )}
            </div>

            <p className="mb-2 text-[11px] text-dim">Scroll to zoom \u00B7 Drag slider to pan</p>

            <div ref={chartContainerRef}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
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
                    domain={yDomain}
                    ticks={yTicks}
                    tickFormatter={(v: number) => v.toFixed(yStep < 1 ? 1 : 0)}
                    width={46}
                    allowDataOverflow
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--color-dim)', strokeWidth: 1, strokeDasharray: '4 2' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
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
                          <p className="font-semibold">{d.weight_kg} kg</p>
                          <p className="text-xs text-secondary">{format(parseISO(d.fullDate), 'dd/MM/yyyy')}</p>
                          {d.notes && <p className="mt-1 text-xs text-dim">{d.notes}</p>}
                        </div>
                      )
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight_kg"
                    stroke="#00D4C8"
                    strokeWidth={2}
                    dot={{ fill: '#00D4C8', r: 3 }}
                    activeDot={{ r: 5, fill: '#00D4C8', stroke: '#00D4C8', strokeWidth: 2 }}
                    animationDuration={200}
                  />
                  <Brush
                    dataKey="date"
                    height={30}
                    stroke="#00D4C8"
                    fill="var(--color-card, #1a1a2e)"
                    travellerWidth={10}
                    startIndex={viewStart}
                    endIndex={viewEnd}
                    onChange={handleBrushChange}
                  >
                    <LineChart data={chartData}>
                      <Line
                        type="monotone"
                        dataKey="weight_kg"
                        stroke="#00D4C8"
                        strokeWidth={1}
                        dot={false}
                      />
                    </LineChart>
                  </Brush>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Weight log */}
      {entries.length > 0 && (() => {
        const reversed = [...entries].reverse()
        const totalPages = Math.ceil(reversed.length / LOG_PAGE_SIZE)
        const pageEntries = reversed.slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE)
        return (
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg">Log</h2>
              <span className="text-xs text-dim">{entries.length} entries</span>
            </div>
            <div className="space-y-2">
              {pageEntries.map((entry) => {
                const isConfirming = deletingId === entry.id
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-xl border border-card-border bg-card px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-3">
                        <span className="text-sm font-medium text-fg">
                          {format(parseISO(entry.logged_date), 'dd/MM/yyyy')}
                        </span>
                        <span className="text-sm font-bold text-teal">{entry.weight_kg} kg</span>
                      </div>
                      {entry.notes && (
                        <p className="mt-0.5 truncate text-xs text-dim">{entry.notes}</p>
                      )}
                    </div>
                    <div className="ml-3 flex-shrink-0">
                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => deleteEntry(entry.id)}
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
                          onClick={() => setDeletingId(entry.id)}
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
          </div>
        )
      })()}
    </div>
  )
}
