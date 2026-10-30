import type { CalendarEvent, Candidate, EventDraft, MatchResponse, Proposal } from '@/types/events'

export type Phase =
  | 'IDLE'
  | 'CAPTURING'
  | 'ANALYZING'
  | 'NEEDS_AUTH'
  | 'MATCHING'
  | 'REVIEWING'
  | 'DONE'
  | 'EMPTY'
  | 'ERROR'
  | 'CANCELLED'

export interface RankedEvent {
  candidate: Candidate
  event: CalendarEvent
  score: number
  reason: string
}

export type ItemStatus = 'review' | 'applying' | 'done' | 'skipped' | 'error'

export interface ItemResult {
  action: 'created' | 'updated' | 'deleted'
  link: string | null
  title: string
}

export interface ReviewItem {
  proposal: Proposal
  decision: MatchResponse['decision'] | null
  explanation: string
  ranked: RankedEvent[]
  selectedId: string | null
  /** The calendar event the user reviewed (UPDATE/DELETE). */
  target: CalendarEvent | null
  /** Draft of `target` at review time. */
  before: EventDraft | null
  /** What will be written (CREATE/UPDATE). */
  draft: EventDraft
  duplicates: CalendarEvent[]
  deleteConfirmed: boolean
  status: ItemStatus
  error: string | null
  stale: boolean
  result: ItemResult | null
}

export interface PanelError {
  kind: 'capture' | 'backend' | 'calendar' | 'auth'
  title: string
  message: string
  retryable: boolean
}

export interface State {
  phase: Phase
  opId: string | null
  image: string | null
  tabTitle: string | null
  items: ReviewItem[]
  activeIndex: number
  error: PanelError | null
  model: string | null
  latencyMs: number | null
}

export const initialState: State = {
  phase: 'IDLE',
  opId: null,
  image: null,
  tabTitle: null,
  items: [],
  activeIndex: 0,
  error: null,
  model: null,
  latencyMs: null,
}

export type Action =
  | { type: 'SCAN_STARTED'; opId: string; tabTitle: string | null }
  | { type: 'CAPTURED'; opId: string; image: string; tabTitle: string | null }
  | { type: 'ANALYZED'; opId: string; count: number; model: string; latencyMs: number }
  | { type: 'NEEDS_AUTH'; opId: string }
  | { type: 'MATCHING'; opId: string }
  | { type: 'MATCHED'; opId: string; items: ReviewItem[] }
  | { type: 'FAIL'; opId: string; error: PanelError }
  | { type: 'UPDATE_ITEM'; opId: string; index: number; patch: Partial<ReviewItem> }
  | { type: 'SET_ACTIVE'; index: number }
  | { type: 'CANCEL' }
  | { type: 'RESET' }

const settled = (items: ReviewItem[]) => items.length > 0 && items.every((i) => i.status === 'done' || i.status === 'skipped')

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SCAN_STARTED':
      if (state.opId === action.opId) return state
      return { ...initialState, phase: 'CAPTURING', opId: action.opId, tabTitle: action.tabTitle }
    case 'CAPTURED':
      // A new capture always replaces whatever was on screen.
      return { ...initialState, phase: 'ANALYZING', opId: action.opId, image: action.image, tabTitle: action.tabTitle }
    case 'RESET':
      return initialState
    case 'CANCEL':
      return state.phase === 'IDLE' ? state : { ...initialState, phase: 'CANCELLED' }
    case 'SET_ACTIVE':
      return { ...state, activeIndex: action.index }
  }

  // Everything below belongs to one scan; results from an older scan are dropped.
  if (action.opId !== state.opId) return state

  switch (action.type) {
    case 'ANALYZED':
      return {
        ...state,
        phase: action.count === 0 ? 'EMPTY' : 'MATCHING',
        model: action.model,
        latencyMs: action.latencyMs,
      }
    case 'NEEDS_AUTH':
      return { ...state, phase: 'NEEDS_AUTH' }
    case 'MATCHING':
      return { ...state, phase: 'MATCHING', error: null }
    case 'MATCHED':
      return { ...state, phase: 'REVIEWING', items: action.items, activeIndex: 0 }
    case 'FAIL':
      return { ...state, phase: 'ERROR', error: action.error }
    case 'UPDATE_ITEM': {
      const items = state.items.map((item, i) => (i === action.index ? { ...item, ...action.patch } : item))
      return { ...state, items, phase: settled(items) ? 'DONE' : 'REVIEWING' }
    }
  }
}
