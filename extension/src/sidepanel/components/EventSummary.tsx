import { CalendarDays, Clock, MapPin, Repeat } from 'lucide-react'
import { eventToDraft, fmtDate, fmtRange } from '@/services/time'
import { USER_TIMEZONE } from '@/services/config'
import { cn } from '@/lib/utils'
import type { CalendarEvent, EventDraft } from '@/types/events'

export function DraftSummary({ draft, struck, className }: { draft: EventDraft; struck?: boolean; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <p className={cn('text-[16px] leading-tight font-semibold tracking-[-0.01em]', struck && 'line-through decoration-destructive/60')}>
        {draft.title || 'Untitled event'}
      </p>
      <div className="space-y-1 text-[13px] text-muted-foreground">
        <p className="flex items-center gap-2">
          <CalendarDays className="size-3.5" />
          {fmtDate(draft.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        <p className="flex items-center gap-2">
          <Clock className="size-3.5" />
          {fmtRange(draft)}
        </p>
        {draft.location && (
          <p className="flex items-center gap-2">
            <MapPin className="size-3.5" />
            <span className="truncate">{draft.location}</span>
          </p>
        )}
      </div>
    </div>
  )
}

export function EventSummary({ event, struck }: { event: CalendarEvent; struck?: boolean }) {
  return (
    <div className="space-y-2">
      <DraftSummary draft={eventToDraft(event, USER_TIMEZONE)} struck={struck} />
      {event.recurringEventId && (
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Repeat className="size-3" /> Repeating event · only this occurrence is affected
        </p>
      )}
    </div>
  )
}
