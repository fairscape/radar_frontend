# Changelog: radar_frontend

Every update of the live site (https://bioxplorer.org; https://radar.bioxplorer.org before 2026-11), newest first.
The backend has its own changelog (`radar_backend/CHANGELOG.md`), with the
operations side (migrations, settings, data files); the two are deployed
together, and each entry names the backend commit that went live with it.

**Branches.** `main` is what runs online; `develop` holds changes that have
been reviewed, tested and tried on the test site but are not online yet.
An update online fast-forwards `main` to `develop`, tags it `vYYYY.MM.DD`,
and adds an entry here.

Times are UTC. Entries before 2026-11-16 were written afterwards from the
deploy logs. The code went online from the working copy and was committed
soon after, so for those entries "commit" means the first commit that
contains the change. An update that changed only the backend says so.

---

## v2026.11.17 (2026-11-17 19:18): the site is https://bioxplorer.org
Backend: `v2026.11.17`.
- The site moved to https://bioxplorer.org; radar.bioxplorer.org is retired. See the backend changelog.
- No code change: the frontend has no absolute self-URLs. README and docs name the new site.
- Everyone signs in once more on the new name. Drafts kept in the browser (per site) start fresh.

## v2026.11.16 (2026-11-16 21:11)
Backend: `v2026.11.16`.

- **About page**:
  - New public page `/about` with three sections: Personalised Search, Evaluation of BioXplorer, Sustainability of BioXplorer. They were adapted from the bioxplorer.org home page to say only what the site does today.
  - It is linked from the sign-in page, the Privacy page and the bottom of Settings. The Settings links open a new tab, so that tab keeps the right to change things.
  - `/about` and `/privacy` get proper paragraph spacing, and the browser tab says "About · BioXplorer" / "Privacy · BioXplorer".
  - The Privacy page now mentions the web server's access log (time, address asked for, IP address, browser).
- **Edit interest → Topics**:
  - The step waits until the seeds have been read: "Extracting UMLS concepts: x of y seeds read…", as new-interest step 3 already did. Then it shows the whole list.
- **Topics no seed brings any more**: they say why.
  - "its seed paper was removed" goes with the notice "N topics were brought by seed papers you removed".
  - "no seed brings it now" goes with a notice that a seed was read again or OpenAlex classed it again.
- **UMLS notice**: it offers "Read them now" / "Try again" instead of asking for a reload.

## 2026-11-12 07:34: UMLS topics from the sentence a concept is read in
Commit `33bcede`. Backend `0d36c99`.
- UMLS topics show the word the paper uses: from "word" (UMLS: concept).

## 2026-11-11 22:01: Ollama on CUDA
- Operations only; no frontend change.

## 2026-11-11 02:43: frontend review batches 2–5
Commit `476831c`. Backend `127cddd`.
- While a save runs, nothing else can be done on the account, and the page cannot be left until the save ends. Sign out is the exception; the server finishes the save.
- Going Back in Edit interest keeps the threshold.
- A refused write's error is no longer wiped by the reload that follows.
- Vault delete texts match what the backend did.
- Scores are rounded down, never up.
- Texts now match what happens.

## 2026-11-07 05:54: UMLS similarity bar
- Backend only.

## 2026-11-06 16:49: switched-off topics hide their papers
Commit `8f3c7c5`. Backend `4c8a052`.
- Topic texts explain that switching a topic off takes its papers out of the feed.
- Research topics can be deleted for good.
- Text that looks like an API key is refused before it is sent or remembered.

## 2026-11-05 20:13: fixes from the 2026-11-05 review
Commit `73ff9f1`. Backend `4a09251`.
- Research topics follow the draft's life.
- A reload does not count as leaving, and a tab that loses the right to change things stays on its page, view-only.
- An expired edit copy is kept until you confirm.

## 2026-11-05 05:27: research topics on new-interest step 3
Commit `73ff9f1`.
- Step 3 has the same Research topics panel as an interest. What you generate, edit or delete is saved to the draft at once.
- Topics written by Claude can be turned into LLM topics, which start off. The key is not stored.

## 2026-11-05 03:01: OpenAlex API key
- Backend only.

## 2026-11-05 01:02: no topics guessed from unpublished PDFs
Commit `73ff9f1`. Backend `4a09251`.
- The upload notice says only that the paper has no OpenAlex topics.
- Old guessed topics show "PDF (old)".

## 2026-11-04 21:21: one tab changes an account
Commit `73ff9f1`. Backend `4a09251`.
- Other tabs are view-only: they show a banner and their write buttons are off.
- Sign out signs out this tab only; the last tab signs out for real.

## 2026-11-04 18:47: frontend review batch 1
Commit `73ff9f1`.
- No endless resend after a refused write.
- Polls no longer report false failures.
- "Session expired" brings you back to the page you were on.
- Sign out asks first; polling pauses after sign-out.
- Clearer network-error and Settings texts.

## 2026-11-04 06:32: abstracts headed "Abstract |"
- Backend only.

## 2026-11-04 05:02: a new interest's draft opens in one tab at a time
Commit `b5301d5`. Backend `e10f505`.
- Another tab, Resume included, is told the draft is open elsewhere.

## 2026-11-04 02:18: upload times on seeds, deleted marks
Commit `febd4eb`. Backend `77a27d0`.
- Seeds show when their PDF was uploaded, and seeds whose paper was deleted are marked.

## 2026-11-03 21:24: Prosopia's paged lists; Prosopia sign-in on
- Backend only.

## 2026-11-03 18:58: sign in with Google or Prosopia
Commit `febd4eb`, from nsheff's frontend PR #2. Backend `77a27d0`.
- **Sign-in page**: "Sign in with Google" and "Sign in with Prosopia" buttons, plus a public `/privacy` page.
- Sign out goes through `/auth/logout`.
- **Prosopia profile**: a "Your Prosopia profile" card for people who signed in with Prosopia, and `/profiles/:id?check` opens "Check for new papers".
- Review fixes CR.1–CR.11.

## 2026-11-02 15:06: online with a new, empty database
Commit `54a6976`. Backend `0cca0c5`.
- The site switched to `functional-spec-oct2026` with an empty database.
- New since the previous site:
  - the BioXplorer name;
  - a draft sandbox;
  - upload versions and OpenAlex status;
  - Edit interest on a copy, one tab at a time;
  - UMLS and seed-removal topic texts;
  - adding seeds from an interest's feed;
  - per-user imports with an optional researcher profile, and Prosopia interests on the topic list;
  - duplicate seeds;
  - a per-interest Saved list;
  - papers stay in the Vault;
  - deleting an uploaded PDF.
