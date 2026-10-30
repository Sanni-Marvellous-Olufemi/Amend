import type { CalendarEvent, CalendarSummary } from '@/types/events'
import { getToken, invalidateToken } from './auth'

const BASE = 'https://www.googleapis.com/calendar/v3'
const EVENT_FIELDS = 'id,etag,status,summary,location,start,end,htmlLink,recurringEventId,organizer,attendees(email,self,responseStatus),extendedProperties'

export class CalendarError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** The event changed on Google's side after the user reviewed it. */
export class StaleError extends CalendarError {
  constructor() {
    super('This event changed since you reviewed it.', 412)
  }
}

export interface ListWindow {
  timeMin: string
  timeMax: string
}

export interface CalendarApi {
  readonly mock: boolean
  listCalendars(): Promise<CalendarSummary[]>
  listEvents(calendarId: string, window: ListWindow): Promise<CalendarEvent[]>
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent>
  insertEvent(calendarId: string, eventId: string, body: Partial<CalendarEvent>): Promise<CalendarEvent>
  patchEvent(calendarId: string, eventId: string, patch: Partial<CalendarEvent>, etag: string): Promise<CalendarEvent>
  deleteEvent(calendarId: string, eventId: string, etag: string): Promise<void>
}

interface RequestOpts {
  method?: string
  query?: Record<string, string>
  body?: unknown
  headers?: Record<string, string>
}

async function request<T>(path: string, opts: RequestOpts = {}, retried = false): Promise<T> {
  const token = await getToken(false)
  const url = new URL(BASE + path)
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v)
  let res: Response
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new CalendarError("Couldn't reach Google Calendar. Check your connection and try again.", 0)
  }

  if (res.status === 401 && !retried) {
    await invalidateToken(token)
    return request<T>(path, opts, true)
  }
  if (res.status === 412) throw new StaleError()
  if (!res.ok) {
    let message = `Google Calendar returned HTTP ${res.status}`
    try {
      const data = await res.json()
      message = data?.error?.message ?? message
    } catch {
      /* empty body */
    }
    if (res.status === 401) message = 'Your Google session expired. Reconnect your account.'
    if (res.status === 403 && /insufficient/i.test(message)) message = 'AMEND does not have permission to change this calendar.'
    throw new CalendarError(message, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const enc = encodeURIComponent

export const googleCalendar: CalendarApi = {
  mock: false,

  async listCalendars() {
    const data = await request<{ items: CalendarSummary[] }>('/users/me/calendarList', {
      query: { minAccessRole: 'writer', fields: 'items(id,summary,primary,accessRole,backgroundColor)' },
    })
    return data.items ?? []
  },

  async listEvents(calendarId, window) {
    const data = await request<{ items: CalendarEvent[] }>(`/calendars/${enc(calendarId)}/events`, {
      query: {
        timeMin: window.timeMin,
        timeMax: window.timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
        fields: `items(${EVENT_FIELDS})`,
      },
    })
    return (data.items ?? []).filter((e) => e.status !== 'cancelled')
  },

  getEvent(calendarId, eventId) {
    return request<CalendarEvent>(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
      query: { fields: EVENT_FIELDS },
    })
  },

  async insertEvent(calendarId, eventId, body) {
    try {
      return await request<CalendarEvent>(`/calendars/${enc(calendarId)}/events`, {
        method: 'POST',
        query: { sendUpdates: 'none' },
        body: { ...body, id: eventId },
      })
    } catch (err) {
      // Same deterministic ID already exists: this approval was already applied.
      if (err instanceof CalendarError && err.status === 409) return this.getEvent(calendarId, eventId)
      throw err
    }
  },

  patchEvent(calendarId, eventId, patch, etag) {
    return request<CalendarEvent>(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
      method: 'PATCH',
      query: { sendUpdates: 'none' },
      headers: { 'If-Match': etag },
      body: patch,
    })
  },

  async deleteEvent(calendarId, eventId, etag) {
    try {
      await request<void>(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
        method: 'DELETE',
        query: { sendUpdates: 'none' },
        headers: { 'If-Match': etag },
      })
    } catch (err) {
      if (err instanceof CalendarError && err.status === 410) return
      throw err
    }
  },
}
