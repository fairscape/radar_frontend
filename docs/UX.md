# Radar front-end: process model and UX

This document is the reasoning behind the 2026-09 front-end rework. It
describes what the backend actually does, what a user is trying to do,
and how the UI is shaped around that. Read it before adding a screen.

## 1. Vocabulary

| UI word        | Backend word        | What it is                                                                 |
|----------------|---------------------|----------------------------------------------------------------------------|
| **Interest**   | `profile`           | A named set of seed papers + topic filters + a score threshold. The unit Radar scans for. Renamed because "Profile" now means a Prosopia researcher profile. |
| **Seed**       | seed / vault doc    | A paper that defines an interest. Comes from an uploaded PDF or a Prosopia import. |
| **Topic**      | topic filter        | An OpenAlex (or UMLS-mapped) concept the gatherer queries. Aggregated from the seeds. |
| **Threshold**  | `threshold` (θ)     | Minimum similarity for a candidate to count as a hit. Set by looking at a histogram of real scores. |
| **Scan**       | gather run          | One background pass: query OpenAlex for the last N days → embed → score against the interest → persist candidates. Has live progress. |
| **Paper**      | candidate / card    | A scored paper attached to one interest. State: new, saved, dismissed. |
| **Feed**       | daily radar         | The top 200 candidates across all interests, best score first, with triage state. Not date-bounded. |
| **Vault**      | vault               | The user's uploaded PDFs, tagged by interest, chunked for chat. |
| **Chat**       | RAG chat            | Single-shot question over the vault, optionally scoped to interests. |

The rename lives in `src/lib/terms.ts`. Every label goes through it, so
changing the word again is one edit. API paths still say `profiles`.

## 2. What the backend really does

- `POST /api/profiles/draft` creates a draft interest. Uploading PDFs
  with `profile_slug` attaches them as seeds. `POST /api/import/prosopia`
  creates a draft and seeds it in the background (poll `/api/import/prosopia/{run}`).
- `POST /draft/{slug}/coherence` measures how tightly the seeds cluster.
  One seed has no pairwise statistic; the backend reports 0.0.
- `GET /draft/{slug}/topics` returns the aggregated topics.
- `POST /draft/{slug}/dry-run` starts an async 30-day trial scan that does
  **not** persist candidates; the result gives raw scores for the
  threshold histogram plus a preview list.
- `POST /api/profiles` commits the draft: fits the selector, registers a
  daily schedule (04:00 UTC by default). **It does not run a scan.** A
  freshly committed interest therefore has an empty feed until a scan runs.
- `POST /{key}/gather-now?days&limit` starts a real scan; progress is on
  `GET /{key}/runs` (`current_step`, `n_processed`, `n_total`, `last_message`).
- `GET /api/radar/daily` returns the top candidates over everything ever
  gathered, saved/dismissed included (state in `states`). Nothing is
  filtered by threshold here.
- `POST /{key}/dry-run` on a live interest is not a scan; it returns the
  persisted candidate scores so the threshold can be re-tuned.
- Only drafts can be deleted (`DELETE /draft/{slug}`). Live interests cannot.
- Diagnostics: `/{key}/reranker-comparison`, `/{key}/topic-yield`, `/{key}/runs`, `/{key}/feedback`.

## 3. The user's process

```
sign in ─► create an interest ─► first scan ─► triage the feed daily
               │                                   │
               │  name → seeds → check → topics    │  save / dismiss
               │        → calibrate → save         │  (feeds the selector)
               │                                   ▼
               └──────────────► maintain: add seeds, re-tune threshold,
                                scan again, read diagnostics
```

Three things the old UI got wrong about this process:

1. **There was no path into it.** A new user landed on a feed that said
   "no cards" with no explanation, and the wizard was a small link in a
   sidebar. Now: no interests ⇒ the feed *is* the onboarding, with a
   single primary action.
2. **Long-running work was invisible.** Scans, dry-runs and imports run
   for minutes. State lived inside one component and vanished when you
   navigated. Now: a global job tracker (`src/lib/jobs.ts`) persists
   running jobs in `sessionStorage`, polls them, shows a status strip on
   every page, and refreshes the affected data when they finish.
3. **A finished wizard produced nothing to look at.** Now: saving an
   interest immediately starts a 7-day scan and takes the user to the
   interest page with the scan's progress visible.

## 4. Screens

| Route                | Screen            | Primary action                        |
|----------------------|-------------------|---------------------------------------|
| `/feed`              | Feed              | Save / dismiss papers; Scan now       |
| `/interests`         | Interests         | New interest; resume or delete drafts |
| `/interests/new`     | New interest      | Step-by-step wizard (resumable by `?draft=slug`) |
| `/interests/:key`    | Interest          | Scan now; tune threshold; add seeds   |
| `/vault`             | Vault             | Upload PDFs; ask a question           |
| `/settings`          | Settings          | Contact email; theme; sign out        |

Rules applied everywhere:

- One layout, one stylesheet (`src/styles/app.css`). No modes.
- Buttons are `<button>`s with a visible border or fill, hover, focus ring,
  disabled and loading states. Anything that looks clickable is clickable.
- Every async action shows its own progress on the control that started it
  and reports failure next to it, in words.
- Every list has three explicit states: loading, empty (with what to do), error (with retry).
- Nothing is displayed that the backend does not return. The old
  hard-coded diagnostics ("Prec@10 0.71", "centroid drift 0.024") are gone.
- Data fetching goes through one small cache (`src/lib/query.ts`) so the
  sidebar and the page share requests; mutations invalidate by key prefix.

## 5. Mock mode

`VITE_USE_MOCK=1` installs a `fetch` interceptor (`src/mock/`) that
implements the API contract in memory, including background jobs that
advance over time. It exercises the real client, hooks and pages, and is
what the headless-browser smoke test drives.
