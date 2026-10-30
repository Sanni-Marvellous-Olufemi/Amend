import type { ScanRecord } from '@/types/events'

const DEBOUNCE_MS = 600
let lastScanAt = 0

chrome.runtime.onInstalled.addListener(() => {
  // We handle action clicks ourselves so a click both opens the panel and captures.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {})
})

function friendlyCaptureError(err: unknown): string {
  const msg = String((err as Error)?.message ?? err)
  if (/chrome:\/\/|cannot be scripted|chrome-extension|webstore|devtools/i.test(msg)) {
    return 'Chrome does not allow capturing this page. Open the announcement in a normal tab, or paste a screenshot.'
  }
  if (/activeTab|permission|<all_urls>/i.test(msg)) {
    return 'AMEND needs you to press the shortcut on the page you want to scan. Or paste a screenshot.'
  }
  if (/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/i.test(msg)) {
    return 'Scanning too quickly. Wait a moment and try again.'
  }
  return `Could not capture this tab: ${msg}`
}

async function capture(tab: chrome.tabs.Tab, source: ScanRecord['source'], opId: string) {
  await chrome.storage.session.set({
    scan: { opId, status: 'CAPTURING', tabId: tab.id, tabTitle: tab.title, source } satisfies ScanRecord,
  })
  try {
    const image = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 85 })
    const record: ScanRecord = {
      opId,
      status: 'CAPTURED',
      tabId: tab.id,
      tabTitle: tab.title,
      image,
      capturedAt: new Date().toISOString(),
      source,
    }
    await chrome.storage.session.set({ scan: record })
  } catch (err) {
    await chrome.storage.session.set({
      scan: { opId, status: 'CAPTURE_ERROR', tabId: tab.id, error: friendlyCaptureError(err), source } satisfies ScanRecord,
    })
  }
  chrome.runtime.sendMessage({ type: 'CAPTURE_UPDATED', opId }).catch(() => {})
}

function startScan(tab: chrome.tabs.Tab | undefined, source: ScanRecord['source']) {
  if (!tab?.id || tab.windowId === undefined) return
  // Must run before any await: sidePanel.open() only works inside the user gesture.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})

  const now = Date.now()
  if (now - lastScanAt < DEBOUNCE_MS) return
  lastScanAt = now
  void capture(tab, source, crypto.randomUUID())
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'scan-event' || command === 'scan-event-alt') startScan(tab, 'shortcut')
})

chrome.action.onClicked.addListener((tab) => startScan(tab, 'action'))

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'RESCAN') return
  chrome.tabs
    .query({ active: true, lastFocusedWindow: true })
    .then(([tab]) => {
      if (!tab) throw new Error('No active tab')
      return capture(tab, 'action', crypto.randomUUID())
    })
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }))
  return true
})
