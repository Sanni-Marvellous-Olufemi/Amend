import pkg from './package.json' with { type: 'json' }

export interface ManifestEnv {
  VITE_BACKEND_URL?: string
  VITE_GOOGLE_CLIENT_ID?: string
  VITE_EXTENSION_KEY?: string
}

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
]

export function buildManifest(env: ManifestEnv): chrome.runtime.ManifestV3 {
  const backend = new URL(env.VITE_BACKEND_URL || 'http://127.0.0.1:47615')
  const manifest: chrome.runtime.ManifestV3 = {
    manifest_version: 3,
    name: 'AMEND',
    short_name: 'AMEND',
    version: pkg.version,
    description: 'See a change. Make it happen. Turn announcements into Google Calendar actions with local AI.',
    minimum_chrome_version: '116',
    permissions: ['activeTab', 'sidePanel', 'identity', 'storage'],
    host_permissions: [`${backend.origin}/*`, 'https://www.googleapis.com/*'],
    background: { service_worker: 'background.js', type: 'module' },
    side_panel: { default_path: 'sidepanel.html' },
    action: {
      default_title: 'AMEND: scan this tab',
      default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png' },
    },
    icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    commands: {
      'scan-event': {
        suggested_key: { mac: 'Command+Shift+6', default: 'Ctrl+Shift+6' },
        description: 'Scan the current tab with AMEND',
      },
      'scan-event-alt': {
        suggested_key: { mac: 'MacCtrl+Shift+E', default: 'Alt+Shift+E' },
        description: 'Scan the current tab with AMEND (alternate shortcut)',
      },
    },
  }
  if (env.VITE_EXTENSION_KEY) manifest.key = env.VITE_EXTENSION_KEY
  if (env.VITE_GOOGLE_CLIENT_ID) {
    manifest.oauth2 = { client_id: env.VITE_GOOGLE_CLIENT_ID, scopes: CALENDAR_SCOPES }
  }
  return manifest
}
