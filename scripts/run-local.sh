#!/usr/bin/env bash
# One command to run AMEND on your machine: installs what's missing, starts Ollama,
# pulls the model, builds the extension, then runs the demo pages and the AI service
# in this console. Ctrl+C stops everything this script started.
#
#   scripts/run-local.sh          real local model (downloads ~3.3 GB once)
#   scripts/run-local.sh --mock   canned answers, no Ollama or model download
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/.amend"
MODEL="${OLLAMA_MODEL:-qwen3-vl:4b-instruct}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
BACKEND_PORT=47615
DEMO_PORT=47616
MOCK=0
[[ "${1:-}" == "--mock" ]] && MOCK=1

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

mkdir -p "$LOGS"
PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

need() {
  local cmd="$1" formula="$2"
  command -v "$cmd" >/dev/null 2>&1 && return
  if command -v brew >/dev/null 2>&1; then
    bold "Installing $formula with Homebrew"
    brew install "$formula"
  elif [[ "$cmd" == "uv" ]]; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
  elif [[ "$cmd" == "ollama" ]]; then
    curl -fsSL https://ollama.com/install.sh | sh
  else
    fail "Please install $cmd (https://brew.sh makes this automatic on macOS) and run again."
  fi
}

bold "1/5  Checking tools"
need python3 python
need node node
need uv uv
[[ $MOCK == 1 ]] || need ollama ollama
node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' || fail "Node 20+ is required (found $(node -v))."

for port in $BACKEND_PORT $DEMO_PORT; do
  port_busy "$port" && fail "Port $port is already in use. Stop whatever is using it (lsof -i :$port) and run again."
done

if [[ $MOCK == 0 ]]; then
  bold "2/5  Starting Ollama and loading $MODEL"
  if ! curl -fs "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
    ollama serve >"$LOGS/ollama.log" 2>&1 &
    PIDS+=($!)
    for _ in $(seq 1 30); do curl -fs "$OLLAMA_URL/api/tags" >/dev/null 2>&1 && break; sleep 1; done
    curl -fs "$OLLAMA_URL/api/tags" >/dev/null 2>&1 || fail "Ollama didn't start. See $LOGS/ollama.log"
  fi
  if ! curl -fs "$OLLAMA_URL/api/tags" | grep -q "\"$MODEL\""; then
    echo "Downloading $MODEL (about 3.3 GB, one time)…"
    ollama pull "$MODEL"
  fi
else
  bold "2/5  Mock mode: skipping Ollama"
fi

bold "3/5  Installing dependencies"
[[ -f "$ROOT/backend/.env" ]] || cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
(cd "$ROOT/backend" && uv sync --quiet)
(cd "$ROOT/extension" && npm install --silent --no-audit --no-fund)

bold "4/5  Building the extension"
(cd "$ROOT/extension" && npm run build --silent >"$LOGS/extension-build.log" 2>&1) \
  || fail "Extension build failed. See $LOGS/extension-build.log"

bold "5/5  Starting the demo pages and the AI service"
python3 -m http.server "$DEMO_PORT" --bind 127.0.0.1 --directory "$ROOT/demo" >"$LOGS/demo.log" 2>&1 &
PIDS+=($!)

cat <<EOF

  AMEND is running.

  Extension   chrome://extensions → Developer mode → Load unpacked →
              $ROOT/extension/dist
              (already loaded? click its reload icon instead)
  Demo pages  http://127.0.0.1:$DEMO_PORT  → pick a scene → press ⌘⇧6
  AI service  http://127.0.0.1:$BACKEND_PORT/health
  Mode        $([[ $MOCK == 1 ]] && echo "mock (canned answers)" || echo "real model: $MODEL")
  Logs        $LOGS/

  Press Ctrl+C to stop.

EOF

cd "$ROOT/backend"
AMEND_MOCK=$MOCK uv run python -m app.main
