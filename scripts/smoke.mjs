/**
 * Headless-Chrome smoke test against the dev server in mock mode.
 *
 *   VITE_USE_MOCK=1 npx vite --port 5199 &
 *   npm run test:smoke
 *
 * Walks the real flows (first run → wizard → auto-scan → feed triage,
 * vault upload + chat, settings, draft delete, Prosopia import, stored
 * profiles and interests built from them, forced API failures) and
 * fails on any console error or unmet expectation.
 * Screenshots land in SHOTS (default ./smoke-shots).
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const S = process.env.SHOTS ?? path.join(process.cwd(), 'smoke-shots');
fs.mkdirSync(S, { recursive: true });
const PDF = path.join(os.tmpdir(), 'radar-smoke-seed.pdf');
fs.writeFileSync(PDF, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome';
const errors = [];
const failures = [];
let shotN = 0;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 900 });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', async (r) => { if (r.status() >= 500) console.log(`  5xx ${r.request().method()} ${r.url()} :: ${(await r.text().catch(() => '')).slice(0, 200)}`); });
page.on('requestfailed', (r) => { if (!r.url().includes('fonts.g')) errors.push(`requestfailed: ${r.url()}`); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name) { shotN += 1; await page.screenshot({ path: `${S}/${String(shotN).padStart(2, '0')}-${name}.png`, fullPage: false }); }
async function text() { return (await page.evaluate(() => document.body.innerText)).toLowerCase(); }
async function expectText(s, label = s) {
  const t = await text();
  if (!t.includes(s.toLowerCase())) { failures.push(`expected text "${label}"`); console.log(`  FAIL expect "${label}"`); return false; }
  console.log(`  ok   "${label}"`); return true;
}
async function waitText(s, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await text()).includes(s.toLowerCase())) { console.log(`  ok   waited "${s}"`); return true; } await sleep(250); }
  failures.push(`timeout waiting for "${s}"`); console.log(`  FAIL wait "${s}"`); return false;
}
async function clickText(sel, s) {
  const handles = await page.$$(sel);
  for (const h of handles) {
    const t = (await h.evaluate((el) => el.innerText || el.textContent || '')).trim();
    if (t.includes(s)) { await h.click(); return true; }
  }
  failures.push(`no ${sel} with text "${s}"`); console.log(`  FAIL click ${sel} "${s}"`); return false;
}
async function login(email) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await page.type('input[type=email]', email);
  await page.click('button[type=submit]');
  await sleep(600);
}
function section(t) { console.log(`\n== ${t}`); }

try {
  // ---------------- Fresh user: onboarding → wizard → first scan → feed ----------------
  section('fresh user login → start page');
  await login('new@example.com');
  await waitText('What you can do in Radar');
  if (!page.url().endsWith('/start')) failures.push(`fresh user should land on /start, got ${page.url()}`); else console.log('  ok   landed on /start');
  await expectText('Add an interest');
  await expectText('An ORCID');
  await shot('start');
  // The feed itself still explains what to do when there is nothing.
  await clickText('a', 'Feed');
  await waitText('Radar needs an interest to scan for');
  await expectText('Papers you have', 'feed empty state offers the three ways in');
  await shot('feed-empty');
  // The Radar mark is the way back to the overview.
  await page.click('.sidebar-brand');
  await waitText('What you can do in Radar');
  await clickText('a.home-way', 'Papers you have');
  await waitText('Name it and add seed papers');
  const uploadOn = await page.$eval('.source-option.on', (el) => el.innerText);
  if (!uploadOn.includes('Papers you have')) failures.push('?source=upload should preselect PDFs'); else console.log('  ok   source preselected');
  await shot('wizard-step1');

  section('wizard: name + upload');
  await page.type('input[placeholder^="e.g. Neonatal"]', 'Wearable sepsis sensors');
  await clickText('button', 'Create draft and add PDFs');
  await waitText('Drop PDFs here');
  if (!page.url().includes('?draft=')) failures.push('wizard url should carry ?draft=');
  const fileInput = await page.$('input[type=file]');
  await fileInput.uploadFile(PDF);
  await waitText('Seeds · 1');
  await expectText('One seed works');
  await shot('wizard-step1-seed');
  // Reload mid-wizard: state must survive.
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Seeds · 1');
  await clickText('button', 'Next: check coherence');

  section('wizard: coherence');
  await waitText('Only one seed');
  await waitText('agreement between seeds');
  await shot('wizard-step2');
  await clickText('button', 'Next: choose topics');

  section('wizard: topics');
  await waitText('of 4 selected');
  await clickText('button', 'Clear');
  await sleep(100);
  const nextDisabled = await page.$$eval('button', (bs) => bs.find((b) => b.innerText.includes('Next: set the threshold'))?.disabled);
  if (!nextDisabled) failures.push('Next should be disabled with zero topics'); else console.log('  ok   next disabled with 0 topics');
  await clickText('button', 'Select all');
  await shot('wizard-step3');
  await clickText('button', 'Next: set the threshold');

  section('wizard: trial scan');
  await waitText('Trial scan ·', 8000);
  await shot('wizard-step4-running');
  await waitText('would have reached your feed', 40000);
  await shot('wizard-step4-result');
  // Slider → preview updates
  await page.$eval('input[type=range]', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '0.95'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(200);
  await expectText('at 0.950');
  await expectText('Use suggested');
  await expectText('your seeds');
  await clickText('button', 'Save interest and start scanning');

  section('after save: detail page + auto scan');
  await waitText('is live. Scanning the last 7 days', 8000);
  if (!/\/interests\/wearable-sepsis-sensors/.test(page.url())) failures.push(`expected detail url, got ${page.url()}`);
  await waitText('Scan · Wearable sepsis sensors', 8000);
  await shot('detail-scanning');
  await waitText('new papers.', 40000);
  await shot('detail-after-scan');
  await expectText('Scans');
  await clickText('button', 'Scans');
  await waitText('Manual');
  await clickText('button', 'Threshold');
  await waitText('would pass');
  await clickText('button', 'Topics');
  await waitText('Queried');
  await clickText('button', 'Seeds');
  await waitText('Add seed PDFs');
  await clickText('button', 'Diagnostics');
  await waitText('Reranked');

  section('new interest after saving one starts clean');
  await page.goto(`${BASE}/interests/new`, { waitUntil: 'networkidle0' });
  await waitText('Name it and add seed papers', 8000);
  if (page.url().includes('?draft=')) failures.push('new wizard should not resume the committed interest');
  else console.log('  ok   fresh wizard');

  section('feed triage');
  await clickText('a', 'Feed');
  await page.waitForSelector('.paper', { timeout: 10000 });
  await shot('feed');
  const before = (await page.$$('.paper')).length;
  if (before < 1) failures.push('feed should show papers after scan');
  await clickText('.paper button', 'Save');
  await sleep(500);
  const after = (await page.$$('.paper')).length;
  if (after !== before - 1) failures.push(`saved card should disappear (before ${before}, after ${after})`); else console.log('  ok   saved card left the list');
  await page.click('input[type=checkbox]');
  await sleep(200);
  await expectText('Saved', 'saved badge');
  await clickText('.paper button', 'Abstract & details');
  await waitText('Why it scored this way');
  await shot('feed-expanded');
  // keyboard: focus first card, x to dismiss
  await page.focus('.paper');
  await page.keyboard.press('j');
  await page.keyboard.press('x');
  await sleep(500);
  await expectText('Dismissed', 'dismissed via keyboard');
  // filters
  await page.select('select', 'wearable-sepsis-sensors');
  await sleep(500);
  await clickText('.seg', 'Below the bar');
  await sleep(300);
  await shot('feed-filtered');

  section('scan now from feed + failure toast');
  await clickText('button', 'Scan now');
  await waitText('Start scan');
  await page.evaluate(() => window.__radarMock.failNext('POST /api/profiles/.*/gather-now'));
  await clickText('button', 'Start scan');
  await waitText("Couldn't start the scan", 5000);
  await shot('scan-fail-toast');
  await clickText('button', 'Start scan');
  await waitText('Scanning "Wearable sepsis sensors"', 5000);

  section('feed error state + retry');
  await page.evaluate(() => window.__radarMock.failNext('GET /api/radar/daily'));
  await page.goto(`${BASE}/feed`, { waitUntil: 'networkidle0' });
  await waitText('Simulated failure', 5000);
  await shot('feed-error');
  await clickText('button', 'Retry');
  await waitText('papers to review', 8000);

  // ---------------- Demo user ----------------
  section('demo user');
  await login('demo@example.com');
  await waitText('papers to review');
  await expectText('Neonatal vital-sign monitoring');
  await shot('demo-feed');

  section('interests list + draft delete');
  await clickText('a', 'Interests');
  await waitText('Drafts');
  await shot('demo-interests');
  await clickText('button', 'Delete');
  await waitText('Delete draft "Wearable sensors (draft)"?');
  await clickText('.dialog button', 'Delete draft');
  await waitText('Deleted draft', 5000);
  await sleep(500);
  if ((await text()).includes('drafts')) failures.push('draft section should disappear after delete');

  section('interest detail: threshold save');
  await clickText('a', 'FAIR data provenance');
  await waitText('How this interest works');
  await clickText('button', 'Threshold');
  await waitText('would pass');
  await page.$eval('input[type=number]', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '0.95'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(200);
  await clickText('button', 'Save threshold');
  await waitText('Threshold saved as 0.95', 5000);
  await expectText('where your seeds score');
  await shot('detail-threshold');

  section('vault: upload, filter, chat');
  await clickText('a', 'Vault');
  await waitText('All documents');
  const vaultInput = await page.$('input[type=file]');
  await vaultInput.uploadFile(PDF);
  await waitText('added to the Vault', 8000);
  await page.type('input[placeholder^="Filter by title"]', 'provenance');
  await sleep(300);
  await shot('vault-filtered');
  await page.click('input[placeholder^="Filter by title"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await clickText('.doc-row', 'Heart-rate variability');
  await waitText('Tagged');
  await clickText('.scope-chip', 'FAIR data provenance');
  await page.type('textarea', 'Which papers cover Merkle attestation?');
  await page.keyboard.press('Enter');
  await waitText('Retrieving and answering', 3000);
  await waitText('This is a mock answer', 10000);
  await shot('vault-chat');
  { const rows = await page.$$('.chat-src-row'); await rows[rows.length - 3].click(); }
  await waitText('Excerpt from');
  await page.type('textarea', 'please error');
  await page.keyboard.press('Enter');
  await waitText('LLM provider unreachable', 8000);

  section('settings');
  await clickText('a', 'demo@example.com');
  await waitText('Contact email for OpenAlex');
  await page.$eval('input[type=email]', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, 'polite@example.com'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await clickText('button', 'Save');
  await waitText('Contact email saved', 5000);
  await clickText('.seg', 'Dark');
  await sleep(200);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (theme !== 'dark') failures.push('theme should be dark'); else console.log('  ok   dark theme');
  await shot('settings-dark');
  await clickText('.seg', 'Light');

  section('orcid import: validation, empty orcid, pick list');
  await page.goto(`${BASE}/interests/new?source=orcid`, { waitUntil: 'networkidle0' });
  await waitText('ORCID iD');
  await page.type('input[placeholder^="0000-0001"]', 'not-an-orcid');
  await waitText('does not look like an ORCID');
  const findDisabled = await page.$$eval('button', (bs) => bs.find((b) => b.innerText.includes('Find papers'))?.disabled);
  if (!findDisabled) failures.push('Find papers should be disabled for a malformed ORCID'); else console.log('  ok   find disabled for bad orcid');
  await page.click('input[placeholder^="0000-0001"]', { clickCount: 3 });
  await page.type('input[placeholder^="0000-0001"]', 'https://orcid.org/0000-0002-0000-0000');
  await clickText('button', 'Find papers');
  await waitText('No papers on OpenAlex for this ORCID', 5000);
  await shot('orcid-empty');
  // The source picker must still be usable after a lookup: switch away and back.
  await clickText('.source-option', 'A Prosopia profile');
  await waitText('Prosopia profile');
  await clickText('.source-option', 'An ORCID');
  await waitText('ORCID iD');
  console.log('  ok   source picker switches both ways');
  await page.click('input[placeholder^="0000-0001"]', { clickCount: 3 });
  await page.type('input[placeholder^="0000-0001"]', '0000-0001-5643-4068');
  await clickText('button', 'Find papers');
  await waitText('10 of 10 papers selected', 5000);
  // Untick one, then import the rest.
  await page.click('.pick-row input');
  await waitText('9 of 10 papers selected');
  await shot('orcid-picklist');
  await clickText('button', 'Import 9 papers');
  await waitText('Import ·', 5000);
  await waitText('from ORCID 0000-0001-5643-4068', 30000);
  await waitText('Seeds · 12', 30000);
  await expectText('Nathan C. Sheffield', 'draft named after the author');
  await shot('orcid-imported');
  // Seeds can be pruned: from the list in step 1, and from the least-alike pair in step 2.
  // DOM clicks: the "Seed removed." toast sits over the footer buttons.
  const domClick = (sel, s) => page.$$eval(sel, (els, s) => { const el = els.find((e) => e.innerText.includes(s)); el?.click(); return !!el; }, s)
    .then((ok) => { if (!ok) failures.push(`no ${sel} with text "${s}"`); });
  await page.click('.seed-row.removable .icon-btn');
  await waitText('Remove this seed?');
  await clickText('.dialog button', 'Remove seed');
  await waitText('Seeds · 11', 5000);
  await domClick('button', 'Next: check coherence');
  await waitText('across 11 seeds', 10000);
  await expectText('Least alike pair');
  await shot('check-least-alike');
  await domClick('.pair-row button', 'Remove');
  await waitText('Remove this seed?');
  await clickText('.dialog button', 'Remove seed');
  await waitText('across 10 seeds', 10000);
  await domClick('button', 'Back to seeds');
  await waitText('Seeds · 10', 5000);
  console.log('  ok   seeds removable in steps 1 and 2');
  // "Choose a different way" goes back to the picker (confirm, since seeds exist).
  await clickText('button', 'Choose a different way to add seeds');
  await waitText('Start over?');
  await clickText('.dialog button', 'Start over');
  await waitText('Where do the seeds come from?', 5000);
  console.log('  ok   start over returns to the picker');

  section('prosopia import wizard');
  await page.goto(`${BASE}/interests/new`, { waitUntil: 'networkidle0' });
  await waitText('Where do the seeds come from');
  await clickText('.source-option', 'A Prosopia profile');
  await page.type('input[placeholder^="e.g. sheffield"]', 'unknown-person');
  await clickText('button', 'Find papers');
  await waitText("prosopia profile 'unknown-person' not found", 5000);
  await page.click('input[placeholder^="e.g. sheffield"]', { clickCount: 3 });
  await page.type('input[placeholder^="e.g. sheffield"]', 'https://prosopia.databio.org/api/v1/profiles/sheffield-nathan/content/profile.jsonld');
  await clickText('button', 'Find papers');
  await waitText('12 of 12 papers selected', 5000);
  await clickText('button', 'None');
  await waitText('0 of 12 papers selected');
  const impOff = await page.$$eval('button', (bs) => bs.find((b) => b.innerText.startsWith('Import 0'))?.disabled);
  if (!impOff) failures.push('Import should be disabled with nothing selected'); else console.log('  ok   import disabled with nothing selected');
  await clickText('button', 'All');
  await page.click('.pick-row input');
  await page.click('.pick-row:nth-child(2) input');
  await waitText('10 of 12 papers selected');
  // No horizontal overflow: the long titles must truncate inside the panel.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) failures.push('pick list widened the page'); else console.log('  ok   pick list stays inside the page');
  await shot('prosopia-picklist');
  await clickText('button', 'Import 10 papers');
  await waitText('Import ·', 5000);
  await waitText('Imported from Prosopia (sheffield-nathan)', 30000);
  await waitText('Seeds · 12', 10000);
  await shot('prosopia-imported');
  await clickText('button', 'Next: check coherence');
  await waitText('Your seeds agree', 8000);
  await waitText('Agreement');
  const fillW = await page.$eval('.agreement-fill', (el) => el.getBoundingClientRect().width);
  if (!(fillW > 20)) failures.push(`agreement bar fill is ${fillW}px wide`); else console.log(`  ok   agreement bar fills (${Math.round(fillW)}px)`);
  await shot('agreement');

  section('profiles: the stored researcher, and an interest built from it');
  await page.goto(`${BASE}/profiles`, { waitUntil: 'networkidle0' });
  await waitText('Nathan C. Sheffield', 5000);
  await expectText('Add a profile');
  // The wizard's Prosopia import above saved the researcher too; the seeded demo one has 14 papers.
  await shot('profiles');
  await clickText('a.interest-card', 'Nathan C. Sheffield');
  await waitText('built from these papers', 5000);
  // The profile opens on its suggested interests: two groups, each one click from a draft.
  await waitText('groups found in', 8000);
  await expectText('Neonatal intensive care', 'first suggestion named by topic');
  await expectText('loosely related', 'loose paper flagged on a suggestion');
  await shot('profile-suggested');
  await clickText('button', 'Choose papers');
  await waitText('9 of 10 papers selected', 5000);
  await clickText('button', 'Create interest with 9 papers');
  await waitText('Seeds · 9', 10000);
  await expectText('from the profile of Nathan C. Sheffield', 'draft from a suggestion lands in the wizard');
  await page.goBack({ waitUntil: 'networkidle0' });
  await page.goto(`${BASE}/profiles/7`, { waitUntil: 'networkidle0' });
  await waitText('groups found in', 8000);
  await clickText('button', 'Papers');
  await waitText('Everything imported for this researcher', 5000);
  await expectText('unmatched', 'unmatched paper flagged');
  await clickText('button', 'Interests');
  await waitText('FAIR data provenance', 5000);
  await clickText('button', 'About');
  await waitText('Affiliation');
  await shot('profile-detail');
  await clickText('button', 'New interest from these papers');
  await waitText('Whose papers to start from', 8000);
  const profileOn = await page.$eval('.source-option.on', (el) => el.innerText);
  if (!profileOn.includes('A saved profile')) failures.push('profile source should be preselected'); else console.log('  ok   profile source preselected');
  await waitText('of 14 papers selected', 5000);
  await page.click('.pick-row input');
  await waitText('13 of 14 papers selected');
  await page.type('input[placeholder^="e.g. Neonatal"]', 'Region set standards');
  await clickText('button', 'Create draft with 13 seeds');
  await waitText('13 papers from the profile of Nathan C. Sheffield', 8000);
  await waitText('Seeds · 13', 8000);
  await shot('wizard-from-profile');
  await clickText('button', 'Next: check coherence');
  await waitText('across 13 seeds', 10000);
  console.log('  ok   draft from a profile goes straight to the check');
  // The interest remembers where it came from.
  await page.goto(`${BASE}/interests/fair-provenance`, { waitUntil: 'networkidle0' });
  await waitText('Built from the profile of', 5000);
  const builtHref = await page.$$eval('.page-sub a', (as) => as.map((a) => a.getAttribute('href')).find((h) => h && h.startsWith('/profiles/')));
  if (!builtHref) failures.push('interest page should link to its profile'); else console.log(`  ok   links to ${builtHref}`);

  section('profiles: import by ORCID from the Profiles page');
  await page.goto(`${BASE}/profiles`, { waitUntil: 'networkidle0' });
  await waitText('Look up by');
  await page.type('input[placeholder^="0000-0001"]', '0000-0002-1825-0097');
  await clickText('button', 'Find papers');
  await waitText('10 of 10 papers selected', 5000);
  await clickText('button', 'Save 10 papers');
  await waitText('Import · Mock Researcher', 5000);
  await waitText('Profile "Mock Researcher" imported', 30000);
  await waitText('10 papers imported', 5000);
  await shot('profiles-imported');
  await clickText('a.interest-card', 'Mock Researcher');
  await waitText('none built from this profile yet', 8000);
  await clickText('button', 'About');
  await waitText('OpenAlex works by ORCID 0000-0002-1825-0097');
  await expectText('Only the name and papers');
  // Forgetting asks first.
  await clickText('button', 'Forget');
  await waitText('Forget Mock Researcher?');
  await clickText('.dialog button', 'Forget');
  await waitText('Forgot Mock Researcher', 5000);
  if (!page.url().endsWith('/profiles')) failures.push(`forget should return to /profiles, got ${page.url()}`); else console.log('  ok   forget returns to the list');

  section('profiles: fresh user has none');
  await login('brand-new@example.com');
  await waitText('What you can do in Radar');
  await expectText('A saved profile');
  await clickText('a.home-way', 'A saved profile');
  await waitText('No profiles saved yet', 5000);
  await page.goto(`${BASE}/interests/new?source=profile`, { waitUntil: 'networkidle0' });
  await waitText('No saved profiles yet', 5000);
  await login('demo@example.com');
  await waitText('Feed', 5000);

  section('not found + deep link');
  await page.goto(`${BASE}/interests/nope`, { waitUntil: 'networkidle0' });
  await waitText('No interest called "nope"', 5000);
  await page.goto(`${BASE}/what`, { waitUntil: 'networkidle0' });
  await waitText('There is nothing here');
  await page.goto(`${BASE}/feed?interest=fair-provenance`, { waitUntil: 'networkidle0' });
  await waitText('FAIR data provenance');

  section('sign out');
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  await clickText('button', 'Sign out');
  await waitText('Sign in');
} catch (e) {
  failures.push(`exception: ${e.stack}`);
  await shot('exception');
}

await browser.close();
console.log('\n---- console/page errors:', errors.length);
for (const e of errors) console.log(' ', e);
console.log('---- failures:', failures.length);
for (const f of failures) console.log(' ', f);
process.exit(failures.length || errors.length ? 1 : 0);
