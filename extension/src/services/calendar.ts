import type { CalendarEvent, Candidate, Proposal } from '@/types/events'
import { CANDIDATE_WINDOW_DAYS, MOCK_CALENDAR } from './config'
import { googleCalendar, type CalendarApi } from './googleCalendar'
import { mockCalendar } from './mockCalendar'
import { eventToCandidate } from './time'

export const calendar: CalendarApi = MOCK_CALENDAR ? mockCalendar : googleCalendar

const DAY = 86_400_000
const CALENDAR_KEY = 'calendarId'

export async function getSelectedCalendar(): Promise<string | null> {
  const { [CALENDAR_KEY]: id } = await chrome.storage.local.get(CALENDAR_KEY)
  return typeof id === 'string' ? id : null
}

export async function setSelectedCalendar(id: string) {
  await chrome.storage.local.set({ [CALENDAR_KEY]: id })
}

/** Upcoming events (plus yesterday) and any proposal dates beyond the default window. */
export async function loadCandidateEvents(calendarId: string, proposals: Proposal[]): Promise<CalendarEvent[]> {
  const now = Date.now()
  let max = now + CANDIDATE_WINDOW_DAYS * DAY
  for (const p of proposals) {
    for (const d of [p.partial.date, p.previous_hint?.date]) {
      if (d) max = Math.max(max, Date.parse(`${d}T00:00:00Z`) + 7 * DAY)
    }
  }
  return calendar.listEvents(calendarId, {
    timeMin: new Date(now - DAY).toISOString(),
    timeMax: new Date(max).toISOString(),
  })
}

export function toCandidates(events: CalendarEvent[]): Candidate[] {
  return events.map(eventToCandidate)
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? [])

/** Likely duplicates for a new event: same calendar day and overlapping title words. */
export function findDuplicates(events: CalendarEvent[], title: string, date: string, tz: string): CalendarEvent[] {
  if (!title || !date) return []
  const target = words(title)
  return events.filter((e) => {
    const start = e.start.dateTime
      ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(e.start.dateTime))
      : e.start.date
    if (!start || Math.abs(Date.parse(`${start}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) > DAY) return false
    const other = words(e.summary ?? '')
    const overlap = [...target].filter((w) => other.has(w)).length
    return overlap / Math.max(1, Math.min(target.size, other.size)) >= 0.5
  })
}
