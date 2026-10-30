import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { CalendarEvent, CalendarSummary, HealthResponse, Proposal, ScanRecord } from '@/types/events'
import { api, BackendError } from '@/services/api'
import { AuthError, getToken, isConnected, signOut } from '@/services/auth'
import {
  calendar,
  findDuplicates,
  getSelectedCalendar,
  loadCandidateEvents,
  setSelectedCalendar,
  toCandidates,
} from '@/services/calendar'
import { MOCK_CALENDAR, USER_TIMEZONE } from '@/services/config'
import { CalendarError, StaleError } from '@/services/googleCalendar'
import { eventIdFor } from '@/services/ids'
import { downscale, blobToDataUrl } from '@/services/image'
import { resetMockCalendar } from '@/services/mockCalendar'
import { buildPatch, diffDrafts, draftToTimes, eventToDraft, mergeUpdate, proposalToDraft, validateDraft } from '@/services/time'
import { initialState, reducer, type PanelError, type RankedEvent, type ReviewItem } from './machine'

const STALE_CAPTURE_MS = 10 * 60_000
const LAST_ANALYSIS_KEY = 'lastAnalysis'

interface LastAnalysis {
  opId: string
  proposals: Proposal[]
  thumb: string
  tabTitle: string | null
  model: string
  latencyMs: number
}

function backendError(err: unknown): PanelError {
  if (err instanceof BackendError) {
    if (err.kind === 'offline')
      return { kind: 'backend', title: 'Local AI is offline', message: err.message, retryable: true }
    if (err.kind === 'timeout')
      return { kind: 'backend', title: 'The model is taking too long', message: 'The local model did not answer in time. It may still be loading; try again in a moment.', retryable: true }
    return { kind: 'backend', title: 'Analysis failed', message: err.message, retryable: true }
  }
  return { kind: 'backend', title: 'Something went wrong', message: String((err as Error)?.message ?? err), retryable: true }
}

function calendarError(err: unknown): PanelError {
  if (err instanceof AuthError || (err instanceof CalendarError && err.status === 401)) {
    return { kind: 'auth', title: 'Reconnect Google Calendar', message: 'Your Google session expired or was revoked.', retryable: true }
  }
  return { kind: 'calendar', title: "Couldn't load your calendar", message: String((err as Error)?.message ?? err), retryable: true }
}

function blankItem(proposal: Proposal): ReviewItem {
  return {
    proposal,
    decision: null,
    explanation: '',
    ranked: [],
    selectedId: null,
    target: null,
    before: null,
    draft: proposalToDraft(proposal, USER_TIMEZONE),
    duplicates: [],
    deleteConfirmed: false,
    status: 'review',
    error: null,
    stale: false,
    result: null,
  }
}

function withTarget(item: ReviewItem, target: CalendarEvent): Partial<ReviewItem> {
  const before = eventToDraft(target, USER_TIMEZONE)
  return {
    selectedId: target.id,
    target,
    before,
    draft: item.proposal.intent === 'UPDATE' ? mergeUpdate(before, item.proposal) : before,
    deleteConfirmed: false,
  }
}

export function useAmend() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const [connected, setConnected] = useState<boolean | null>(null)
  const [calendars, setCalendars] = useState<CalendarSummary[]>([])
  const [calendarId, setCalendarId] = useState<string>('primary')
  const [health, setHealth] = useState<HealthResponse | null | 'offline'>(null)
  const [authBusy, setAuthBusy] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const handledOps = useRef(new Set<string>())
  const applying = useRef(new Set<string>())
  const pendingProposals = useRef<{ opId: string; proposals: Proposal[] } | null>(null)

  // ---------------------------------------------------------------- health
  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await api.health())
    } catch {
      setHealth('offline')
    }
  }, [])

  useEffect(() => {
    void refreshHealth()
    const id = setInterval(refreshHealth, 15_000)
    return () => clearInterval(id)
  }, [refreshHealth])

  // ---------------------------------------------------------------- calendars
  const loadCalendars = useCallback(async () => {
    try {
      const list = await calendar.listCalendars()
      setCalendars(list)
      const stored = await getSelectedCalendar()
      const chosen = stored && list.some((c) => c.id === stored) ? stored : (list.find((c) => !c.primary)?.id ?? list[0]?.id ?? 'primary')
      setCalendarId(chosen)
      // Also replace a stored ID that no longer exists (e.g. the demo calendar's, after connecting
      // Google): scans and writes read the stored ID, and Google answers 404 for an unknown calendar.
      if (chosen !== stored) await setSelectedCalendar(chosen)
    } catch (err) {
      if (err instanceof AuthError || (err instanceof CalendarError && err.status === 401)) setConnected(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const ok = await isConnected()
      setConnected(ok)
      if (ok) await loadCalendars()
    })()
  }, [loadCalendars])

  const chooseCalendar = useCallback(async (id: string) => {
    setCalendarId(id)
    await setSelectedCalendar(id)
  }, [])

  // ---------------------------------------------------------------- matching
  const runMatching = useCallback(
    async (opId: string, proposals: Proposal[]) => {
      pendingProposals.current = { opId, proposals }
      if (!(await isConnected())) {
        setConnected(false)
        dispatch({ type: 'NEEDS_AUTH', opId })
        return
      }
      dispatch({ type: 'MATCHING', opId })
      const signal = abortRef.current?.signal
      const calId = (await getSelectedCalendar()) ?? 'primary'
      try {
        const events = await loadCandidateEvents(calId, proposals)
        const byId = new Map(events.map((e) => [e.id, e]))
        const candidates = toCandidates(events)
        const items = await Promise.all(
          proposals.map(async (p): Promise<ReviewItem> => {
            const item = blankItem(p)
            if (p.intent === 'CREATE') {
              item.duplicates = findDuplicates(events, item.draft.title, item.draft.date, USER_TIMEZONE)
              return item
            }
            const match = await api.match(opId, p, candidates, signal)
            item.decision = match.decision
            item.explanation = match.explanation
            item.ranked = match.ranked
              .filter((r) => byId.has(r.id))
              .map((r): RankedEvent => ({
                candidate: candidates.find((c) => c.id === r.id)!,
                event: byId.get(r.id)!,
                score: r.score,
                reason: r.reason,
              }))
            const chosen = match.decision === 'single' && match.chosen_id ? byId.get(match.chosen_id) : undefined
            return chosen ? { ...item, ...withTarget(item, chosen) } : item
          }),
        )
        dispatch({ type: 'MATCHED', opId, items })
      } catch (err) {
        if (signal?.aborted) return
        dispatch({ type: 'FAIL', opId, error: err instanceof BackendError ? backendError(err) : calendarError(err) })
      }
    },
    [],
  )

  // ---------------------------------------------------------------- analysis
  const runAnalysis = useCallback(
    async (record: ScanRecord) => {
      const { opId, image, tabTitle = null } = record
      if (!image || handledOps.current.has(opId)) return
      handledOps.current.add(opId)

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      let thumb = image
      try {
        thumb = await downscale(image, 640)
      } catch {
        /* keep the original as the preview */
      }
      dispatch({ type: 'CAPTURED', opId, image: thumb, tabTitle })

      try {
        const small = await downscale(image)
        const res = await api.analyze(
          {
            op_id: opId,
            image_b64: small,
            captured_at: record.capturedAt ?? new Date().toISOString(),
            timezone: USER_TIMEZONE,
            source_hint: tabTitle,
          },
          controller.signal,
        )
        if (controller.signal.aborted || res.op_id !== opId) return
        // The full screenshot is no longer needed; keep only the small preview.
        const { scan } = await chrome.storage.session.get('scan')
        if ((scan as ScanRecord | undefined)?.opId === opId) {
          await chrome.storage.session.set({ scan: { ...(scan as ScanRecord), image: undefined } })
        }
        const last: LastAnalysis = { opId, proposals: res.proposals, thumb, tabTitle, model: res.model, latencyMs: res.latency_ms }
        await chrome.storage.session.set({ [LAST_ANALYSIS_KEY]: last })
        dispatch({ type: 'ANALYZED', opId, count: res.proposals.length, model: res.model, latencyMs: res.latency_ms })
        if (res.proposals.length) await runMatching(opId, res.proposals)
      } catch (err) {
        if (controller.signal.aborted) return
        handledOps.current.delete(opId)
        dispatch({ type: 'FAIL', opId, error: backendError(err) })
      }
    },
    [runMatching],
  )

  const lastRecord = useRef<ScanRecord | null>(null)

  const handleScan = useCallback(
    async (record: ScanRecord | undefined, onMount = false) => {
      if (!record) return
      lastRecord.current = record
      if (record.status === 'CAPTURING') {
        dispatch({ type: 'SCAN_STARTED', opId: record.opId, tabTitle: record.tabTitle ?? null })
        return
      }
      if (record.status === 'CAPTURE_ERROR') {
        handledOps.current.add(record.opId)
        dispatch({ type: 'SCAN_STARTED', opId: record.opId, tabTitle: null })
        dispatch({
          type: 'FAIL',
          opId: record.opId,
          error: { kind: 'capture', title: "Couldn't capture this tab", message: record.error ?? 'Unknown error', retryable: false },
        })
        return
      }
      if (onMount) {
        if (handledOps.current.has(record.opId)) return
        const age = Date.now() - Date.parse(record.capturedAt ?? '')
        const { [LAST_ANALYSIS_KEY]: last } = (await chrome.storage.session.get(LAST_ANALYSIS_KEY)) as { [LAST_ANALYSIS_KEY]?: LastAnalysis }
        if (last && last.opId === record.opId) {
          // Panel was reopened: resume from the saved analysis instead of re-running the model.
          handledOps.current.add(record.opId)
          dispatch({ type: 'CAPTURED', opId: last.opId, image: last.thumb, tabTitle: last.tabTitle })
          dispatch({ type: 'ANALYZED', opId: last.opId, count: last.proposals.length, model: last.model, latencyMs: last.latencyMs })
          if (last.proposals.length) await runMatching(last.opId, last.proposals)
          return
        }
        if (!(age < STALE_CAPTURE_MS)) return
      }
      await runAnalysis(record)
    },
    [runAnalysis, runMatching],
  )

  useEffect(() => {
    void chrome.storage.session.get('scan').then(({ scan }) => handleScan(scan as ScanRecord | undefined, true))
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.scan?.newValue) void handleScan(changes.scan.newValue as ScanRecord)
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [handleScan])

  // ---------------------------------------------------------------- paste
  const submitImage = useCallback(async (file: Blob) => {
    const image = await downscale(await blobToDataUrl(file))
    const record: ScanRecord = {
      opId: crypto.randomUUID(),
      status: 'CAPTURED',
      image,
      capturedAt: new Date().toISOString(),
      tabTitle: file instanceof File ? file.name : 'Pasted screenshot',
      source: 'paste',
    }
    await chrome.storage.session.set({ scan: record })
  }, [])

  // ---------------------------------------------------------------- actions
  const connect = useCallback(async () => {
    setAuthBusy(true)
    try {
      await getToken(true)
      setConnected(true)
      await loadCalendars()
      const pending = pendingProposals.current
      if (pending && stateRef.current.opId === pending.opId && ['NEEDS_AUTH', 'ERROR'].includes(stateRef.current.phase)) {
        await runMatching(pending.opId, pending.proposals)
      }
    } catch (err) {
      setConnected(false)
      const s = stateRef.current
      if (s.opId && s.phase === 'NEEDS_AUTH') {
        dispatch({ type: 'FAIL', opId: s.opId, error: { kind: 'auth', title: "Couldn't connect Google", message: String((err as Error)?.message ?? err), retryable: true } })
      }
    } finally {
      setAuthBusy(false)
    }
  }, [loadCalendars, runMatching])

  const disconnect = useCallback(async () => {
    await signOut()
    setConnected(false)
    setCalendars([])
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    dispatch({ type: 'CANCEL' })
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    dispatch({ type: 'RESET' })
  }, [])

  const retry = useCallback(async () => {
    const s = stateRef.current
    const pending = pendingProposals.current
    if (s.error?.kind === 'auth') return connect()
    if (pending && pending.opId === s.opId) return runMatching(pending.opId, pending.proposals)
    const record = lastRecord.current
    if (record?.image && record.opId === s.opId) {
      handledOps.current.delete(record.opId)
      return runAnalysis(record)
    }
    const { scan } = await chrome.storage.session.get('scan')
    const stored = scan as ScanRecord | undefined
    if (stored?.image) {
      handledOps.current.delete(stored.opId)
      return runAnalysis(stored)
    }
    dispatch({ type: 'RESET' })
  }, [connect, runAnalysis, runMatching])

  const rescan = useCallback(async () => {
    const res = await chrome.runtime.sendMessage({ type: 'RESCAN' }).catch(() => null)
    return Boolean(res?.ok)
  }, [])

  const updateItem = useCallback((index: number, patch: Partial<ReviewItem>) => {
    const opId = stateRef.current.opId
    if (opId) dispatch({ type: 'UPDATE_ITEM', opId, index, patch })
  }, [])

  const selectCandidate = useCallback(
    (index: number, eventId: string) => {
      const item = stateRef.current.items[index]
      const ranked = item?.ranked.find((r) => r.event.id === eventId)
      if (!item || !ranked) return
      updateItem(index, { ...withTarget(item, ranked.event), stale: false, error: null })
    },
    [updateItem],
  )

  const createInstead = useCallback(
    (index: number) => {
      const item = stateRef.current.items[index]
      if (!item) return
      const proposal: Proposal = { ...item.proposal, intent: 'CREATE' }
      updateItem(index, { ...blankItem(proposal) })
    },
    [updateItem],
  )

  const apply = useCallback(
    async (index: number) => {
      const s = stateRef.current
      const item = s.items[index]
      const opId = s.opId
      if (!item || !opId || item.status !== 'review' && item.status !== 'error') return
      const key = `${opId}:${item.proposal.proposal_id}`
      if (applying.current.has(key)) return
      applying.current.add(key)
      updateItem(index, { status: 'applying', error: null })

      const calId = (await getSelectedCalendar()) ?? 'primary'
      const release = () => applying.current.delete(key)
      try {
        const intent = item.proposal.intent
        if (intent === 'CREATE') {
          if (validateDraft(item.draft).length) throw new Error('Fill in the missing details first.')
          const id = await eventIdFor(opId, item.proposal.proposal_id)
          const created = await calendar.insertEvent(calId, id, {
            summary: item.draft.title.trim(),
            location: item.draft.location.trim() || undefined,
            ...draftToTimes(item.draft),
            extendedProperties: { private: { amendOpId: opId } },
          })
          updateItem(index, { status: 'done', result: { action: 'created', link: created.htmlLink ?? null, title: created.summary ?? item.draft.title } })
          return
        }

        if (!item.target || !item.before) throw new Error('Choose which event to change first.')
        if (intent === 'DELETE' && !item.deleteConfirmed) throw new Error('Confirm the deletion first.')

        // Re-read the event: if it changed since review, show the new state instead of writing.
        const fresh = await calendar.getEvent(calId, item.target.id)
        const freshBefore = eventToDraft(fresh, USER_TIMEZONE)
        if (fresh.etag !== item.target.etag && diffDrafts(item.before, freshBefore).length) {
          release()
          updateItem(index, { ...withTarget(item, fresh), status: 'review', stale: true })
          return
        }

        if (intent === 'UPDATE') {
          const patch = buildPatch(item.before, item.draft)
          if (!Object.keys(patch).length) throw new Error('Nothing would change. Edit the details or skip this one.')
          const updated = await calendar.patchEvent(calId, fresh.id, patch, fresh.etag)
          updateItem(index, { status: 'done', result: { action: 'updated', link: updated.htmlLink ?? fresh.htmlLink ?? null, title: updated.summary ?? item.draft.title } })
        } else {
          await calendar.deleteEvent(calId, fresh.id, fresh.etag)
          updateItem(index, { status: 'done', result: { action: 'deleted', link: null, title: fresh.summary ?? '' } })
        }
      } catch (err) {
        release()
        if (err instanceof StaleError && item.target) {
          try {
            const fresh = await calendar.getEvent(calId, item.target.id)
            updateItem(index, { ...withTarget(item, fresh), status: 'review', stale: true })
            return
          } catch {
            /* fall through to a plain error */
          }
        }
        if (err instanceof AuthError || (err instanceof CalendarError && err.status === 401)) setConnected(false)
        updateItem(index, { status: 'error', error: String((err as Error)?.message ?? err) })
      }
    },
    [updateItem],
  )

  const skip = useCallback((index: number) => updateItem(index, { status: 'skipped' }), [updateItem])

  const resetDemo = useCallback(async () => {
    await resetMockCalendar()
  }, [])

  return {
    state,
    dispatch,
    connected,
    authBusy,
    calendars,
    calendarId,
    health,
    mock: MOCK_CALENDAR,
    actions: {
      connect,
      disconnect,
      chooseCalendar,
      cancel,
      reset,
      retry,
      rescan,
      submitImage,
      updateItem,
      selectCandidate,
      createInstead,
      apply,
      skip,
      resetDemo,
      refreshHealth,
    },
  }
}

export type Amend = ReturnType<typeof useAmend>
