# amend.

**See a change. Make it happen.**

AMEND is a Chrome extension for macOS that turns event announcements into Google Calendar actions. Press **⌘⇧6** while looking at a flyer, email, or group chat. AMEND captures the tab, reads it with an open-weight vision model running **locally on your Mac**, finds the matching calendar event, and proposes one of three actions: **create**, **update**, or **delete**. Nothing changes until you approve it.

```
Shortcut  →  local AI reads the screenshot  →  match against your calendar  →  you approve  →  Google Calendar updated
```

- **Local inference.** Screenshots go to `127.0.0.1` only (FastAPI + Ollama + Qwen3-VL). No paid AI API.
- **The model never touches your calendar.** It returns structured proposals. The extension, holding your OAuth token, performs writes only after you click.
- **Safe updates.** Only the fields the announcement changed are patched. Durations are preserved, and writes use `If-Match` etags so a stale review can't overwrite newer edits.
- **Safe deletes.** You see the exact event and must tick a confirmation. Ambiguous matches always ask you to choose.

## Pitch deck

[`presentation/index.html`](presentation/index.html) is the 16-slide hackathon pitch, with no build step. Open it in a browser:

```bash
open presentation/index.html
```

Use the arrow keys or Space to move between slides. Press **N** to show the speaker notes under the current slide. Add `#script` to the URL to read the whole script as one page, for example on your phone. Add `#5` to jump to slide 5.

## Repository layout

```
backend/     FastAPI service: /health, /analyze (vision → proposals), /match (rank calendar candidates)
  app/services/vision.py      Ollama client, JSON-schema constrained output, one retry on invalid JSON
  app/services/normalize.py   years, relative dates, time zones/DST, default durations, review rules
  app/services/reconcile.py   deterministic candidate scoring + model tie-break that can only add caution
  app/services/mock.py        canned answers for AMEND_MOCK=1
extension/   Chrome MV3 extension (React + TypeScript + Tailwind + shadcn/ui + Motion)
  src/background/index.ts     shortcut / toolbar click → open side panel → captureVisibleTab
  src/sidepanel/              state machine (useAmend.ts, machine.ts) and UI
  src/services/               auth, Google Calendar REST client, demo calendar, backend client
demo/        four synthetic announcements (HTML + PNG) for the live demo
presentation/  pitch deck (single HTML file, speaker notes included)
scripts/     gen-extension-key.sh (pin the extension ID), render-assets.sh (icons + demo PNGs)
```

## Run everything with one command

```bash
git clone https://github.com/Sanni-Marvellous-Olufemi/Amend.git && cd Amend
make up          # or: scripts/run-local.sh
```

This installs anything missing (Homebrew: python, node, uv, ollama), starts Ollama, downloads `qwen3-vl:4b-instruct` once (~3.3 GB), builds the extension, and runs the demo pages and the AI service in that terminal. Ctrl+C stops everything it started. Use `make up-mock` to skip the model and use canned answers.

Then load `extension/dist` once via `chrome://extensions` → Developer mode → Load unpacked, open http://127.0.0.1:47616, and press **⌘⇧6**.

## Quick start (no Google or Ollama needed)

Mock mode runs the entire flow with canned model answers and an in-browser demo calendar. Use it to try the UI first.

```bash
# prerequisites: Node 20+, Python 3.11+, uv (https://docs.astral.sh/uv/)
make setup
make backend-mock      # terminal 1: AI service on http://127.0.0.1:47615 with canned answers
make demo              # terminal 2: demo announcements on http://127.0.0.1:47616
make extension         # builds extension/dist (uses the demo calendar when no OAuth client is set)
```

Then go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `extension/dist`. Open http://127.0.0.1:47616 and press **⌘⇧6** on a scenario.

Shortcut: `cd extension && npm run chrome` opens a separate Chrome window with AMEND already installed. Recent Chrome versions ignore the `--load-extension` flag, so this uses Chrome's debugging protocol instead.

If you are driving a **Linux** machine (for example a remote desktop) from a Mac, ⌘ arrives as the Super key, which Linux Chrome doesn't allow in extension shortcuts. Press **Control+Shift+6** there instead, or click the AMEND toolbar icon.

## Full setup

### 1. Local model (Ollama + Qwen3-VL)

```bash
brew install ollama
ollama serve                         # leave running
ollama pull qwen3-vl:4b-instruct     # ~3.3 GB
```

On Apple Silicon or a GPU, a screenshot takes a few seconds. On a CPU-only machine (4 cores, no GPU) it takes about 30–70 s once the model is warm, and up to about 2 minutes for the first call. The side panel shows a running timer, and the timeouts can be raised with `AMEND_TIMEOUT_S` (backend) and `VITE_ANALYZE_TIMEOUT_MS` (extension).

On a Mac that struggles with the 4B model, try a smaller vision model and set `OLLAMA_MODEL` in `backend/.env` (for example `qwen2.5vl:3b`). Keep it open-weight.

### 2. Pin the extension ID

Unpacked extensions otherwise get a different ID on every machine, which would break OAuth and the backend's origin check.

```bash
make key    # writes extension/key.pem (gitignored), extension/.env.local, backend/.env; prints the ID
```

### 3. Google Cloud OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project named `AMEND`.
2. **APIs & Services → Library**: enable the **Google Calendar API**.
3. **OAuth consent screen**: choose External and Testing, and add your demo Google account as a **test user**. Add the scopes `.../auth/calendar.events` and `.../auth/calendar.calendarlist.readonly`.
4. **Credentials → Create credentials → OAuth client ID → Chrome Extension**: paste the extension ID from step 2, then put the client ID in `extension/.env.local` as `VITE_GOOGLE_CLIENT_ID=...`.
5. *(Recommended fallback)* Create another OAuth client of type **Web application** with the authorized redirect URI `https://<extension-id>.chromiumapp.org/`, and set `VITE_GOOGLE_WEB_CLIENT_ID=...`. This is used when Chrome isn't signed into a Google profile, and in Chromium-based browsers without `getAuthToken`.
6. In Google Calendar, create a dedicated calendar such as **AMEND Demo**. Choose it in the AMEND panel. **Never demo deletes on your real calendar.**

Client IDs are not secrets, but `.env.local` is gitignored anyway. AMEND never uses a client secret.

### 4. Run it

```bash
make backend        # AI service against Ollama
make extension      # rebuild after changing .env.local, then click ↻ on chrome://extensions
```

### 5. Keyboard shortcut

The default is **⌘⇧6**, with **⌃⇧E** as a backup. On Macs with a Touch Bar, macOS reserves ⌘⇧6 for Touch Bar screenshots; use the backup or remap at `chrome://extensions/shortcuts`. Clicking the AMEND toolbar icon also scans the current tab.

`captureVisibleTab` can't capture `chrome://` pages, the Chrome Web Store, or other extensions. In those cases, paste a screenshot into the panel with **⌘V**.

## Demo script

Run the scenarios in order from http://127.0.0.1:47616. With a real Google calendar, first create **ACM Tech Night** on Fri Nov 6, 2026, 4:00–6:00 PM, and **ACM Tech Talk** the same evening, so scenes 2 and 4 have something to match. The demo calendar comes pre-seeded with both.

| Scene | Page | What happens |
| --- | --- | --- |
| 1 · Create | Robotics Workshop flyer | Extracts Nov 12, 3:00–4:30 PM, Engineering Lab. You approve and the event is inserted. |
| 2 · Update | `#acm-general` chat | "now at 5:30 PM instead of 4:00" matches ACM Tech Night. A before/after shows 4:00 → 5:30 with the 2-hour duration kept. Only the time is patched. |
| 3 · Delete | Email | "Robotics Workshop … has been cancelled" matches the event from scene 1. You tick the confirmation and the event is deleted. |
| 4 · Ambiguous | ACM post | "Friday's ACM event" matches several events. AMEND asks which one. |

## How it works

```
Extension (owns Google token)                Backend on 127.0.0.1 (never sees tokens)
──────────────────────────────               ─────────────────────────────────────────
⌘⇧6 → sidePanel.open (sync, in gesture)
     → captureVisibleTab → storage.session
side panel: downscale to 1600px ─────────►   POST /analyze → Ollama (JSON-schema output)
                                 ◄─────────   proposals (normalized dates, tz, review flags)
events.list(singleEvents, ~90 days)
sanitized candidates (id/title/time/place) ►  POST /match → scores + optional model tie-break
                                 ◄─────────   single | ambiguous | none
user reviews + approves
events.insert (deterministic id) / patch (If-Match) / delete (If-Match), sendUpdates=none
```

Notes on the safety design:

- **Operation IDs.** Every scan has an `opId`, and responses for an older scan are dropped. Inserts use an event ID derived from the `opId`, so retrying returns HTTP 409 instead of creating a duplicate.
- **What the model can produce.** Model output is limited to a schema with no time zones and no guessed years. The backend resolves years, relative words like "tomorrow" and "next Friday", and DST. Tentative cancellations, unclear dates, and missing values are flagged for review.
- **Prompt injection.** Text in screenshots is treated as data. The model can only describe events, and it can never choose an event ID that wasn't in the candidate list. If it disagrees with the deterministic matcher, the result becomes "ambiguous".
- **Recurring events.** Only the single occurrence is changed, because events are listed with `singleEvents=true`.
- **Backend exposure.** The backend binds to `127.0.0.1` and only accepts requests whose `Origin` is the pinned extension and that carry the `X-Amend-Client` header. It never logs screenshots. The full screenshot is cleared from session storage after analysis.

## Development

```bash
make test             # backend pytest + extension typecheck
make extension-watch  # rebuild extension/dist on change
make assets           # re-render icons and demo PNGs with headless Chrome
```

Backend environment variables are listed in `backend/.env.example`; extension variables are in `extension/.env.example`.

## Model attribution

AMEND's inference uses **Qwen3-VL-4B-Instruct** (Ollama tag `qwen3-vl:4b-instruct`) by the Qwen team at Alibaba Cloud, licensed under the **Apache License 2.0**. The weights are downloaded separately by Ollama and are not distributed in this repository. See https://ollama.com/library/qwen3-vl and https://huggingface.co/Qwen.

## Privacy

Screenshots stay on your machine and are processed by the local model. Calendar reads and writes go directly from the extension to Google's Calendar API using your OAuth token, so event data is transmitted to Google as with any calendar client. AMEND has no server and no analytics, and it stores only your selected calendar and short-lived session state in Chrome storage.

## License

Apache License 2.0 (see `LICENSE`). The Qwen3-VL model weights are licensed separately, also under Apache-2.0.
