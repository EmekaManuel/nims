// Take 2: (a) the in-game Prices and News tabs, (b) the public town board and the simulated week, (c) the sign-in screen and the guest press.
import { launch, signIn, clickAt, glide, startRecording, SITE } from './lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = new URL('../public/clips/', import.meta.url).pathname;
const FR = '/private/tmp/claude-501/-Users-emekamanuel-Documents-sim/b6890cae-3cb2-48f5-afc5-5ca08ed83428/scratchpad/frames-';
mkdirSync(OUT, { recursive: true });
const meta = {};
async function clip(name, opts, body) {
  const { browser, ctx, page } = await launch(opts);
  const rec = await startRecording(page, FR + name);
  const marks = {}; const t0 = () => Date.now() / 1000;
  await body(page, (k) => { marks[k] = t0(); });
  const info = await rec.finish(OUT + name + '.mp4');
  for (const k of Object.keys(marks)) marks[k] = +(marks[k] - info.startEpoch).toFixed(2);
  meta[name] = { ...info, marks };
  console.log(name, info.seconds.toFixed(1) + 's', info.frames, 'frames');
  await ctx.close(); await browser.close();
}
const tab = async (page, name) => { const b = await page.getByRole('button', { name }).first().boundingBox(); await clickAt(page, b.x + b.width / 2, b.y + b.height / 2, 650); };

// (a) the in-game tabs, as the saved guest
await clip('tour-game', {}, async (page, mark) => {
  await signIn(page);
  await page.waitForTimeout(1500);
  mark('map');
  await tab(page, /^Prices/); await page.waitForTimeout(3800); mark('prices');
  await tab(page, /^News/); await page.waitForTimeout(3800); mark('news');
  await tab(page, /^My business/); await page.waitForTimeout(1200);
  await page.getByText('Town council', { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(2800); mark('council');
});

// (b) the public pages, no sign-in
await clip('tour-public', { reuse: false }, async (page, mark) => {
  await page.goto(SITE + '#town', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); mark('board');
  await glide(page, 1100, 330, 800); await page.waitForTimeout(2500);
  await page.goto(SITE + '#sim', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); mark('sim');
  const play = page.getByRole('button', { name: /Fast-forward a week|Play/ }).first();
  if (await play.count()) { const b = await play.boundingBox(); await clickAt(page, b.x + b.width / 2, b.y + b.height / 2, 700); }
  await page.waitForTimeout(9000); mark('sim-running');
});

// (c) the sign-in screen: a fresh visitor presses "Play as a guest" (one more guest on the live game; counted in demo-data.json)
await clip('login', { reuse: false }, async (page, mark) => {
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800); mark('login');
  const g = page.getByRole('button', { name: 'Play as a guest' });
  const b = await g.boundingBox(); await clickAt(page, b.x + b.width / 2, b.y + b.height / 2, 900);
  await page.waitForTimeout(2600); mark('howto');
  await page.getByRole('button', { name: 'Start trading' }).click(); await page.waitForTimeout(1500);
  const name = page.getByPlaceholder('e.g. Ngozi'); await name.waitFor({ timeout: 8000 }); await name.fill('Visitor'); await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Start trading' }).click(); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Build a fortune/ }).click(); await page.waitForTimeout(3000); mark('town');
});
writeFileSync(OUT + 'take2.meta.json', JSON.stringify(meta, null, 2));
