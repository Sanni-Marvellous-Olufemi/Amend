const env = import.meta.env

export const BACKEND_URL = (env.VITE_BACKEND_URL || 'http://127.0.0.1:47615').replace(/\/$/, '')

/** Client ID of the Google "Web application" OAuth client used by the launchWebAuthFlow fallback. */
export const WEB_CLIENT_ID: string = env.VITE_GOOGLE_WEB_CLIENT_ID || ''

const hasChromeClient = Boolean(chrome.runtime.getManifest().oauth2?.client_id)

/** Mock calendar when explicitly requested or when no OAuth client is configured at all. */
export const MOCK_CALENDAR: boolean = env.VITE_MOCK_CALENDAR === '1' || (!hasChromeClient && !WEB_CLIENT_ID)

export const USER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

// Generous because CPU-only inference can take ~2 minutes per screenshot; Apple-silicon GPUs take seconds.
export const ANALYZE_TIMEOUT_MS = Number(env.VITE_ANALYZE_TIMEOUT_MS) || 300_000
export const MATCH_TIMEOUT_MS = Number(env.VITE_MATCH_TIMEOUT_MS) || 180_000
export const MAX_IMAGE_EDGE = 1600
export const CANDIDATE_WINDOW_DAYS = 90
