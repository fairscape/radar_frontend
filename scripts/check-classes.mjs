/**
 * Static checks for bug classes that reviews kept finding one place at a
 * time (rounds 10-18). Each rule names the class, the shared fix to use
 * instead, and the places allowed to differ.
 *
 *   npm run check:classes
 *
 * Exits non-zero, listing file:line, when a rule is broken. A line under
 * a ``// check-classes-ok: <why>`` comment is let through.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src');

const RULES = [
  {
    name: 'score shown rounded to nearest',
    why: 'a score beside a bar must be shown rounded down: use fmtScore (lib/format.ts)',
    re: /\b(score|similarity|centroidCos|score_blended|score_raw|coh|seedSimMin|seedSimMax|seed_similarity\.(?:min|max)|band\.(?:min|max))\b[\w?.)\]! ]*\)?\.toFixed\(/,
    allow: [/VaultPage\.tsx/, /^src\/mock\//],  // chat-retrieval scores, mock data: no bar beside them
  },
  {
    name: 'count with a fixed plural',
    why: 'a number before a noun needs its singular too: use plural() (lib/format.ts)',
    re: /\{[^{}]*\b(n_\w+|\w*[cC]ount|\w*\.length|n)\}\s*(?:(?:new|more|saved|unmatched|other)\s+)?(papers|seeds|topics|interests|profiles|researchers|scans|drafts|cards|docs|groups|pages)\b/,
    allow: [],
  },
  {
    name: 'navigation past every leave guard',
    why: "force skips all registered guards, other panels' too: pass past: ['<your guard>'] (lib/router.ts)",
    re: /force:\s*true/,
    allow: [/^src\/lib\/router\.ts$/],
  },
];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx?|mjs)$/.test(e.name)) yield p;
  }
}

const problems = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(path.join(ROOT, '..'), file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line) || /check-classes-ok:/.test(lines[i - 1] ?? '')) return;
    for (const r of RULES) {
      if (r.re.test(line) && !r.allow.some((a) => a.test(rel))) {
        problems.push(`${rel}:${i + 1}: ${r.name} -- ${r.why}\n    ${line.trim().slice(0, 160)}`);
      }
    }
  });
}
// An action's error, shown, is cleared once its input is edited
// (useClearOnChange, or clearError on edit): failed-save errors stayed
// under values changed since (round 19). An action with no input says so.
for (const file of walk(ROOT)) {
  const rel = path.relative(path.join(ROOT, '..'), file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const src = lines.join('\n');
  lines.forEach((line, i) => {
    const m = /const (\w+) = useAction\(/.exec(line);
    if (!m || /check-classes-ok:/.test(lines[i - 1] ?? '')) return;
    const n = m[1];
    if (!src.includes(`${n}.error`)) return;
    if (src.includes(`useClearOnChange(${n},`) || src.includes(`${n}.clearError()`)) return;
    problems.push(`${rel}:${i + 1}: action error never cleared -- useClearOnChange(${n}, [its inputs]), or a check-classes-ok comment if it has none`);
  });
}

// Every write in src/api/endpoints refreshes what it changed (invalidate,
// markStale or setQueryData), or says where that happens / why nothing is
// cached: stale lists after a write were found one at a time (rounds 14-18).
const WRITE = /\bapi(Post|Put|Patch|Delete|PostMultipart)\b/;
const REFRESH = /\b(invalidate|invalidateExact|invalidateUnshown|invalidateWhere|markStale|setQueryData)\(/;
const NO_REFRESH = {
  getDraftCoherence: 'computes and returns; the wizard holds the result',
  startSeedUmls: 'starts a job; its status is polled',
  startDraftDryRun: 'starts a job; lib/jobs polls it',
  generateTerms: 'an unsaved preview; saveTerms refreshes',
  saveCard: 'FeedPage.act refreshes (and must not refetch the list under the reader)',
  dismissCard: 'FeedPage.act refreshes',
  candidateScores: 'computes and returns',
  gatherNow: 'lib/jobs.startScan refreshes, and again when it finishes',
  backfill: 'lib/jobs.startBackfill refreshes, and again when it finishes',
  deleteProfile: 'afterProfileDeleted, once the page has left the interest',
  postChat: 'chat: out of this check',
  clearChatHistory: 'chat: out of this check',
  updateMe: 'SettingsPage keeps the returned user',
};
const EP = path.join(ROOT, 'api', 'endpoints');
for (const f of fs.readdirSync(EP)) {
  const src = fs.readFileSync(path.join(EP, f), 'utf8');
  const parts = src.split(/\n(?=export (?:async )?function )/);
  for (const part of parts) {
    const m = /^export (?:async )?function (\w+)/.exec(part);
    if (!m || !WRITE.test(part) || REFRESH.test(part)) continue;
    if (m[1] in NO_REFRESH) continue;
    problems.push(`src/api/endpoints/${f}: ${m[1]} writes but refreshes no cache -- invalidate what it changed, or list it in NO_REFRESH with the reason`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log('check:classes ok');
