import { MOCK_CALENDAR, WEB_CLIENT_ID } from './config'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
]
const WEB_TOKEN_KEY = 'webAuthToken'

export class AuthError extends Error {
  readonly needsInteraction: boolean
  constructor(message: string, needsInteraction = true) {
    super(message)
    this.needsInteraction = needsInteraction
  }
}

const hasChromeClient = () => Boolean(chrome.runtime.getManifest().oauth2?.client_id)

async function chromeToken(interactive: boolean): Promise<string> {
  const result = await chrome.identity.getAuthToken({ interactive, scopes: SCOPES })
  if (!result?.token) throw new AuthError('Google did not return a token')
  return result.token
}

interface StoredWebToken {
  token: string
  expiresAt: number
}

async function webFlowToken(interactive: boolean): Promise<string> {
  const { [WEB_TOKEN_KEY]: stored } = (await chrome.storage.session.get(WEB_TOKEN_KEY)) as {
    [WEB_TOKEN_KEY]?: StoredWebToken
  }
  if (stored && stored.expiresAt - 60_000 > Date.now()) return stored.token
  if (!interactive) throw new AuthError('Not connected')

  const redirectUri = chrome.identity.getRedirectURL()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: WEB_CLIENT_ID,
    response_type: 'token',
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    prompt: 'consent',
    include_granted_scopes: 'true',
  }).toString()

  const responseUrl = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: true })
  if (!responseUrl) throw new AuthError('Sign-in was cancelled')
  const params = new URLSearchParams(new URL(responseUrl).hash.slice(1))
  const token = params.get('access_token')
  if (!token) throw new AuthError(params.get('error') || 'Sign-in failed')
  const expiresIn = Number(params.get('expires_in') || 3600)
  await chrome.storage.session.set({ [WEB_TOKEN_KEY]: { token, expiresAt: Date.now() + expiresIn * 1000 } })
  return token
}

export async function getToken(interactive: boolean): Promise<string> {
  if (MOCK_CALENDAR) {
    const { mockSignedOut } = await chrome.storage.local.get('mockSignedOut')
    if (mockSignedOut !== false) {
      if (!interactive) throw new AuthError('Not connected')
      await chrome.storage.local.set({ mockSignedOut: false })
    }
    return 'mock-token'
  }
  if (hasChromeClient()) {
    try {
      return await chromeToken(interactive)
    } catch (err) {
      const msg = String((err as Error)?.message ?? err)
      // Chrome without a signed-in profile, or Chromium forks: fall back to the web flow.
      const fallback = WEB_CLIENT_ID && !/did not approve|canceled|cancelled/i.test(msg)
      if (!fallback) throw new AuthError(interactive ? msg : 'Not connected', true)
    }
  }
  if (WEB_CLIENT_ID) return webFlowToken(interactive)
  throw new AuthError('No Google OAuth client is configured for this build', false)
}

/** Drop a token Google rejected (401) so the next getToken() fetches a fresh one. */
export async function invalidateToken(token: string): Promise<void> {
  if (MOCK_CALENDAR) return
  if (hasChromeClient()) await chrome.identity.removeCachedAuthToken({ token }).catch(() => {})
  await chrome.storage.session.remove(WEB_TOKEN_KEY)
}

export async function isConnected(): Promise<boolean> {
  try {
    await getToken(false)
    return true
  } catch {
    return false
  }
}

export async function signOut(): Promise<void> {
  if (MOCK_CALENDAR) {
    await chrome.storage.local.set({ mockSignedOut: true })
    return
  }
  try {
    const token = await getToken(false)
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(
      () => {},
    )
    await invalidateToken(token)
  } catch {
    /* already signed out */
  }
  if (hasChromeClient()) await chrome.identity.clearAllCachedAuthTokens().catch(() => {})
}
