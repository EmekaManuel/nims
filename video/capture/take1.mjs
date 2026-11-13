// Take 1: two real trades on the live game as the saved guest. Records the screen (1920x1080) and, at each moment that matters,
// the game's own state (/game/state) and the chain proof (/game/chain), so the video's overlays come from real data.
import { launch, signIn, state, clickAt, glide, startRecording } from './lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = new URL('../public/clips/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const { browser, ctx, page } = await launch();
const rec = await startRecording(page, '/private/tmp/claude-501/-Users-emekamanuel-Documents-sim/b6890cae-3cb2-48f5-afc5-5ca08ed83428/scratchpad/frames-take1');
const t0 = Date.now();
const ev = [];
const chain = () => page.evaluate(() => fetch('/game/chain', { credentials: 'include' }).then((r) => r.json()).catch(() => null));
const mark = async (name, extra = {}) => {
  const s = await state(page);
  const stall = (id) => { const x = s.stalls.find((q) => q.id === id); return x && { till: x.till, plan: x.plan, offers: x.offers.map((o) => ({ item: o.item, buy: o.buyPrice, sell: o.sellPrice })) }; };
  ev.push({ name, epoch: Date.now() / 1000, at: new Date().toISOString(), hour: s.hour, you: { cash: s.you.cash, carrying: s.you.carrying, inventory: s.you.inventory, netWorth: s.you.netWorth }, stalls: { ruth: stall('ruth'), tomas: stall('tomas'), anil: stall('anil') }, shocks: s.shocks, chain: await chain(), ...extra });
  console.log(name, 'cash', s.you.cash);
};
// the "All" button for one item: the panel lists the stall's offers in the order the game state gives them, one Sell/All/Buy row each
const rowAll = async (stallId, item) => { const st = (await state(page)).stalls.find((q) => q.id === stallId); const i = st.offers.findIndex((o) => o.item === item); return page.locator('aside').getByRole('button', { name: 'All' }).nth(i); };
const labelBox = async (text) => (await page.getByText(text, { exact: false }).first().boundingBox());
const clickStall = async (text) => { const b = await labelBox(text); await clickAt(page, b.x + b.width / 2, b.y + 120, 650); };

await signIn(page);
await page.waitForTimeout(1500);
await mark('town');

// ---- trade 1: iron from the scrap spot to Ruth's Salvage (the game's own "best in town")
await clickAt(page, 465, 700, 700); await page.waitForTimeout(700);
await mark('iron-spot');
await page.getByRole('button', { name: 'Collect iron' }).click();
await page.waitForTimeout(2200);
await mark('iron-collected');
await clickStall("Ruth's Salvage"); await page.waitForTimeout(1600);
await mark('ruth-open');
const allBtn = await rowAll('ruth', 'iron');
await glide(page, ...(await allBtn.boundingBox().then((b) => [b.x + b.width / 2, b.y + b.height / 2])), 700);
await page.waitForTimeout(500);
await mark('ruth-before-sale');
await allBtn.click();
await page.waitForTimeout(1800);
await mark('ruth-after-sale');
await page.waitForTimeout(3500);

// ---- trade 2: tomatoes to Tomas Produce, with a haggle
await page.locator('aside').getByRole('button', { name: /Close/ }).click().catch(() => page.keyboard.press('Escape'));
await page.waitForTimeout(800);
const tom = await labelBox('tomatoes'); await clickAt(page, tom.x + 30, tom.y + 80, 700); await page.waitForTimeout(700);
await page.getByRole('button', { name: /Collect tomatoes/ }).click();
await page.waitForTimeout(2200);
await mark('tomatoes-collected');
await clickStall('Tomas Produce'); await page.waitForTimeout(1600);
await mark('tomas-open');
const hag = page.locator('aside').getByLabel(/Haggle/);
if (await hag.count()) { const hb = await hag.first().boundingBox(); await clickAt(page, hb.x + 8, hb.y + 8, 600); }
await page.waitForTimeout(400);
const all2 = await rowAll('tomas', 'tomatoes');
await glide(page, ...(await all2.boundingBox().then((b) => [b.x + b.width / 2, b.y + b.height / 2])), 700);
await mark('tomas-before-sale');
await all2.click();
await page.waitForTimeout(2200);
await mark('tomas-after-sale');
await page.waitForTimeout(2500);
await mark('end');

writeFileSync(OUT + 'take1.events.raw.json', JSON.stringify(ev, null, 2)); // saved before encoding, so a failed encode cannot lose it
const info = await rec.finish(OUT + 'take1.mp4');
for (const e of ev) e.t = +(e.epoch - info.startEpoch).toFixed(2); // seconds into the video
writeFileSync(OUT + 'take1.events.json', JSON.stringify({ video: 'take1.mp4', ...info, events: ev }, null, 2));
await ctx.close(); await browser.close();
console.log('saved take1.mp4', JSON.stringify(info));
