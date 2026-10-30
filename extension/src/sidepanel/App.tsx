import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { imageFromClipboard } from '@/services/image'
import { cn } from '@/lib/utils'
import { Header } from './components/Header'
import { ProposalCard } from './components/ProposalCard'
import { DoneScreen } from './components/ResultState'
import { ScanProgress } from './components/ScanProgress'
import { EmptyState, ErrorState, NeedsAuth } from './components/StatusScreens'
import { Welcome } from './components/Welcome'
import { useAmend } from './useAmend'

export default function App() {
  const amend = useAmend()
  const { state, actions } = amend

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea')) return
      const file = imageFromClipboard(e)
      if (file) {
        e.preventDefault()
        void actions.submitImage(file)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [actions])

  const busyPhases = ['CAPTURING', 'ANALYZING', 'MATCHING', 'NEEDS_AUTH']
  const items = state.items
  const pendingIndices = items.map((it, i) => (it.status === 'done' || it.status === 'skipped' ? -1 : i)).filter((i) => i >= 0)
  const nextAfter = (i: number) => pendingIndices.find((p) => p > i) ?? pendingIndices.find((p) => p !== i)

  let screen: React.ReactNode
  switch (state.phase) {
    case 'IDLE':
    case 'CANCELLED':
      screen = (
        <Welcome
          connected={amend.connected}
          authBusy={amend.authBusy}
          calendars={amend.calendars}
          calendarId={amend.calendarId}
          health={amend.health}
          mock={amend.mock}
          notice={state.phase === 'CANCELLED' ? 'Scan cancelled. Nothing was changed.' : null}
          onConnect={actions.connect}
          onChooseCalendar={actions.chooseCalendar}
          onPickFile={(f) => void actions.submitImage(f)}
          onRescan={actions.rescan}
          onResetDemo={actions.resetDemo}
        />
      )
      break
    case 'CAPTURING':
    case 'ANALYZING':
    case 'MATCHING':
    case 'NEEDS_AUTH':
      screen = (
        <ScanProgress phase={state.phase} image={state.image} tabTitle={state.tabTitle} onCancel={actions.cancel}>
          {state.phase === 'NEEDS_AUTH' && <NeedsAuth onConnect={actions.connect} busy={amend.authBusy} />}
        </ScanProgress>
      )
      break
    case 'REVIEWING':
      screen = (
        <div className="space-y-3">
          {items.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Suggestions">
              {items.map((it, i) => (
                <button
                  key={it.proposal.proposal_id}
                  role="tab"
                  aria-selected={i === state.activeIndex}
                  onClick={() => amend.dispatch({ type: 'SET_ACTIVE', index: i })}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                    i === state.activeIndex ? 'border-forest bg-forest text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
                    (it.status === 'done' || it.status === 'skipped') && i !== state.activeIndex && 'opacity-60',
                  )}
                >
                  {i + 1}. {it.proposal.title?.slice(0, 18) || 'Event'}
                  {it.status === 'done' && ' ✓'}
                </button>
              ))}
            </div>
          )}
          {state.image && (
            <div className="flex items-center gap-2.5 px-1">
              <img src={state.image} alt="" className="size-9 rounded-md border object-cover object-top" />
              <p className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                {state.tabTitle ?? 'Screenshot'}
                {state.model && (
                  <span className="block">
                    {state.model} · {((state.latencyMs ?? 0) / 1000).toFixed(1)}s
                  </span>
                )}
              </p>
            </div>
          )}
          {items[state.activeIndex] && (
            <ProposalCard
              key={items[state.activeIndex].proposal.proposal_id}
              item={items[state.activeIndex]}
              index={state.activeIndex}
              onUpdate={(patch) => actions.updateItem(state.activeIndex, patch)}
              onSelect={(id) => actions.selectCandidate(state.activeIndex, id)}
              onApply={() => void actions.apply(state.activeIndex)}
              onSkip={() => {
                actions.skip(state.activeIndex)
                const next = nextAfter(state.activeIndex)
                if (next !== undefined) amend.dispatch({ type: 'SET_ACTIVE', index: next })
              }}
              onCreateInstead={() => actions.createInstead(state.activeIndex)}
              onNext={
                nextAfter(state.activeIndex) !== undefined
                  ? () => amend.dispatch({ type: 'SET_ACTIVE', index: nextAfter(state.activeIndex)! })
                  : undefined
              }
            />
          )}
        </div>
      )
      break
    case 'DONE':
      screen = <DoneScreen items={items} onScanAgain={actions.reset} />
      break
    case 'EMPTY':
      screen = <EmptyState onScanAgain={actions.reset} />
      break
    case 'ERROR':
      screen = state.error && <ErrorState error={state.error} onRetry={() => void actions.retry()} onBack={actions.reset} />
      break
  }

  const screenKey = busyPhases.includes(state.phase) ? 'busy' : state.phase === 'CANCELLED' ? 'IDLE' : state.phase

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen flex-col">
        <Header
          connected={amend.connected}
          mock={amend.mock}
          onDisconnect={actions.disconnect}
          onHome={actions.reset}
          showHome={state.phase !== 'IDLE' && state.phase !== 'CANCELLED'}
        />
        <main className="mx-auto w-full max-w-[440px] flex-1 px-4 pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={screenKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {screen}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </TooltipProvider>
  )
}
