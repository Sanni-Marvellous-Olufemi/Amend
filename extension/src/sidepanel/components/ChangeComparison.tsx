import { ArrowRight, MapPin, Type } from 'lucide-react'
import { fmtDate, fmtRange, fmtTime } from '@/services/time'
import { cn } from '@/lib/utils'
import type { EventDraft } from '@/types/events'

function When({ label, draft, highlight }: { label: string; draft: EventDraft; highlight: boolean }) {
  return (
    <div className={cn('flex-1 rounded-xl px-3.5 py-3', highlight ? 'bg-leaf-soft' : 'bg-muted/70')}>
      <p className={cn('text-[10.5px] font-semibold tracking-[0.08em] uppercase', highlight ? 'text-leaf' : 'text-muted-foreground')}>
        {label}
      </p>
      <p className={cn('mt-1 text-[22px] leading-none font-semibold tracking-[-0.02em] tabular-nums', highlight ? 'text-forest' : 'text-foreground/55')}>
        {draft.allDay ? 'All day' : fmtTime(draft.startTime) || '—'}
      </p>
      <p className={cn('mt-1.5 text-[12.5px]', highlight ? 'text-forest/80' : 'text-muted-foreground')}>
        {fmtDate(draft.date, { month: 'long', day: 'numeric' })}
        {!draft.allDay && draft.endTime && <span className="block text-[11.5px] opacity-80">{fmtRange(draft)}</span>}
      </p>
    </div>
  )
}

function Row({ icon: Icon, before, after }: { icon: typeof MapPin; before: string; after: string }) {
  return (
    <div className="flex items-start gap-2.5 text-[13px]">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-muted-foreground line-through decoration-foreground/30">{before || 'None'}</p>
        <p className="truncate font-medium text-forest">{after || 'None'}</p>
      </div>
    </div>
  )
}

export function ChangeComparison({ before, after }: { before: EventDraft; after: EventDraft }) {
  const whenChanged =
    before.date !== after.date ||
    before.startTime !== after.startTime ||
    before.endTime !== after.endTime ||
    before.endDate !== after.endDate ||
    before.allDay !== after.allDay
  const titleChanged = before.title.trim() !== after.title.trim()
  const locationChanged = before.location.trim() !== after.location.trim()
  const unchanged = [!titleChanged && 'title', !whenChanged && 'time', !locationChanged && 'location'].filter(Boolean)

  return (
    <div className="space-y-3">
      {whenChanged && (
        <div className="flex items-stretch gap-2">
          <When label="Before" draft={before} highlight={false} />
          <div className="flex items-center text-muted-foreground">
            <ArrowRight className="size-4" />
          </div>
          <When label="After" draft={after} highlight />
        </div>
      )}
      {(titleChanged || locationChanged) && (
        <div className="space-y-2.5 rounded-xl border bg-card px-3.5 py-3">
          {titleChanged && <Row icon={Type} before={before.title} after={after.title} />}
          {locationChanged && <Row icon={MapPin} before={before.location} after={after.location} />}
        </div>
      )}
      {!whenChanged && !titleChanged && !locationChanged && (
        <p className="rounded-xl bg-muted/70 px-3.5 py-3 text-[13px] text-muted-foreground">
          Nothing would change yet. Edit the details below.
        </p>
      )}
      {unchanged.length > 0 && (whenChanged || titleChanged || locationChanged) && (
        <p className="text-[12px] text-muted-foreground">Unchanged: {unchanged.join(', ')}</p>
      )}
    </div>
  )
}
