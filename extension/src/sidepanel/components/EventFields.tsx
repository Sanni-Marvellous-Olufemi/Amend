import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addDays, addMinutes, minutesBetween } from '@/services/time'
import { cn } from '@/lib/utils'
import type { EventDraft } from '@/types/events'

interface Props {
  draft: EventDraft
  onChange: (draft: EventDraft) => void
  inferred?: string[]
  disabled?: boolean
  idPrefix: string
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-[11.5px] font-medium text-muted-foreground">
        {label}
        {hint && <span className="ml-1 font-normal text-warn">· {hint}</span>}
      </Label>
      {children}
    </div>
  )
}

const inputCls = 'h-9 rounded-lg bg-card text-[13.5px]'

export function EventFields({ draft, onChange, inferred = [], disabled, idPrefix }: Props) {
  const set = (patch: Partial<EventDraft>) => onChange({ ...draft, ...patch })

  const setStart = (startTime: string) => {
    // Moving the start keeps the duration, like Google Calendar does.
    if (draft.startTime && draft.endTime && startTime) {
      const dur = minutesBetween(draft.date, draft.startTime, draft.endDate, draft.endTime)
      const end = addMinutes(draft.date, startTime, Math.max(dur, 15))
      set({ startTime, endDate: end.date, endTime: end.time })
    } else set({ startTime })
  }

  const setDate = (date: string) => {
    if (!date) return set({ date })
    if (draft.allDay) {
      const span = draft.date && draft.endDate ? Math.max(1, Math.round(minutesBetween(draft.date, '00:00', draft.endDate, '00:00') / 1440)) : 1
      return set({ date, endDate: addDays(date, span) })
    }
    if (draft.date && draft.endDate && draft.startTime && draft.endTime) {
      const dur = minutesBetween(draft.date, draft.startTime, draft.endDate, draft.endTime)
      const end = addMinutes(date, draft.startTime, dur)
      return set({ date, endDate: end.date, endTime: end.time })
    }
    set({ date, endDate: date })
  }

  const setEndTime = (endTime: string) => {
    const sameDayValid = draft.startTime && endTime > draft.startTime
    set({ endTime, endDate: sameDayValid || !draft.date ? draft.date : addDays(draft.date, 1) })
  }

  const toggleAllDay = (allDay: boolean) => {
    if (allDay) set({ allDay, startTime: '', endTime: '', endDate: draft.date ? addDays(draft.date, 1) : '' })
    else {
      const start = '09:00'
      const end = addMinutes(draft.date || '2000-01-01', start, 60)
      set({ allDay, startTime: start, endDate: draft.date || '', endTime: end.time })
    }
  }

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <Field label="Title" htmlFor={`${idPrefix}-title`}>
        <Input id={`${idPrefix}-title`} className={inputCls} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Event name" />
      </Field>
      <div className="grid grid-cols-[1.3fr_1fr] gap-2">
        <Field label="Date" htmlFor={`${idPrefix}-date`}>
          <Input id={`${idPrefix}-date`} type="date" className={inputCls} value={draft.date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-[12.5px] text-muted-foreground">
          <Checkbox checked={draft.allDay} onCheckedChange={(v) => toggleAllDay(v === true)} />
          All day
        </label>
      </div>
      {!draft.allDay && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Starts" htmlFor={`${idPrefix}-start`}>
            <Input id={`${idPrefix}-start`} type="time" className={inputCls} value={draft.startTime} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Ends" htmlFor={`${idPrefix}-end`} hint={inferred.includes('end') ? 'estimated' : undefined}>
            <Input
              id={`${idPrefix}-end`}
              type="time"
              className={cn(inputCls, inferred.includes('end') && 'border-dashed border-warn/50')}
              value={draft.endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>
      )}
      <Field label="Location" htmlFor={`${idPrefix}-loc`}>
        <Input id={`${idPrefix}-loc`} className={inputCls} value={draft.location} onChange={(e) => set({ location: e.target.value })} placeholder="Add a location" />
      </Field>
    </fieldset>
  )
}
