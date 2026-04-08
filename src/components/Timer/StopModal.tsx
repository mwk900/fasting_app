import { useState } from 'react'
import { motion } from 'framer-motion'

interface Props {
  durationLabel: string
  onConfirm: (endWeight?: number, notes?: string) => void
  onCancel: () => void
}

export default function StopModal({ durationLabel, onConfirm, onCancel }: Props) {
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    const w = weight ? parseFloat(weight) : undefined
    await onConfirm(w, notes || undefined)
    setSaving(false)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 rounded-2xl border border-card-border bg-card p-6"
      >
        <h2 className="text-lg font-semibold text-fg">End this fast?</h2>
        <p className="mt-1 text-sm text-secondary">
          Duration so far: <span className="font-medium text-teal">{durationLabel}</span>
        </p>

        <div className="mt-5 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">
              End weight (kg) — optional
            </label>
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 82.5"
              className="w-full rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">
              Notes — optional
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="How did it go?"
              className="w-full resize-none rounded-lg border border-card-border bg-bg px-3 py-2.5 text-sm text-fg placeholder-dim outline-none focus:border-teal focus:ring-1 focus:ring-teal"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-card-border px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:text-fg"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'End Fast'}
          </button>
        </div>
      </motion.div>
    </>
  )
}
