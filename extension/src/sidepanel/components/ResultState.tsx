import { motion } from 'motion/react'
import { ArrowRight, Check, ExternalLink, MinusCircle, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MOCK_CALENDAR } from '@/services/config'
import type { ReviewItem } from '../machine'

const VERB = MOCK_CALENDAR
  ? ({ created: 'Added to the demo calendar', updated: 'Demo event updated', deleted: 'Demo event deleted' } as const)
  : ({ created: 'Added to your calendar', updated: 'Event updated', deleted: 'Event deleted' } as const)

// Demo events only exist inside AMEND, so a Google Calendar link would show a day without them.
const calendarLink = (link: string | null | undefined) => (MOCK_CALENDAR ? null : link)

function DemoNote() {
  return (
    <p className="mx-auto max-w-[30ch] text-[12.5px] leading-snug text-muted-foreground">
      Demo mode: this wasn't sent to Google Calendar. Add a Google OAuth client ID to save real events.
    </p>
  )
}

function SuccessMark() {
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      className="mx-auto flex size-14 items-center justify-center rounded-full bg-leaf text-white shadow-[0_8px_24px_-8px_rgba(40,123,84,0.6)]"
    >
      <motion.svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.12, duration: 0.35 }} />
      </motion.svg>
    </motion.div>
  )
}

export function ItemResultView({ item, onNext }: { item: ReviewItem; onNext?: () => void }) {
  if (item.status === 'skipped') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 text-[13.5px] text-muted-foreground">
        <MinusCircle className="size-4" /> Skipped. Nothing was changed.
        {onNext && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onNext}>
            Next <ArrowRight />
          </Button>
        )}
      </div>
    )
  }
  const result = item.result!
  const link = calendarLink(result.link)
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3 rounded-2xl border bg-card px-4 py-6 text-center"
    >
      <SuccessMark />
      <div>
        <p className="text-[17px] font-semibold tracking-[-0.01em]">{VERB[result.action]}</p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{result.title}</p>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        {MOCK_CALENDAR && <DemoNote />}
        {link && (
          <Button asChild variant="outline" size="sm" className="rounded-lg">
            <a href={link} target="_blank" rel="noreferrer">
              Open in Google Calendar <ExternalLink />
            </a>
          </Button>
        )}
        {onNext && (
          <Button variant="ghost" size="sm" onClick={onNext}>
            Next suggestion <ArrowRight />
          </Button>
        )}
      </div>
    </motion.div>
  )
}

export function DoneScreen({ items, onScanAgain }: { items: ReviewItem[]; onScanAgain: () => void }) {
  const done = items.filter((i) => i.status === 'done')
  const single = items.length === 1 ? items[0] : null
  return (
    <div className="space-y-4">
      {single ? (
        <ItemResultView item={single} />
      ) : (
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <span className="flex size-6 items-center justify-center rounded-full bg-leaf text-white">
              <Check className="size-3.5" />
            </span>
            {done.length ? `${done.length} change${done.length > 1 ? 's' : ''} applied` : 'Nothing was changed'}
          </div>
          <ul className="divide-y text-[13px]">
            {items.map((i) => (
              <li key={i.proposal.proposal_id} className="flex items-center justify-between gap-2 py-2">
                <span className="truncate">{i.result?.title || i.proposal.title || 'Untitled'}</span>
                {i.status === 'done' && i.result ? (
                  calendarLink(i.result.link) ? (
                    <a href={calendarLink(i.result.link)!} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-leaf hover:underline">
                      {i.result.action}
                    </a>
                  ) : (
                    <span className="shrink-0 text-muted-foreground">{i.result.action}</span>
                  )
                ) : (
                  <span className="shrink-0 text-muted-foreground">skipped</span>
                )}
              </li>
            ))}
          </ul>
          {MOCK_CALENDAR && done.length > 0 && <DemoNote />}
        </div>
      )}
      <Button variant="secondary" className="h-10 w-full rounded-xl" onClick={onScanAgain}>
        <ScanLine /> Scan something else
      </Button>
    </div>
  )
}
