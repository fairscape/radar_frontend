# Radar front-end: process model and UX

This document is the reasoning behind the 2026-09 front-end rework. It
describes what the backend actually does, what a user is trying to do,
and how the UI is shaped around that. Read it before adding a screen.

## 1. Vocabulary

| UI word        | Backend word        | What it is                                                                 |
|----------------|---------------------|----------------------------------------------------------------------------|
| **Interest**   | `profile`           | A named set of seed papers + topic filters + a score threshold. The unit Radar scans for. Renamed because "Profile" now means a researcher profile. |
| **Profile**    | `researcher`        | A stored person: a Prosopia profile or an ORCID, the metadata the source published (name, affiliation, expertise, grants), and their papers, resolved on OpenAlex and embedded once. Any subset of those papers can seed an interest, as many times as wanted, without another import. Several per user. |
| **Seed**       | seed / vault doc    | A paper that defines an interest. Comes from an uploaded PDF, or from a Prosopia import (by profile slug/URL or by ORCID). |
| **Topic**      | topic filter        | An OpenAlex (or UMLS-mapped) concept the gatherer queries. Aggregated from the seeds. |
| **Threshold**  | `threshold` (θ)     | Minimum similarity (raw cosine to the seed centroid) for a candidate to reach the feed. Set on a histogram of real scores, next to the band where the user's own seeds score. |
| **Agreement**  | `coherence_median` + `rag_lib.calibration` | How much the seeds are about the same thing, 0–100, with a label (focused / broad / mixed). Replaces raw "coherence" in the UI; see the backend's `docs/CALIBRATION.md` for the measured bands. |
| **Like your seeds / Above the bar / Below the bar** | `bucket` high / medium / low | A paper's level: as similar as the seeds themselves, above the threshold, or below it. |
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
  Its `ref` may be a Prosopia slug, a profile URL, or an ORCID; an ORCID
  is resolved to a slug by scanning the Prosopia profile list for a
  matching `rid`, so the researcher must have published a profile there.
  `POST /api/import/orcid` does the same from the works OpenAlex lists
  for an ORCID. Both also record the researcher (below), so the papers
  they embed are on hand for the next interest.
- **Researchers** (`/api/researchers`, "profiles" in the UI). `POST
  /import` with `source` (`prosopia` | `orcid`), `ref` and an optional
  `paper_ids` selection stores the person and imports their papers in
  the background under the same run/status route as the wizard's
  imports; no draft is created. Re-importing refreshes the same row.
  `GET` lists them, `GET /{id}` returns the papers, the source metadata
  and the interests built from them, `DELETE /{id}` forgets the person
  (papers and interests stay). `POST /{id}/interests` with a `name` and
  an optional `openalex_ids` subset creates a draft seeded with those
  papers **synchronously**, because they are already embedded; the
  wizard resumes it at the coherence check. `POST
  /api/profiles/draft/{slug}/seeds` attaches papers the user already
  has to any draft. An interest carries `researcherId` when it was built
  from a profile.
- **Suggested interests.** `GET /api/researchers/{id}/suggestions` groups
  the profile's papers by their stored embeddings (average-linkage
  clustering, cut on the calibrated coherence bands; see the backend's
  `rag_lib/api/services/suggestions.py`) and returns at most three
  groups, largest first, each with a name from its distinctive OpenAlex
  topic, an agreement score, and the paper ids. Not every paper has to
  be in a group: one-offs are left out, and papers in a group but
  below the same-field floor come back as `loose_ids`, unticked. A
  small profile, or one that already reads as a single topic, gets one
  suggestion and a `note` saying why. It is a read: nothing is embedded.
- `POST /draft/{slug}/coherence` measures how tightly the seeds cluster.
  One seed has no pairwise statistic; the backend reports 0.0.
- `DELETE /draft/{slug}/seeds/{openalex_id}` takes one seed out of the
  draft (the paper stays in the vault). The wizard offers it on every
  seed row in step 1 and on both papers of the least-alike pair in
  step 2, so an off-topic import can be pruned and re-checked in place.
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
   sidebar. Now: a user with no interests lands on `/start`, a one-page
   "what you can do" that leads with *add an interest* and offers the
   three ways to build one (PDFs, an ORCID, a Prosopia profile), each a
   link into the wizard with that source preselected. The Radar mark in
   the sidebar goes back to that page from anywhere. The empty feed and
   the empty interests list show the same three cards.
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
| `/start`             | Start             | What you can do; add an interest from PDFs / ORCID / Prosopia / a saved profile |
| `/feed`              | Feed              | Save / dismiss papers; Scan now       |
| `/interests`         | Interests         | New interest; resume or delete drafts |
| `/interests/new`     | New interest      | Step-by-step wizard (resumable by `?draft=slug`; `?source=upload|orcid|prosopia|profile` preselects the seed source and starts a fresh draft, setting aside one still open in the tab; `&researcher=id` preselects the profile) |
| `/interests/:key`    | Interest          | Scan now; tune threshold; add seeds; links to the profile it was built from |
| `/profiles`          | Profiles          | Saved researchers; add one by ORCID or Prosopia lookup |
| `/profiles/:id`      | Profile           | Suggested interests (default tab: two or three groups, each one click from a draft), papers, interests built from them, source metadata; new interest from these papers; re-import; forget |
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
- Score scales are calibrated, not assumed. Candidate similarities live
  in roughly 0.80–0.96; the threshold slider spans the observed scores
  plus the seed band instead of a fixed 0.5–1.0, the suggested threshold
  comes from the backend, and the number on a card is the similarity
  the threshold is compared against (the rank percentile is secondary).
- Data fetching goes through one small cache (`src/lib/query.ts`) so the
  sidebar and the page share requests; mutations invalidate by key prefix.
- The paper pick list (`src/ui/pickers.tsx`) is one component wherever a
  researcher's papers are offered as checkboxes: the wizard's ORCID and
  Prosopia sources, its "saved profile" source, and the Profiles page.
  Papers start ticked; software and dataset records start unticked.
- Import jobs started from the wizard are shown inside the wizard only;
  profile imports (which have no draft) appear in the status strip, with
  "Open" leading to the profile.

## 5. Mock mode

`VITE_USE_MOCK=1` installs a `fetch` interceptor (`src/mock/`) that
implements the API contract in memory, including background jobs that
advance over time. It exercises the real client, hooks and pages, and is
what the headless-browser smoke test drives.
