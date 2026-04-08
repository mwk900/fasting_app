import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Fast } from '../../types'

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

export default function HistoryTab() {
  const { user } = useAuth()
  const [fasts, setFasts] = useState<Fast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (user) fetchFasts()
  }, [user])

  async function fetchFasts() {
    setError(null)
    const { data, error: err } = await supabase
      .from('fasts')
      .select('*')
      .eq('user_id', user!.id)
      .order('end_time', { ascending: false })
    if (err) { setError('Failed to load history'); setLoading(false); return }
    setFasts(data ?? [])
    setLoading(false)
  }

  async function deleteFast(id: number) {
    setError(null)
    const { error: err } = await supabase.from('fasts').delete().eq('id', id)
    if (err) { setError('Failed to delete entry'); return }
    setFasts((prev) => prev.filter((f) => f.id !== id))
    setDeletingId(null)
    setExpandedId(null)
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
      <h1 className="mb-6 text-xl font-bold text-fg">Fasting History</h1>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</p>
      )}

      {fasts.length === 0 ? (
        <p className="py-20 text-center text-muted">No fasts logged yet.</p>
      ) : (
        <div className="space-y-3">
          {fasts.map((fast, i) => {
            const isExpanded = expandedId === fast.id
            const isConfirmingDelete = deletingId === fast.id

            return (
              <motion.div
                key={fast.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.25 }}
                className="rounded-xl border border-card-border bg-card"
              >
                <button
                  onClick={() => {
                    setExpandedId(isExpanded ? null : fast.id)
                    setDeletingId(null)
                  }}
                  className="flex w-full items-baseline justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-fg">
                      {format(new Date(fast.start_time), 'dd/MM/yyyy')}
                    </p>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-teal">
                    {formatDuration(fast.duration_minutes)}
                  </p>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-card-border px-4 pb-4 pt-3">
                        <div className="space-y-1.5 text-sm text-secondary">
                          <p>
                            <span className="text-muted">Started:</span>{' '}
                            {format(new Date(fast.start_time), 'dd/MM/yyyy, HH:mm')}
                          </p>
                          <p>
                            <span className="text-muted">Ended:</span>{' '}
                            {format(new Date(fast.end_time), 'dd/MM/yyyy, HH:mm')}
                          </p>
                          {fast.end_weight_kg != null && (
                            <p>
                              <span className="text-muted">End weight:</span>{' '}
                              {fast.end_weight_kg} kg
                            </p>
                          )}
                          {fast.notes && (
                            <p>
                              <span className="text-muted">Notes:</span> {fast.notes}
                            </p>
                          )}
                        </div>

                        <div className="mt-4">
                          {isConfirmingDelete ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted">Delete this entry?</span>
                              <button
                                onClick={() => deleteFast(fast.id)}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:text-fg"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingId(fast.id)}
                              className="text-xs font-medium text-red-500 transition-opacity hover:opacity-80"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
