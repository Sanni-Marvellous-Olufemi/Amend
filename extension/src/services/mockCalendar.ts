import type { CalendarEvent, CalendarSummary } from '@/types/events'
import { CalendarError, StaleError, type CalendarApi } from './googleCalendar'

const KEY = 'mockCalendarEvents'
const CAL_ID = 'amend-demo@group.calendar.google.com'

function seed(): CalendarEvent[] {
  const ev = (id: string, summary: string, start: string, end: string, location?: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id,
    etag: '"1"',
    summary,
    location,
    start: { dateTime: start, timeZone: 'America/Chicago' },
    end: { dateTime: end, timeZone: 'America/Chicago' },
    organizer: { self: true },
    ...extra,
  })
  return [
    ev('mockacmtechnight', 'ACM Tech Night', '2026-11-06T16:00:00-06:00', '2026-11-06T18:00:00-06:00', 'ECEB 1002'),
    ev('mockacmtechtalk', 'ACM Tech Talk: Local LLMs', '2026-11-06T18:30:00-06:00', '2026-11-06T19:30:00-06:00', 'ECEB 2015'),
    ev('mockacmstudy', 'ACM Study Session', '2026-11-07T14:00:00-06:00', '2026-11-07T16:00:00-06:00', 'Grainger Library'),
    ev('mockdentist', 'Dentist', '2026-11-03T09:00:00-06:00', '2026-11-03T10:00:00-06:00'),
    ev('mockyoga_20261104', 'Campus Yoga', '2026-11-04T07:30:00-06:00', '2026-11-04T08:30:00-06:00', 'ARC', {
      recurringEventId: 'mockyoga',
    }),
  ]
}

function link(ev: CalendarEvent): string {
  const date = (ev.start.dateTime ?? ev.start.date ?? '').slice(0, 10).replaceAll('-', '/')
  return `https://calendar.google.com/calendar/r/day/${date}`
}

function toInstant(dt: CalendarEvent['start']): CalendarEvent['start'] {
  if (dt.date || !dt.dateTime) return dt
  if (/[+-]\d{2}:\d{2}$|Z$/.test(dt.dateTime)) return dt
  // Local wall time + zone, as the real API accepts. The demo zone is fixed, so compute its offset.
  const tz = dt.timeZone ?? 'America/Chicago'
  const guess = new Date(`${dt.dateTime}Z`)
  const asLocal = new Date(guess.toLocaleString('en-US', { timeZone: tz }))
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMin = Math.round((asLocal.getTime() - asUtc.getTime()) / 60_000)
  const sign = offsetMin <= 0 ? '-' : '+'
  const abs = Math.abs(offsetMin)
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  return { dateTime: `${dt.dateTime}${offset}`, timeZone: tz }
}

async function load(): Promise<CalendarEvent[]> {
  const { [KEY]: events } = await chrome.storage.local.get(KEY)
  if (Array.isArray(events)) return events as CalendarEvent[]
  const initial = seed()
  await chrome.storage.local.set({ [KEY]: initial })
  return initial
}

const save = (events: CalendarEvent[]) => chrome.storage.local.set({ [KEY]: events })
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
const bump = (etag: string) => `"${Number(etag.replaceAll('"', '')) + 1}"`

export async function resetMockCalendar() {
  await chrome.storage.local.set({ [KEY]: seed() })
}

export const mockCalendar: CalendarApi = {
  mock: true,

  async listCalendars(): Promise<CalendarSummary[]> {
    await delay(150)
    return [
      { id: CAL_ID, summary: 'AMEND Demo', accessRole: 'owner', backgroundColor: '#287B54' },
      { id: 'primary', summary: 'you@example.com', primary: true, accessRole: 'owner', backgroundColor: '#1F4034' },
    ]
  },

  async listEvents() {
    await delay(250)
    const events = await load()
    return events.map((e) => ({ ...e, htmlLink: link(e) }))
  },

  async getEvent(_cal, eventId) {
    const found = (await load()).find((e) => e.id === eventId)
    if (!found) throw new CalendarError('Event not found', 404)
    return { ...found, htmlLink: link(found) }
  },

  async insertEvent(_cal, eventId, body) {
    await delay(400)
    const events = await load()
    const existing = events.find((e) => e.id === eventId)
    if (existing) return { ...existing, htmlLink: link(existing) }
    const created: CalendarEvent = {
      id: eventId,
      etag: '"1"',
      summary: body.summary,
      location: body.location,
      start: toInstant(body.start!),
      end: toInstant(body.end!),
      organizer: { self: true },
      extendedProperties: body.extendedProperties,
    }
    await save([...events, created])
    return { ...created, htmlLink: link(created) }
  },

  async patchEvent(_cal, eventId, patch, etag) {
    await delay(400)
    const events = await load()
    const idx = events.findIndex((e) => e.id === eventId)
    if (idx < 0) throw new CalendarError('Event not found', 404)
    if (events[idx].etag !== etag) throw new StaleError()
    const next: CalendarEvent = {
      ...events[idx],
      ...patch,
      ...(patch.start ? { start: toInstant(patch.start) } : {}),
      ...(patch.end ? { end: toInstant(patch.end) } : {}),
      etag: bump(etag),
    }
    events[idx] = next
    await save(events)
    return { ...next, htmlLink: link(next) }
  },

  async deleteEvent(_cal, eventId, etag) {
    await delay(400)
    const events = await load()
    const target = events.find((e) => e.id === eventId)
    if (!target) return
    if (target.etag !== etag) throw new StaleError()
    await save(events.filter((e) => e.id !== eventId))
  },
}
