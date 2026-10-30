#!/usr/bin/env bash
# Renders extension icons and demo screenshots with headless Chrome.
# Usage: scripts/render-assets.sh   (set CHROME=/path/to/chrome if not auto-detected)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-}"
if [[ -z "$CHROME" ]]; then
  for candidate in google-chrome chromium chromium-browser \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if command -v "$candidate" >/dev/null 2>&1 || [[ -x "$candidate" ]]; then CHROME="$candidate"; break; fi
  done
fi
[[ -n "$CHROME" ]] || { echo "Chrome not found; set CHROME=..." >&2; exit 1; }

shot() { # url out width height
  local profile
  profile="$(mktemp -d)"
  # Headless Chrome sometimes writes the screenshot but never exits; the timeout covers that.
  timeout 20 "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --no-first-run --no-default-browser-check --user-data-dir="$profile" \
    --default-background-color=00000000 --window-size="$3,$4" --screenshot="$2" "$1" >/dev/null 2>&1 || true
  rm -rf "$profile"
  [[ -s "$2" ]] || { echo "Failed to render $2" >&2; return 1; }
}

mkdir -p "$ROOT/extension/public/icons"
for size in 16 32 48 128; do
  shot "file://$ROOT/scripts/assets/icon.html" "$ROOT/extension/public/icons/icon$size.png" "$size" "$size"
done

for page in create rescheduled cancelled ambiguous; do
  shot "file://$ROOT/demo/$page.html?capture" "$ROOT/demo/$page.png" 1280 800
done

echo "Rendered icons to extension/public/icons and screenshots to demo/*.png"
