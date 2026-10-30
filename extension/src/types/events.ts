// Mirrors backend/app/schemas.py. Keep the two in sync.

export type Intent = 'CREATE' | 'UPDATE' | 'DELETE' | 'NONE'

export interface PartialFields {
  date: string | null
  start_time: string | null
  end_time: string | null
}

export interface Proposal {
  proposal_id: string
  intent: Intent
  title: string | null
  /** RFC3339 with offset, or YYYY-MM-DD when all_day */
  start: string | null
  end: string | null
  all_day: boolean
  location: string | null
  changed_fields: string[]
  inferred_fields: string[]
  partial: PartialFields
  previous_hint: PartialFields | null
  evidence: string
  needs_review: boolean
  review_reasons: string[]
  timezone: string
}

export interface AnalyzeRequest {
  op_id: string
  image_b64: string
  captured_at: string
  timezone: string
  source_hint?: string | null
}

export interface AnalyzeResponse {
  op_id: string
  proposals: Proposal[]
  model: string
  latency_ms: number
  mock: boolean
}

export interface Candidate {
  id: string
  title: string
  start: string
  end: string | null
  location: string | null
  recurring: boolean
}

export interface RankedCandidate {
  id: string
  score: number
  reason: string
}

export interface MatchResponse {
  op_id: string
  ranked: RankedCandidate[]
  decision: 'single' | 'ambiguous' | 'none'
  chosen_id: string | null
  explanation: string
}

export interface HealthResponse {
  ok: boolean
  ollama: boolean
  model: string
  model_available: boolean
  mock: boolean
  detail: string | null
}

// ---------------------------------------------------------------------------
// Google Calendar shapes (subset)
// ---------------------------------------------------------------------------

export interface EventDateTime {
  dateTime?: string
  date?: string
  timeZone?: string
}

export interface CalendarEvent {
  id: string
  etag: string
  status?: string
  summary?: string
  location?: string
  description?: string
  start: EventDateTime
  end: EventDateTime
  htmlLink?: string
  recurringEventId?: string
  organizer?: { email?: string; self?: boolean }
  attendees?: { email?: string; self?: boolean; responseStatus?: string }[]
  extendedProperties?: { private?: Record<string, string> }
}

export interface CalendarSummary {
  id: string
  summary: string
  primary?: boolean
  accessRole: string
  backgroundColor?: string
}

export interface EventDraft {
  title: string
  allDay: boolean
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  startTime: string
  /** YYYY-MM-DD */
  endDate: string
  /** HH:MM */
  endTime: string
  location: string
  timezone: string
}

// ---------------------------------------------------------------------------
// Capture handoff between background worker and side panel (chrome.storage.session)
// ---------------------------------------------------------------------------

export type ScanStatus = 'CAPTURING' | 'CAPTURED' | 'CAPTURE_ERROR'

export interface ScanRecord {
  opId: string
  status: ScanStatus
  tabId?: number
  tabTitle?: string
  image?: string
  capturedAt?: string
  error?: string
  source: 'shortcut' | 'action' | 'paste'
}
