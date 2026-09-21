/**
 * Headless-Chrome smoke test against the dev server in mock mode.
 *
 *   VITE_USE_MOCK=1 npx vite --port 5199 &
 *   npm run test:smoke
 *
 * Walks the real flows (first run → wizard → auto-scan → feed triage,
 * vault upload + chat, settings, draft delete, Prosopia import, forced
 * API failures) and fails on any console error or unmet expectation.
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
  section('fresh user login');
  await login('new@example.com');
  await expectText('Radar needs an interest to scan for', 'onboarding');
  await shot('onboarding');
  await clickText('a', 'Create your first interest');
  await waitText('Name it and add seed papers');
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

  section('prosopia import wizard');
  await page.goto(`${BASE}/interests/new`, { waitUntil: 'networkidle0' });
  await waitText('Where do the seeds come from');
  await clickText('.source-option', 'Import from Prosopia');
  await page.type('input[placeholder^="e.g. sheffield"]', 'unknown-person');
  await clickText('button', 'Import papers');
  await waitText('no Prosopia profile found', 5000);
  await page.click('input[placeholder^="e.g. sheffield"]', { clickCount: 3 });
  await page.type('input[placeholder^="e.g. sheffield"]', 'sheffield-nathan');
  await clickText('button', 'Import papers');
  await waitText('Prosopia import ·', 5000);
  await shot('prosopia-importing');
  await waitText('Imported from Prosopia', 30000);
  await waitText('Seeds · 12', 10000);
  await shot('prosopia-imported');
  await clickText('button', 'Next: check coherence');
  await waitText('Your seeds agree', 8000);
  await waitText('Agreement');

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
