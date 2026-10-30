.PHONY: up up-mock setup backend backend-mock extension extension-watch demo test key assets

up: ## Install everything, start Ollama + model, build the extension, run demo + AI service
	scripts/run-local.sh

up-mock: ## Same as up, with canned answers instead of the model
	scripts/run-local.sh --mock

setup: ## Install backend and extension dependencies
	cd backend && uv sync
	cd extension && npm install

backend: ## Run the local AI service against Ollama
	cd backend && uv run python -m app.main

backend-mock: ## Run the local AI service with canned answers (no Ollama)
	cd backend && AMEND_MOCK=1 uv run python -m app.main

extension: ## Build the extension into extension/dist
	cd extension && npm run build

extension-watch: ## Rebuild the extension on change
	cd extension && npm run dev

demo: ## Serve the demo announcements on http://127.0.0.1:47616
	python3 -m http.server 47616 --bind 127.0.0.1 --directory demo

test: ## Backend tests + extension typecheck
	cd backend && uv run pytest -q
	cd extension && npm run typecheck

key: ## Generate a pinned extension ID
	scripts/gen-extension-key.sh

assets: ## Re-render icons and demo screenshots with headless Chrome
	scripts/render-assets.sh
