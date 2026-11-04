import { chromium } from '../node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2];
mkdirSync(OUT + '/video', { recursive: true });
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: exe });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT + '/video', size: { width: 1280, height: 720 } } });
const p = await ctx.newPage();
const D = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const t0 = Date.now();
const cues = [];
const wait = (ms) => p.waitForTimeout(ms);
/** Start a spoken line now; the returned promise resolves when it has finished (plus a short breath). Actions run alongside it. */
const vo = (k) => { cues.push({ k, start: (Date.now() - t0) / 1000 }); return wait(D[k] * 1000 + 350); };
let shot = 0;
const snap = async (n) => p.screenshot({ path: `${OUT}/f-${String(++shot).padStart(2, '0')}-${n}.png` });

/** Clean footage: captions and cards are drawn later by Remotion, so here they only keep the timing. */
async function caption(_text, ms = 0) { if (ms) await wait(ms); }
async function card(_t, _s, ms) { await wait(ms); }
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log(`STEP FAILED: ${name}: ${String(e).split('\n')[0]}`); await snap('FAIL-' + name); } };
const stall = (name) => p.locator('svg.map').getByText(name, { exact: false }).first();
const tab = (name) => p.locator('nav, .dock, footer').getByText(name, { exact: true }).first();
const click = (loc) => loc.click({ timeout: 8000, force: true });


await p.goto('http://localhost:3100/');
{ const v = vo('title'); await card('Nims', 'A market town where every trader is an AI agent with its own cash, stock and mind about prices.', D.title * 1000); await v; }

await step('login', async () => {
  let v = vo('login');
  await caption('Sign in with just an email. No wallet, no seed phrase, no gas.');
  await wait(900);
  await p.fill('input[type=email]', `demo${Date.now() % 100000}@nims.game`);
  await wait(800);
  await p.click('text=Send me a link');
  await v;
  v = vo('login2');
  await wait(600);
  await p.click('text=Open my link');
  await wait(2500);
  await caption('');
  await p.getByRole('button', { name: 'Start trading' }).click();
  await v;
});

await step('goal', async () => {
  const v = vo('goal');
  await caption('Pick a goal. Nim, your guide, always says what to do next.');
  await wait(2800);
  await p.getByRole('button', { name: 'Build a fortune' }).click();
  await v;
});

/** Open a stall. Any open side panel is closed first, because on this map it covers the fabric market. */
const openStall = async (name) => {
  if (await p.locator('button.drawer-close').isVisible()) { await click(p.locator('button.drawer-close')); await wait(500); }
  await click(stall(name));
};
const collect = async (item) => {
  const src = p.locator(`g.source[aria-label*="${item}"]`).first();
  const btn = p.getByRole('button', { name: new RegExp(`Collect ${item}`) });
  const shown = () => btn.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false);
  if (await p.locator('button.drawer-close').isVisible()) { await click(p.locator('button.drawer-close')); await wait(500); }
  await click(src);
  // If the spot was already selected the click closes it: click again, but only after giving the first click time to show its panel.
  if (!(await shown())) { await click(src); await shown(); }
  await click(btn);
  await wait(900);
};

await step('collect', async () => {
  const v = vo('collect');
  await caption('Buy at wholesale, carry it to a stall that pays more.');
  await collect('cotton');
  await v;
});

await step('tooltip', async () => {
  const v = vo('tooltip');
  await openStall('Lena');
  await wait(1000);
  await caption('Hover a price and the merchant explains it in their own words.');
  await p.locator('.price').first().hover();
  await v;
  await caption('');
});

await step('sale', async () => {
  await p.mouse.move(900, 640); // let the price tooltip close so it cannot swallow the click
  await wait(400);
  await click(p.locator('tr', { hasText: 'Cotton' }).getByRole('button', { name: 'All' }));
  const v = vo('sale');
  await v;
});

await step('order', async () => {
  let v = vo('order');
  await collect('cotton');
  await caption('Place a delivery order: the goods, and the lowest price you will take.');
  await openStall('Lena');
  await wait(900);
  await p.getByText('Send it here when the price is right').scrollIntoViewIfNeeded();
  await p.selectOption('#order-item', { label: 'Cotton' });
  // Limit: a bit under what the stall pays right now, so the order fills on the next tick. Units: exactly what is carried.
  const pay = Number(((await p.locator('tr', { hasText: 'Cotton' }).locator('.price').first().textContent()) ?? '').replace(/[^0-9]/g, ''));
  const carried = Number(((await p.locator('text=/^\\d+\\/\\d+$/').first().textContent()) ?? '0').split('/')[0]);
  console.log('order: pays', pay, 'carried', carried);
  await p.fill('#order-min', String(Math.max(1, Math.floor(pay * 0.85))));
  await p.fill('#order-units', String(Math.max(1, carried)));
  await v;
  v = vo('order2');
  await caption('The town’s carriers wait for your price, then take the load over and sell it.');
  await click(p.getByRole('button', { name: 'Place order' }));
  await v;
  v = vo('order3');
  await caption('Filled: sold, with no walking.');
  await v;
  await caption('');
});

await step('prices', async () => {
  const v = vo('prices');
  await click(tab('Prices'));
  await v;
});

await step('ownership', async () => {
  const v = vo('shares');
  await openStall('Mira');
  await v;
});

await step('fastforward', async () => {
  await p.goto('http://localhost:3100/#sim');
  let v = vo('ff');
  await wait(800);
  await p.getByRole('button', { name: /Fast-forward a week/ }).click();
  await v;
  v = vo('ff2');
  // Bring the price charts into view so the crash can be seen.
  await wait(600);
  await p.evaluate(() => window.scrollTo({ top: 400, behavior: 'smooth' }));
  await v;
  v = vo('ff3');
  await p.mouse.move(640, 330);
  await v;
});

await caption('');
{ const v = vo('outro'); await card('Nims', 'The economy is the game. No wallet, no seed phrase, no gas.', D.outro * 1000); await v; }
writeFileSync(OUT + '/cues.json', JSON.stringify({ cues, total: (Date.now() - t0) / 1000 }, null, 1));
await ctx.close();
await b.close();
console.log('done');
