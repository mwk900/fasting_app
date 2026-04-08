import { useState, useEffect, useMemo } from 'react'
import { format, subDays } from 'date-fns'
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
  Brush,
  ReferenceArea,
} from 'recharts'

type RangeKey = '14d' | '30d' | '90d' | 'all'
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '14d', label: '14D', days: 14 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: 'all', label: 'All', days: null },
]

export default function WeightTab() {
  const [entries, setEntries] = useState<WeightLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [range, setRange] = useState<RangeKey>('14d')

  // drag-to-zoom state
  const [zoomLeft, setZoomLeft] = useState<string | null>(null)
  const [zoomRight, setZoomRight] = useState<string | null>(null)
  const [zoomStart, setZoomStart] = useState<number | null>(null)
  const [zoomEnd, setZoomEnd] = useState<number | null>(null)

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

  const chartData = useMemo(
    () =>
      entries.map((e) => ({
        date: format(new Date(e.logged_date), 'd MMM'),
        fullDate: e.logged_date,
        weight_kg: e.weight_kg,
        notes: e.notes,
      })),
    [entries],
  )

  // Compute the default brush indices based on the selected range
  const { brushStart, brushEnd } = useMemo(() => {
    if (chartData.length === 0) return { brushStart: 0, brushEnd: 0 }
    const end = chartData.length - 1
    if (range === 'all') return { brushStart: 0, brushEnd: end }

    const days = RANGES.find((r) => r.key === range)!.days!
    const cutoff = format(subDays(new Date(), days), 'yyyy-MM-dd')
    let start = chartData.findIndex((d) => d.fullDate >= cutoff)
    if (start < 0) start = 0
    return { brushStart: start, brushEnd: end }
  }, [chartData, range])

  // Custom zoomed view via drag
  const visibleData = useMemo(() => {
    if (zoomStart !== null && zoomEnd !== null) {
      const lo = Math.min(zoomStart, zoomEnd)
      const hi = Math.max(zoomStart, zoomEnd)
      return chartData.slice(lo, hi + 1)
    }
    return null
  }, [chartData, zoomStart, zoomEnd])

  const displayData = visibleData ?? chartData

  function handleZoomSelect() {
    if (!zoomLeft || !zoomRight || zoomLeft === zoomRight) {
      setZoomLeft(null)
      setZoomRight(null)
      return
    }
    const li = chartData.findIndex((d) => d.date === zoomLeft)
    const ri = chartData.findIndex((d) => d.date === zoomRight)
    if (li >= 0 && ri >= 0) {
      setZoomStart(Math.min(li, ri))
      setZoomEnd(Math.max(li, ri))
    }
    setZoomLeft(null)
    setZoomRight(null)
  }

  function resetZoom() {
    setZoomStart(null)
    setZoomEnd(null)
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
          <>
            {/* Range buttons + reset zoom */}
            <div className="mb-3 flex items-center gap-2">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => { setRange(r.key); resetZoom() }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    range === r.key && zoomStart === null
                      ? 'bg-teal text-bg'
                      : 'bg-card text-secondary border border-card-border hover:text-fg'
                  }`}
                >
                  {r.label}
                </button>
              ))}
              {zoomStart !== null && (
                <button
                  onClick={resetZoom}
                  className="ml-auto rounded-lg border border-card-border bg-card px-3 py-1.5 text-xs font-semibold text-secondary hover:text-fg transition-colors"
                >
                  Reset zoom
                </button>
              )}
            </div>

            {/* Tip */}
            {zoomStart === null && (
              <p className="mb-2 text-[11px] text-dim">Drag on chart to zoom in. Use slider below to pan.</p>
            )}

            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={displayData}
                margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                onMouseDown={(e: any) => {
                  if (e?.activeLabel) setZoomLeft(e.activeLabel)
                }}
                onMouseMove={(e: any) => {
                  if (zoomLeft && e?.activeLabel) setZoomRight(e.activeLabel)
                }}
                onMouseUp={handleZoomSelect}
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
                  domain={['dataMin - 0.5', 'dataMax + 0.5']}
                />
                <Tooltip
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
                        }}
                      >
                        <p className="font-semibold">{d.weight_kg} kg</p>
                        <p className="text-xs text-secondary">{d.fullDate}</p>
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
                  activeDot={{ r: 5, fill: '#00D4C8' }}
                />
                {/* Drag-to-zoom highlight */}
                {zoomLeft && zoomRight && (
                  <ReferenceArea
                    x1={zoomLeft}
                    x2={zoomRight}
                    strokeOpacity={0.3}
                    fill="#00D4C8"
                    fillOpacity={0.15}
                  />
                )}
                {/* Brush slider — only when not in custom zoom */}
                {zoomStart === null && (
                  <Brush
                    dataKey="date"
                    height={30}
                    stroke="#00D4C8"
                    fill="var(--color-card, #1a1a2e)"
                    travellerWidth={10}
                    startIndex={brushStart}
                    endIndex={brushEnd}
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
                )}
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  )
}
