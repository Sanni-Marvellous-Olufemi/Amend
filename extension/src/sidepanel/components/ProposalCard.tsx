import { useState } from 'react'
import { motion } from 'motion/react'
import { AlertCircle, CalendarPlus, CalendarX2, ChevronDown, Copy, Loader2, PencilLine, RefreshCw, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { USER_TIMEZONE } from '@/services/config'
import { buildPatch, eventToDraft, validateDraft } from '@/services/time'
import { cn } from '@/lib/utils'
import type { ReviewItem } from '../machine'
import { CandidatePicker } from './CandidatePicker'
import { ChangeComparison } from './ChangeComparison'
import { EventFields } from './EventFields'
import { EventSummary } from './EventSummary'
import { Evidence, ReviewReasons } from './Evidence'
import { ItemResultView } from './ResultState'

interface Props {
  item: ReviewItem
  index: number
  onUpdate: (patch: Partial<ReviewItem>) => void
  onSelect: (eventId: string) => void
  onApply: () => void
  onSkip: () => void
  onCreateInstead: () => void
  onNext?: () => void
}

const INTENT = {
  CREATE: { label: 'New event', icon: CalendarPlus, tone: 'bg-leaf-soft text-forest' },
  UPDATE: { label: 'Change detected', icon: RefreshCw, tone: 'bg-leaf-soft text-forest' },
  DELETE: { label: 'Cancellation', icon: CalendarX2, tone: 'bg-danger-soft text-destructive' },
  NONE: { label: 'No action', icon: AlertCircle, tone: 'bg-muted text-muted-foreground' },
} as const

export function ProposalCard({ item, index, onUpdate, onSelect, onApply, onSkip, onCreateInstead, onNext }: Props) {
  const { proposal, draft, target, before } = item
  const intent = proposal.intent
  const meta = INTENT[intent]
  const busy = item.status === 'applying'
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const idPrefix = `p${index}`

  if (item.status === 'done' || item.status === 'skipped') {
    return <ItemResultView item={item} onNext={onNext} />
  }

  const draftErrors = validateDraft(draft)
  const hasChanges = intent === 'UPDATE' && before ? Object.keys(buildPatch(before, draft)).length > 0 : false
  const notOrganizer = target?.organizer && target.organizer.self === false

  let disabledReason: string | null = null
  if (intent === 'CREATE' && draftErrors.length) disabledReason = draftErrors[0]
  if (intent !== 'CREATE' && !target) disabledReason = 'Choose an event above'
  if (intent === 'UPDATE' && target && !hasChanges) disabledReason = 'Nothing to change'
  if (intent === 'UPDATE' && target && draftErrors.length) disabledReason = draftErrors[0]
  if (intent === 'DELETE' && target && !item.deleteConfirmed) disabledReason = 'Confirm the deletion above'

  const showPicker = intent !== 'CREATE' && (item.decision !== 'single' || pickerOpen || !target)
  const primaryLabel = intent === 'CREATE' ? 'Add to calendar' : intent === 'UPDATE' ? 'Approve update' : 'Delete event'

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="space-y-4 rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(32,43,37,0.04),0_8px_24px_-12px_rgba(32,43,37,0.12)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium', meta.tone)}>
          <meta.icon className="size-3.5" />
          {meta.label}
        </span>
        {proposal.needs_review && <span className="text-[11.5px] font-medium text-warn">Needs a closer look</span>}
      </div>

      <h2 className="text-[19px] leading-tight font-semibold tracking-[-0.02em] text-foreground">
        {(intent === 'CREATE' ? draft.title : target?.summary) || proposal.title || 'Untitled event'}
      </h2>

      {item.stale && (
        <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          <RefreshCw className="mt-0.5 size-3.5 shrink-0" />
          This event changed in Google Calendar while you were reviewing. AMEND reloaded it; check again before approving.
        </p>
      )}

      {intent === 'CREATE' && (
        <>
          <EventFields idPrefix={idPrefix} draft={draft} onChange={(d) => onUpdate({ draft: d })} inferred={proposal.inferred_fields} disabled={busy} />
          {item.duplicates.length > 0 && (
            <div className="rounded-xl bg-warn-soft px-3.5 py-3 text-[12.5px] text-warn">
              <p className="flex items-center gap-1.5 font-medium">
                <Copy className="size-3.5" /> Possible duplicate already on your calendar
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {item.duplicates.slice(0, 3).map((d) => (
                  <li key={d.id} className="truncate">
                    · {d.summary} — {eventToDraft(d, USER_TIMEZONE).startTime || 'all day'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {intent !== 'CREATE' && (
        <>
          {showPicker ? (
            <CandidatePicker
              idPrefix={idPrefix}
              ranked={item.ranked}
              selectedId={item.selectedId}
              decision={item.decision}
              intent={intent as 'UPDATE' | 'DELETE'}
              onSelect={(id) => {
                onSelect(id)
                setPickerOpen(false)
              }}
              onCreateInstead={onCreateInstead}
              disabled={busy}
            />
          ) : (
            item.ranked.length > 1 && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-1 text-[12.5px] font-medium text-leaf hover:underline"
              >
                Not the right event? Choose another <ChevronDown className="size-3.5" />
              </button>
            )
          )}

          {target && before && intent === 'UPDATE' && (
            <div className="space-y-3">
              <ChangeComparison before={before} after={draft} />
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="flex items-center gap-1.5 text-[12.5px] font-medium text-leaf hover:underline"
              >
                <PencilLine className="size-3.5" /> {editing ? 'Hide details' : 'Edit details'}
              </button>
              {editing && <EventFields idPrefix={idPrefix} draft={draft} onChange={(d) => onUpdate({ draft: d })} disabled={busy} />}
            </div>
          )}

          {target && intent === 'DELETE' && (
            <div className="space-y-3 rounded-xl border border-destructive/20 bg-danger-soft/60 p-3.5">
              <p className="text-[10.5px] font-semibold tracking-[0.08em] text-destructive uppercase">Will be removed</p>
              <EventSummary event={target} struck />
              <label className="flex cursor-pointer items-start gap-2.5 border-t border-destructive/15 pt-3 text-[13px] text-foreground">
                <Checkbox
                  checked={item.deleteConfirmed}
                  onCheckedChange={(v) => onUpdate({ deleteConfirmed: v === true })}
                  disabled={busy}
                  className="mt-0.5"
                  aria-label="Confirm deletion"
                />
                Yes, delete this exact event from my calendar
              </label>
            </div>
          )}

          {notOrganizer && (
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
              <UserX className="mt-0.5 size-3.5 shrink-0" />
              You're not the organizer. {intent === 'DELETE' ? 'This removes it from your calendar only.' : 'Google may not allow changing it.'}
            </p>
          )}
        </>
      )}

      <Evidence text={proposal.evidence} />
      <ReviewReasons reasons={proposal.review_reasons} />

      {item.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {item.error}
        </p>
      )}

      <div className="space-y-2 pt-1">
        <Button
          size="lg"
          onClick={onApply}
          disabled={busy || Boolean(disabledReason)}
          className={cn(
            'h-11 w-full rounded-xl text-[14.5px] font-semibold',
            intent === 'DELETE' && 'bg-destructive text-white hover:bg-destructive/90',
          )}
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Working…
            </>
          ) : item.status === 'error' ? (
            `Try again: ${primaryLabel.toLowerCase()}`
          ) : (
            primaryLabel
          )}
        </Button>
        <div className="flex items-center justify-between">
          <p className="text-[11.5px] text-muted-foreground">{disabledReason ?? 'Review details before changing your calendar'}</p>
          <Button variant="ghost" size="sm" onClick={onSkip} disabled={busy} className="text-muted-foreground">
            Skip
          </Button>
        </div>
      </div>
    </motion.article>
  )
}
