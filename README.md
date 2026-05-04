# radar-frontend

Vite + React + TypeScript SPA for the Personal Research Radar. Talks
to the FastAPI backend over HTTP; ships a parallel mock-data branch
for design work without a live backend.

The deployed system runs via Docker Compose — see
[radar_deployment](https://github.com/fairscape/radar_deployment).
This README covers the standalone frontend.

## What it does

Three views (toggle with `R` / `V` / `P`):

- **Daily Radar** — scored paper cards from today's gather pass.
  Save / dismiss buttons feed back to the selector.
- **Vault** — per-user PDF library, tagged by profile, with RAG chat
  scoped to a profile.
- **Profiles** — profile-builder wizard (seed upload → coherence
  histogram → topic filter → threshold sweep) plus selector
  diagnostics and health metrics.

The fetch layer (`src/api/`) sends `X-User-Email` from
`localStorage.userEmail`; an in-tree mock branch (`src/mock-api/`) is
selected at module init via `VITE_USE_MOCK=1` and tree-shakes out of
production builds.

## Install

Requires Node 18+.

```sh
git clone https://github.com/fairscape/radar_frontend.git
cd radar_frontend
npm install
cp .env.example .env.development
npm run dev          # http://localhost:5173
```

The dev server reads `VITE_API_BASE_URL` from `.env.development`;
default is `http://localhost:8000`. The backend must be running there
(see [radar_backend](https://github.com/fairscape/radar_backend)) — or
flip to mock mode:

```sh
echo "VITE_USE_MOCK=1" >> .env.development
npm run dev
```

## Build

```sh
npm run build        # tsc -b && vite build → dist/
npm run preview      # serve dist/ for a smoke test
```

`Dockerfile` + `nginx.conf` produce the production container used by
the deployment compose file.

## Layout

```
src/
├── api/              real backend client (fetch wrapper, endpoints, hooks)
├── mock-api/         in-tree fixture data, same shape as api/
├── lib/apiSwitch.ts  picks api/ vs mock-api/ at module init
├── views/            RadarView, VaultView, ProfilesView, ProfileWizard, ...
├── components/       shared UI
└── styles/           CSS (dark mode only)
```

Mock fixtures live in `src/mock-api/data/` — one file per resource.
Edit, HMR reloads.
