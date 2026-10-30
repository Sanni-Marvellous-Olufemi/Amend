import type { CalendarEvent, Candidate, EventDraft, EventDateTime, Proposal } from '@/types/events'

const pad = (n: number) => String(n).padStart(2, '0')

/** Wall-clock date and time of an instant in a given IANA timezone. */
export function wallTime(iso: string, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

function toUtcMs(date: string, time = '00:00'): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return Date.UTC(y, m - 1, d, hh, mm)
}

function fromUtcMs(ms: number): { date: string; time: string } {
  const d = new Date(ms)
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  }
}

export const addMinutes = (date: string, time: string, minutes: number) => fromUtcMs(toUtcMs(date, time) + minutes * 60_000)
export const addDays = (date: string, days: number) => fromUtcMs(toUtcMs(date) + days * 86_400_000).date
export const minutesBetween = (d1: string, t1: string, d2: string, t2: string) =>
  Math.round((toUtcMs(d2, t2) - toUtcMs(d1, t1)) / 60_000)

function readDateTime(dt: EventDateTime, tz: string): { date: string; time: string; allDay: boolean } {
  if (dt.date) return { date: dt.date, time: '', allDay: true }
  const { date, time } = wallTime(dt.dateTime!, tz)
  return { date, time, allDay: false }
}

export function eventToDraft(ev: CalendarEvent, tz: string): EventDraft {
  const start = readDateTime(ev.start, tz)
  const end = readDateTime(ev.end, tz)
  return {
    title: ev.summary ?? '',
    allDay: start.allDay,
    date: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    location: ev.location ?? '',
    timezone: tz,
  }
}

export function eventToCandidate(ev: CalendarEvent): Candidate {
  return {
    id: ev.id,
    title: ev.summary ?? '(untitled)',
    start: ev.start.dateTime ?? ev.start.date ?? '',
    end: ev.end.dateTime ?? ev.end.date ?? null,
    location: ev.location ?? null,
    recurring: Boolean(ev.recurringEventId),
  }
}

export function proposalToDraft(p: Proposal, tz: string): EventDraft {
  const date = p.partial.date ?? ''
  const startTime = p.partial.start_time ?? ''
  if (p.all_day && date) {
    return { title: p.title ?? '', allDay: true, date, startTime: '', endDate: p.end ?? addDays(date, 1), endTime: '', location: p.location ?? '', timezone: tz }
  }
  let endDate = date
  let endTime = ''
  if (p.end) {
    ;({ date: endDate, time: endTime } = wallTime(p.end, p.timezone))
  } else if (date && startTime) {
    ;({ date: endDate, time: endTime } = addMinutes(date, startTime, 60))
  }
  return { title: p.title ?? '', allDay: false, date, startTime, endDate, endTime, location: p.location ?? '', timezone: tz }
}

/**
 * Apply an UPDATE proposal on top of the existing event. Only fields the announcement
 * explicitly changed move; a moved start keeps the original duration unless a new end is given.
 */
export function mergeUpdate(before: EventDraft, p: Proposal): EventDraft {
  const changed = new Set(p.changed_fields)
  const after: EventDraft = { ...before }
  if (changed.has('title') && p.title) after.title = p.title
  if (changed.has('location') && p.location) after.location = p.location

  const moveDate = changed.has('date') && p.partial.date
  const moveStart = changed.has('start_time') && p.partial.start_time
  const moveEnd = changed.has('end_time') && p.partial.end_time

  if (before.allDay) {
    if (moveDate) {
      const span = Math.max(1, Math.round(minutesBetween(before.date, '00:00', before.endDate, '00:00') / 1440))
      after.date = p.partial.date!
      after.endDate = addDays(after.date, span)
    }
    if (moveStart) {
      after.allDay = false
      after.startTime = p.partial.start_time!
      ;({ date: after.endDate, time: after.endTime } = addMinutes(after.date, after.startTime, 60))
    }
    return after
  }

  const duration = minutesBetween(before.date, before.startTime, before.endDate, before.endTime)
  if (moveDate) after.date = p.partial.date!
  if (moveStart) after.startTime = p.partial.start_time!
  if (moveEnd) {
    after.endDate = after.date
    after.endTime = p.partial.end_time!
    if (minutesBetween(after.date, after.startTime, after.endDate, after.endTime) <= 0) after.endDate = addDays(after.date, 1)
  } else if (moveDate || moveStart) {
    ;({ date: after.endDate, time: after.endTime } = addMinutes(after.date, after.startTime, Math.max(duration, 15)))
  }
  return after
}

export function draftToTimes(d: EventDraft): { start: EventDateTime; end: EventDateTime } {
  if (d.allDay) {
    return { start: { date: d.date }, end: { date: d.endDate && d.endDate > d.date ? d.endDate : addDays(d.date, 1) } }
  }
  return {
    start: { dateTime: `${d.date}T${d.startTime}:00`, timeZone: d.timezone },
    end: { dateTime: `${d.endDate}T${d.endTime}:00`, timeZone: d.timezone },
  }
}

export type DraftField = 'title' | 'when' | 'location'

export function diffDrafts(before: EventDraft, after: EventDraft): DraftField[] {
  const out: DraftField[] = []
  if (before.title.trim() !== after.title.trim()) out.push('title')
  if (
    before.allDay !== after.allDay ||
    before.date !== after.date ||
    before.startTime !== after.startTime ||
    before.endDate !== after.endDate ||
    before.endTime !== after.endTime
  )
    out.push('when')
  if (before.location.trim() !== after.location.trim()) out.push('location')
  return out
}

export function buildPatch(before: EventDraft, after: EventDraft): Partial<CalendarEvent> {
  const patch: Partial<CalendarEvent> = {}
  const fields = diffDrafts(before, after)
  if (fields.includes('title')) patch.summary = after.title.trim()
  if (fields.includes('location')) patch.location = after.location.trim()
  if (fields.includes('when')) Object.assign(patch, draftToTimes(after))
  return patch
}

export function validateDraft(d: EventDraft): string[] {
  const errors: string[] = []
  if (!d.title.trim()) errors.push('Add a title')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) errors.push('Choose a date')
  if (!d.allDay) {
    if (!/^\d{2}:\d{2}$/.test(d.startTime)) errors.push('Choose a start time')
    else if (!/^\d{2}:\d{2}$/.test(d.endTime) || !d.endDate) errors.push('Choose an end time')
    else if (minutesBetween(d.date, d.startTime, d.endDate, d.endTime) <= 0) errors.push('End must be after start')
  }
  return errors
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function fmtDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  if (!date) return 'No date'
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(toUtcMs(date)))
}

export function fmtTime(time: string) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${pad(m)} ${suffix}`
}

export function fmtRange(d: EventDraft): string {
  if (d.allDay) return 'All day'
  if (!d.startTime) return 'No time'
  const sameDay = d.endDate === d.date
  const end = d.endTime ? `${sameDay ? '' : fmtDate(d.endDate) + ' '}${fmtTime(d.endTime)}` : ''
  return end ? `${fmtTime(d.startTime)} – ${end}` : fmtTime(d.startTime)
}

export function fmtCandidateWhen(c: Candidate, tz: string): string {
  if (c.start.length === 10) return `${fmtDate(c.start)} · All day`
  const { date, time } = wallTime(c.start, tz)
  return `${fmtDate(date)} · ${fmtTime(time)}`
}
