import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { ActiveFast, Fast } from '../../types'
import {
  getStageForHour,
  ELECTROLYTE_REFERENCE,
  REFEED_PROTOCOL,
} from '../../lib/fastingStages'
import type { FastingBenefit } from '../../lib/fastingStages'
import StopModal from './StopModal'

const MOTIVATIONAL_QUOTES = [
  'Your body is healing itself right now.',
  'Discipline is choosing between what you want now and what you want most.',
  'Every hour of fasting makes you stronger.',
  'You are giving your cells the gift of renewal.',
  'Hunger is temporary. The results last.',
  'Your willpower is a muscle \u2014 you are training it right now.',
  'Discomfort is just growth in disguise.',
  'Trust the process. Your body knows what to do.',
  'You have done hard things before. This is one of them.',
  'The best time to push through is right now.',
  'Small sacrifices today build the body you want tomorrow.',
  'Every minute without food is a minute of deep repair.',
  'You are stronger than the craving.',
  'This is where change happens \u2014 in the quiet discipline.',
  'Your future self will thank you for this.',
]

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDurationShort(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

const LEVEL_STYLE: Record<string, string> = {
  STRONG: 'bg-teal/15 text-teal',
  MODERATE: 'bg-amber-500/15 text-amber-400',
  WEAK: 'bg-secondary/15 text-muted',
  WEAK_MODERATE: 'bg-amber-500/10 text-amber-400/80',
}

const LEVEL_LABEL: Record<string, string> = {
  STRONG: 'STRONG',
  MODERATE: 'MODERATE',
  WEAK: 'WEAK',
  WEAK_MODERATE: 'WEAK\u2013MOD',
}

function BenefitTag({ b }: { b: FastingBenefit }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-relaxed text-secondary">
      <span
        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${LEVEL_STYLE[b.level]}`}
      >
        {LEVEL_LABEL[b.level]}
      </span>
      <span>{b.text}</span>
    </li>
  )
}

interface SectionProps {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

function Section({ title, open, onToggle, children }: SectionProps) {
  return (
    <div className="border-t border-card-border">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted"
      >
        {title}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function TimerTab() {
  const { user } = useAuth()
  const [activeFast, setActiveFast] = useState<ActiveFast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [showStopModal, setShowStopModal] = useState(false)
  const [lastFast, setLastFast] = useState<Fast | null>(null)
  const [debugOffset, setDebugOffset] = useState(0)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const intervalRef = useRef<number | null>(null)
  const isDev = import.meta.env.DEV

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

  useEffect(() => {
    if (user) {
      fetchActiveFast()
      fetchLastFast()
    }
  }, [user])

  useEffect(() => {
    if (activeFast?.is_active && activeFast.start_time) {
      const startMs = new Date(activeFast.start_time).getTime()
      const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000))
      tick()
      intervalRef.current = window.setInterval(tick, 1000)
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    } else {
      setElapsed(0)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeFast])

  const displayElapsed = elapsed + debugOffset

  const motivationalQuote = useMemo(() => {
    const block = Math.floor(displayElapsed / 1800)
    return MOTIVATIONAL_QUOTES[block % MOTIVATIONAL_QUOTES.length]
  }, [Math.floor(displayElapsed / 1800)])

  async function fetchActiveFast() {
    setError(null)
    const { data, error: err } = await supabase
      .from('active_fast')
      .select('*')
      .eq('user_id', user!.id)
      .single()
    if (err && err.code !== 'PGRST116') setError('Failed to load timer state')
    if (data) setActiveFast(data)
    setLoading(false)
  }

  async function fetchLastFast() {
    const { data } = await supabase
      .from('fasts')
      .select('*')
      .eq('user_id', user!.id)
      .order('end_time', { ascending: false })
      .limit(1)
      .single()
    if (data) setLastFast(data)
  }

  async function startFast() {
    setError(null)
    const now = new Date().toISOString()

    // Check if user already has a row
    const { data: existing } = await supabase
      .from('active_fast')
      .select('id')
      .eq('user_id', user!.id)
      .maybeSingle()

    const query = existing
      ? supabase.from('active_fast').update({ start_time: now, is_active: true }).eq('user_id', user!.id)
      : supabase.from('active_fast').insert({ user_id: user!.id, start_time: now, is_active: true })

    const { data, error: err } = await query.select().single()
    if (err) {
      setError('Failed to start fast')
      return
    }
    if (data) setActiveFast(data)
  }

  async function stopFast(endWeight?: number, notes?: string) {
    if (!activeFast?.start_time) return
    setError(null)

    const endTime = new Date().toISOString()
    const durationMinutes = Math.floor(elapsed / 60)

    const { error: insertErr } = await supabase.from('fasts').insert({
      user_id: user!.id,
      start_time: activeFast.start_time,
      end_time: endTime,
      duration_minutes: durationMinutes,
      end_weight_kg: endWeight ?? null,
      notes: notes ?? null,
    })

    if (insertErr) {
      setError('Failed to save fast')
      return
    }

    const { error: updateErr } = await supabase
      .from('active_fast')
      .update({ start_time: null, is_active: false })
      .eq('user_id', user!.id)

    if (updateErr) {
      setError('Failed to reset timer')
      return
    }

    setActiveFast({ ...activeFast, start_time: null, is_active: false })
    setShowStopModal(false)
    fetchLastFast()
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    )
  }

  const isActive = activeFast?.is_active && activeFast.start_time
  const hours = Math.floor(displayElapsed / 3600)
  const stage = getStageForHour(hours)

  return (
    <div className="flex flex-col items-center text-center">
      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</p>
      )}

      {isActive ? (
        <>
          {/* Timer */}
          <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-widest text-muted">
            Fasting
          </p>
          <p className="font-mono text-6xl font-bold tracking-tight text-fg sm:text-7xl">
            {formatTimer(displayElapsed)}
          </p>

          {/* Stage header */}
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-teal">
            Stage {stage.id} &middot; Hours{' '}
            {stage.hoursEnd === Infinity
              ? `${stage.hoursStart}+`
              : `${stage.hoursStart}\u2013${stage.hoursEnd}`}
          </p>
          <p className="mt-1 text-base font-bold text-fg">{stage.title}</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-secondary">{stage.summary}</p>

          {/* Motivational quote */}
          <AnimatePresence mode="wait">
            <motion.p
              key={motivationalQuote}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              className="mt-4 max-w-xs text-xs italic text-muted"
            >
              &ldquo;{motivationalQuote}&rdquo;
            </motion.p>
          </AnimatePresence>

          {/* Expandable detail card */}
          <div className="mt-6 w-full max-w-sm rounded-xl border border-card-border bg-card px-4 text-left">
            {/* What's Happening */}
            <Section
              title="What's Happening"
              open={!!openSections['happening']}
              onToggle={() => toggleSection('happening')}
            >
              <ul className="space-y-1.5">
                {stage.whatsHappening.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-secondary">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal" />
                    {item}
                  </li>
                ))}
              </ul>
            </Section>

            {/* Benefits */}
            <Section
              title="Benefits"
              open={!!openSections['benefits']}
              onToggle={() => toggleSection('benefits')}
            >
              {stage.benefits.length === 0 ? (
                <p className="text-sm text-muted">
                  None fasting-specific yet &mdash; this is the building phase.
                </p>
              ) : (
                <ul className="space-y-2">
                  {stage.benefits.map((b, i) => (
                    <BenefitTag key={i} b={b} />
                  ))}
                </ul>
              )}
            </Section>

            {/* Tips */}
            <Section
              title="Tips"
              open={!!openSections['tips']}
              onToggle={() => toggleSection('tips')}
            >
              <ul className="space-y-1.5">
                {stage.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-secondary">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                    {tip}
                  </li>
                ))}
              </ul>
            </Section>

            {/* Electrolyte reference — visible from hour 12+ */}
            {hours >= 12 && (
              <Section
                title="Electrolyte Guide"
                open={!!openSections['electrolytes']}
                onToggle={() => toggleSection('electrolytes')}
              >
                <div className="space-y-2">
                  {ELECTROLYTE_REFERENCE.map((e, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-fg">{e.symptom}</span>
                      <span className="text-muted"> &rarr; {e.cause} &rarr; </span>
                      <span className="text-teal">{e.fix}</span>
                    </div>
                  ))}
                  <p className="mt-2 text-xs text-muted">
                    Mg oxide is poorly absorbed — use glycinate, citrate, or malate. &ldquo;Lite
                    salt&rdquo; (KCl) is practical for potassium dosing.
                  </p>
                </div>
              </Section>
            )}

            {/* Refeed protocol — visible from hour 48+ */}
            {hours >= 48 && (
              <Section
                title="Refeed Protocol"
                open={!!openSections['refeed']}
                onToggle={() => toggleSection('refeed')}
              >
                <div className="space-y-2">
                  {REFEED_PROTOCOL.map((r, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-teal">{r.time}:</span>{' '}
                      <span className="text-secondary">{r.instructions}</span>
                    </div>
                  ))}
                  <p className="mt-2 text-xs font-medium text-red-400">
                    Do NOT break with pizza, pasta, sugary drinks, or large carb meals. These cause
                    the biggest insulin spike and highest refeeding risk.
                  </p>
                </div>
              </Section>
            )}

            {/* Warning */}
            {stage.warning && (
              <div className="border-t border-card-border py-3">
                <div className="rounded-lg bg-red-500/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-red-400">
                    Clinical Warning
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-red-300">{stage.warning}</p>
                </div>
              </div>
            )}
          </div>

          {/* Stop button */}
          <button
            onClick={() => setShowStopModal(true)}
            className="mt-8 rounded-xl bg-red-600 px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Stop Fasting
          </button>

          {/* Dev controls */}
          {isDev && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-card-border p-3">
              <span className="w-full text-[10px] uppercase tracking-widest text-muted">
                Dev: skip time
              </span>
              {[1, 2, 4, 8, 12, 24, 36, 48].map((h) => (
                <button
                  key={h}
                  onClick={() => setDebugOffset((o) => o + h * 3600)}
                  className="rounded bg-card-border px-2.5 py-1 text-xs font-medium text-secondary transition-colors hover:text-fg"
                >
                  +{h}h
                </button>
              ))}
              <button
                onClick={() => setDebugOffset(0)}
                className="rounded bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:text-red-300"
              >
                Reset
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex min-h-[70vh] flex-col items-center justify-center">
          <motion.button
            onClick={startFast}
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
            className="rounded-2xl bg-teal px-10 py-5 text-lg font-bold text-bg shadow-lg shadow-teal/20"
          >
            Start Fast
          </motion.button>
          {lastFast && (
            <p className="mt-6 text-sm text-muted">
              Last fast: {format(new Date(lastFast.end_time), 'dd/MM/yyyy')} &mdash;{' '}
              {formatDurationShort(lastFast.duration_minutes)}
            </p>
          )}
        </div>
      )}

      <AnimatePresence>
        {showStopModal && (
          <StopModal
            durationLabel={formatTimer(displayElapsed)}
            onConfirm={stopFast}
            onCancel={() => setShowStopModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
