import { MapPin, Repeat, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { USER_TIMEZONE } from '@/services/config'
import { fmtCandidateWhen } from '@/services/time'
import { cn } from '@/lib/utils'
import type { RankedEvent } from '../machine'

interface Props {
  idPrefix: string
  ranked: RankedEvent[]
  selectedId: string | null
  decision: 'single' | 'ambiguous' | 'none' | null
  intent: 'UPDATE' | 'DELETE'
  onSelect: (id: string) => void
  onCreateInstead?: () => void
  disabled?: boolean
}

export function CandidatePicker({ idPrefix, ranked, selectedId, decision, intent, onSelect, onCreateInstead, disabled }: Props) {
  if (!ranked.length) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-4 py-5 text-center">
        <SearchX className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-2 text-[13.5px] font-medium">No matching event on this calendar</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {intent === 'DELETE'
            ? 'There is nothing to cancel. Check that the right calendar is selected.'
            : 'AMEND looked through your upcoming events and found nothing similar.'}
        </p>
        {intent === 'UPDATE' && onCreateInstead && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onCreateInstead}>
            Create it as a new event
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[12.5px] font-medium text-foreground/80">
        {decision === 'single' ? 'Matched event' : 'Which event does this refer to?'}
      </p>
      <RadioGroup value={selectedId ?? ''} onValueChange={onSelect} disabled={disabled} className="gap-1.5">
        {ranked.map(({ candidate, reason }) => {
          const id = `${idPrefix}-cand-${candidate.id}`
          const selected = selectedId === candidate.id
          return (
            <label
              key={candidate.id}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border bg-card px-3.5 py-3 transition-colors',
                selected ? 'border-leaf/60 ring-2 ring-leaf/15' : 'hover:border-foreground/20',
              )}
            >
              <RadioGroupItem id={id} value={candidate.id} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{candidate.title}</span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  {fmtCandidateWhen(candidate, USER_TIMEZONE)}
                  {candidate.recurring && <Repeat className="ml-1.5 inline size-3" />}
                </span>
                {candidate.location && (
                  <span className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
                    <MapPin className="size-3" />
                    <span className="truncate">{candidate.location}</span>
                  </span>
                )}
                <span className="mt-1 block text-[11px] text-muted-foreground/80">{reason}</span>
              </span>
            </label>
          )
        })}
      </RadioGroup>
    </div>
  )
}
