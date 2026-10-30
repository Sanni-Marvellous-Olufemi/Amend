#!/usr/bin/env bash
# Pins the unpacked extension's ID so the Google OAuth client and backend CORS keep working
# across machines and reinstalls. Writes the private key to extension/key.pem (gitignored)
# and the public key + derived ID to extension/.env.local and backend/.env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PEM="$ROOT/extension/key.pem"

if [[ ! -f "$PEM" ]]; then
  openssl genrsa -out "$PEM" 2048 2>/dev/null
  echo "Created $PEM (keep it private; it is gitignored)"
fi

PUBLIC_KEY="$(openssl rsa -in "$PEM" -pubout -outform DER 2>/dev/null | openssl base64 -A)"
EXTENSION_ID="$(openssl rsa -in "$PEM" -pubout -outform DER 2>/dev/null | openssl dgst -sha256 -binary \
  | xxd -p -c 256 | head -c 32 | tr '0-9a-f' 'a-p')"

upsert() { # file key value
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -q "^$key=" "$file"; then
    grep -v "^$key=" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  fi
  echo "$key=$value" >> "$file"
}

upsert "$ROOT/extension/.env.local" VITE_EXTENSION_KEY "$PUBLIC_KEY"
upsert "$ROOT/backend/.env" AMEND_EXTENSION_ID "$EXTENSION_ID"

echo
echo "Extension ID: $EXTENSION_ID"
echo "  - wrote VITE_EXTENSION_KEY to extension/.env.local"
echo "  - wrote AMEND_EXTENSION_ID to backend/.env"
echo "Use this ID for the Google OAuth 'Chrome Extension' client, and"
echo "https://$EXTENSION_ID.chromiumapp.org/ as the redirect URI of the optional 'Web application' client."
