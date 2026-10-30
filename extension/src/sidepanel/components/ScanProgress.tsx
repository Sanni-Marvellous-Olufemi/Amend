import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Phase } from '../machine'

const STEPS: { key: string; label: string; phases: Phase[] }[] = [
  { key: 'capture', label: 'Capturing the page', phases: ['CAPTURING'] },
  { key: 'read', label: 'Reading the announcement', phases: ['ANALYZING'] },
  { key: 'match', label: 'Checking your calendar', phases: ['MATCHING', 'NEEDS_AUTH'] },
]

function useElapsedSeconds(phase: Phase) {
  const [tick, setTick] = useState({ phase, elapsed: 0 })
  useEffect(() => {
    const started = Date.now()
    const id = setInterval(() => setTick({ phase, elapsed: Math.floor((Date.now() - started) / 1000) }), 1000)
    return () => clearInterval(id)
  }, [phase])
  return tick.phase === phase ? tick.elapsed : 0
}

export function ScanProgress({
  phase,
  image,
  tabTitle,
  onCancel,
  children,
}: {
  phase: Phase
  image: string | null
  tabTitle: string | null
  onCancel: () => void
  children?: React.ReactNode
}) {
  const current = STEPS.findIndex((s) => s.phases.includes(phase))
  const elapsed = useElapsedSeconds(phase)

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border bg-card shadow-[0_8px_24px_-14px_rgba(32,43,37,0.25)]">
        {image ? (
          <img src={image} alt="Captured page" className="max-h-56 w-full object-cover object-top" />
        ) : (
          <div className="h-40 animate-pulse bg-muted" />
        )}
        {phase !== 'NEEDS_AUTH' && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card/30">
            <div
              className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-leaf/25 to-transparent"
              style={{ animation: 'amend-scan 1.8s ease-in-out infinite' }}
            />
          </div>
        )}
        {tabTitle && (
          <p className="truncate border-t bg-card px-3 py-2 text-[11.5px] text-muted-foreground">{tabTitle}</p>
        )}
      </div>

      <ol className="space-y-2.5 px-1" aria-live="polite">
        {STEPS.map((step, i) => {
          const done = i < current
          const active = i === current
          return (
            <motion.li
              key={step.key}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: done || active ? 1 : 0.45, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-2.5 text-[13.5px]"
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full',
                  done ? 'bg-leaf text-white' : active ? 'bg-leaf-soft text-leaf' : 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3" /> : active ? <Loader2 className="size-3 animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className={cn(active ? 'font-medium text-foreground' : 'text-muted-foreground')}>{step.label}</span>
              {active && phase !== 'NEEDS_AUTH' && elapsed >= 3 && (
                <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">{elapsed}s</span>
              )}
            </motion.li>
          )
        })}
      </ol>

      {phase === 'ANALYZING' && elapsed >= 15 && (
        <p className="rounded-xl bg-muted/70 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
          The model runs entirely on this computer. On machines without a GPU, reading a screenshot can take a couple
          of minutes.
        </p>
      )}

      {children}

      {phase !== 'NEEDS_AUTH' && (
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  )
}
