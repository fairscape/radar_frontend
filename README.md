# radar-frontend

Vite + React + TypeScript single-page app for the Personal Research Radar.
Talks to the FastAPI backend ([radar_backend](https://github.com/fairscape/radar_backend))
over `/api`. The deployed system runs via Docker Compose; see
[radar_deployment](https://github.com/fairscape/radar_deployment).

`docs/UX.md` explains the process the UI is built around and the
vocabulary (an **interest** in the UI is a `profile` on the wire).

## What it does

- **Feed** (`/feed`): every paper Radar has gathered, best score first.
  Save / dismiss with buttons or keyboard (`j` `k` `s` `x`). Filter by
  interest and score bucket. Start a scan without leaving the page.
- **Interests** (`/interests`): create an interest in four steps (seeds
  from PDFs, an ORCID, a Prosopia profile or a saved profile → coherence
  check → topics → threshold from a trial scan). Saving starts the first
  scan. Each interest has a detail page with seeds, topics, threshold
  tuning, scan history and reranker diagnostics. Drafts can be resumed
  or deleted.
- **Profiles** (`/profiles`): researchers you have imported (by ORCID or
  from Prosopia), with their papers matched on OpenAlex and embedded
  once. Build any number of interests from any subset of a profile's
  papers without waiting for another import. Each profile page opens on
  two or three suggested interests found by grouping the papers'
  embeddings; each is one click from a draft.
- **Vault** (`/vault`): uploaded PDFs, filterable and tagged by interest,
  with grounded question answering over any subset.
- **Settings** (`/settings`): contact email for OpenAlex, theme, sign out.

Long-running work (scans, trial scans, imports) is tracked in
`src/lib/jobs.ts`, survives reloads, and is shown on every page.

## Install

Requires Node 18+.

```sh
npm install
cp .env.example .env.development
npm run dev          # http://localhost:5173, /api proxied to localhost:8000
```

No backend handy? Run against the in-browser mock:

```sh
VITE_USE_MOCK=1 npm run dev
```

Sign in as `demo@example.com` for seeded data, or any other email for an
empty account (the first-run flow). The mock implements the full API
contract in memory, including background jobs that progress over time.

## Build

```sh
npm run build        # tsc -b && vite build → dist/
npm run preview
```

`Dockerfile` + `nginx.conf` produce the production container.

## Layout

```
src/
├── api/          fetch client, endpoint helpers, data hooks
├── lib/          router, query cache, job tracker, toasts, theme, wizard draft store
├── ui/           shared kit (buttons, fields, dialogs, …) and domain widgets
├── pages/        one file per screen
├── mock/         in-browser mock backend (VITE_USE_MOCK=1)
├── styles/       app.css — tokens, primitives, screens
└── types/        API shapes (mirror rag_lib/api/schemas.py)
```
