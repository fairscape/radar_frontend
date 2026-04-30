# Radar

> **Quickstart with docker-compose:** if you just want to run the demo,
> see [`../README.md`](../README.md) at the repo root — one command
> brings up backend + frontend + (optional) Ollama. This README covers
> the Vite/React app and its mock-mode toggle for local development.

Dark-mode research tool UI for a biomedical researcher. Three views: **Daily Radar** (scored paper cards), **Profiles** (selector diagnostics, health metrics), **Vault** (tagged PDF library + RAG chat).

The React frontend talks to the FastAPI backend in `radar-backend/` over HTTP. For offline demos and design work the in-tree `src/mock-api/` module is still available behind a single env-var toggle.

## Quickstart

1. Start the backend:

   ```sh
   cd ../radar-backend
   uvicorn rag_lib.api.app:app --reload --port 8000
   ```

2. In a second terminal, start the frontend:

   ```sh
   cd radar-website
   cp .env.example .env.development   # one-time
   npm install
   npm run dev
   ```

3. Open http://localhost:5173. Use `R` / `V` / `P` to switch views.

The dev server reads `VITE_API_BASE_URL` from `.env.development`; the default is `http://localhost:8000`. Override per environment by editing the file or exporting the var before `npm run dev`.

## Mock mode (no backend required)

To run the UI against the in-tree mock data without a live backend:

```sh
echo "VITE_USE_MOCK=1" >> .env.development
npm run dev
```

The bundle still ships both branches; `src/lib/apiSwitch.ts` picks one at module-init time based on the env var, and the unused branch tree-shakes cleanly because nothing in user code references the underlying namespaces directly.

## Editing the placeholder data (mock mode only)

All mock data is under `src/mock-api/data/` — one file per resource:

- `profiles.ts` — interest profiles (name, hue, health, threshold, coherence, seeds, 30-day save/dismiss counts)
- `cards.ts` — today's Daily Radar cards
- `vault.ts` — the vault's PDFs
- `seeds.ts` — seed corpus for the detail view
- `topics.ts` — OpenAlex topic chips
- `sweep.ts` — threshold calibration rows
- `coherence.ts` — pairwise-cosine histogram bins
- `chat.ts` — RAG chat scratch turns
- `feedback-log.ts` — feedback log tail lines

Edit a file, HMR reloads, the UI reflects the change.

## Architecture

| Layer | Path | Purpose |
|---|---|---|
| Fetch wrapper | `src/api/client.ts` | `apiGet`, `apiPost`, `apiPostMultipart`, `ApiError`. Sends `X-User-Email` from `localStorage.userEmail` when set (Phase 12 fills that key). |
| Endpoint helpers | `src/api/endpoints/*.ts` | One file per backend router; signatures mirror `src/mock-api/endpoints/*.ts`. |
| React hooks | `src/api/hooks/*.ts` | Mirror `src/mock-api/hooks/*` so views see no behavioral difference. |
| Switch | `src/lib/apiSwitch.ts` | Single import surface that resolves to either branch. |
| Wizard | `src/api/endpoints/wizard.ts` + `src/api/hooks/useDraft.ts` | Phase 11 wizard endpoints. Real-API only — the wizard does not have a mock fallback. |

## Design source

Prototype at `/tmp/design-extract/radar-website/project/` (exported from claude.ai/design). CSS copied verbatim from `radar.css`; JSX ported to TSX under `src/`.
