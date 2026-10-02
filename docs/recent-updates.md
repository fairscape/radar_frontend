# Recent updates (late September – early October 2026)

A summary of the user-facing changes since the Justin / Lei branches were
merged, grouped by feature. Live at https://radar.bioxplorer.org.

## 1. Feed display and de-duplication

- **Compact list.** The feed is one continuous list with hairline dividers
  instead of spaced-out cards. The "2 min read" estimate is gone.
- **No duplicates in "All interests".** A paper that belongs to several
  interests appears once. The copy you already saved or dismissed wins, and
  the row notes "also in" the other interests.
- **Save / Dismiss hit the right interest.** When a paper was in two
  interests, an action could land on the other one; it now always applies
  to the interest the card is shown under.
- **Real authors and dates.** Cards used to read "Unknown authors" and a
  date of January 1st. Both now come from OpenAlex, and older papers were
  backfilled (448 bylines, 551 dates).
- **"Seed" button on feed cards.** Adds the paper as a seed of its interest.
  The confirmation links to that interest's seeds.

## 2. ORCID paper lookup: duplicates collapsed

- Works with the same title, year, authors and type are merged into one row.
  The merged copies sit in a collapsed disclosure and can still be expanded
  and ticked.

## 3. The new-interest wizard

- **Seeds from the Vault.** Any paper in the Vault (all of them, not just
  your own uploads) can be picked as a seed.
- **Unfinished drafts.** Step 1 lists drafts you haven't finished, with a
  Resume button. Having a draft no longer blocks starting a new interest.
- **Browser Back works.** The step is in the URL, so Back returns to the
  previous step instead of leaving the wizard.
- **Step 4 shows what the threshold lets in.** Every paper from the trial
  scan is listed, best first, with a line at the threshold that moves with
  the slider. Lowering it shows exactly which papers would be added.
- **Seeds from several researchers.** Once the draft exists, step 1 offers
  "Or add papers from an ORCID or a Prosopia profile". Search, pick and add;
  then repeat for another person. The server attaches the papers, so the
  import completes even if you leave the page.

## 4. The threshold now does something

- **Scans keep every paper.** Scans used to discard everything below the
  threshold, so lowering it later showed nothing new. Now all scanned papers
  are kept, the threshold only decides which ones reach the feed, and saving
  a new threshold changes the feed immediately.
- **Threshold tab.** Lists every stored paper with the threshold line, like
  wizard step 4. Interests created earlier have nothing stored below their
  threshold until their next scan; the tab says so and offers "Scan now".

## 5. Adding a seed updates the feed right away

- Adding or removing a seed re-scores the papers the interest has already
  found against the new seeds, so the feed changes at once instead of after
  the next morning's scan. The confirmation says how many papers were
  re-scored.
- **One scale per interest.** Scores used to be ranked within each scan
  batch, so a small batch's best paper could outrank better papers from a
  big batch. Every paper of an interest is now ranked on one scale.

## 6. Editing a saved interest

- **Edit interest.** A button on the interest page walks the four steps
  again (Seeds → Check → Topics → Threshold) on the saved interest. Each
  step applies immediately; there is no final save to lose. Browser Back
  moves between steps.
- **Topics can be changed.** They were fixed after setup. Topics brought in
  by new seeds are marked "new" and start off. At least one topic must stay
  on. Changes apply from the next scan.
- **Add papers.** A header button jumps to Seeds with the Vault picker open.
- **Tabs are in the URL.** Browser Back moves between an interest's tabs,
  and other pages can link straight to one.

## 7. Saved researcher profiles

- **Check for new papers.** Replaces the old Re-import, which imported
  everything the source lists again, including papers you had deliberately
  left out. It now re-reads ORCID / Prosopia, lists only the papers not yet
  saved, and imports just the ones you tick. Nothing is removed. Interests
  built from the profile keep their seeds; add a new paper to one through
  its Seeds step.

## 8. Smaller changes

- **Paper titles open the paper everywhere:** feed, Vault list and detail,
  seed lists, ORCID / Prosopia pickers, Rank refinement, researcher papers,
  and the threshold lists. They open in a new tab.
- **Rank refinement.** The "Diagnostics" tab is now "Rank refinement". The
  reranker's queries are folded into a list of titles, each expandable to its
  full text, instead of running off the page.
- **"Ask your vault" chat is hidden** for now.
- **Dragging a link instead of a file** onto an upload area shows a hint
  explaining why nothing was added.
- **Times display correctly.** Server timestamps are read as UTC.
