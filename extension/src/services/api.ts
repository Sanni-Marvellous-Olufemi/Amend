import type {
  AnalyzeRequest,
  AnalyzeResponse,
  Candidate,
  HealthResponse,
  MatchResponse,
  Proposal,
} from '@/types/events'
import { ANALYZE_TIMEOUT_MS, BACKEND_URL, MATCH_TIMEOUT_MS } from './config'

export class BackendError extends Error {
  readonly status: number
  readonly kind: 'offline' | 'timeout' | 'model' | 'bad_request' | 'aborted'

  constructor(message: string, status: number, kind: BackendError['kind']) {
    super(message)
    this.status = status
    this.kind = kind
  }
}

async function call<T>(path: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? { 'X-Amend-Client': '1' } : { 'Content-Type': 'application/json', 'X-Amend-Client': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combined,
    })
  } catch {
    if (signal?.aborted) throw new BackendError('Cancelled', 0, 'aborted')
    if (timeout.aborted) throw new BackendError('The local model took too long to respond.', 0, 'timeout')
    throw new BackendError(`AMEND's local service isn't running at ${BACKEND_URL}.`, 0, 'offline')
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const data = await res.json()
      detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch {
      /* non-JSON error body */
    }
    const kind = res.status >= 500 || res.status === 422 ? 'model' : 'bad_request'
    throw new BackendError(detail, res.status, kind)
  }
  return (await res.json()) as T
}

export const api = {
  health: () => call<HealthResponse>('/health', undefined, 4000),
  analyze: (req: AnalyzeRequest, signal?: AbortSignal) =>
    call<AnalyzeResponse>('/analyze', req, ANALYZE_TIMEOUT_MS, signal),
  match: (opId: string, proposal: Proposal, candidates: Candidate[], signal?: AbortSignal) =>
    call<MatchResponse>('/match', { op_id: opId, proposal, candidates }, MATCH_TIMEOUT_MS, signal),
}
