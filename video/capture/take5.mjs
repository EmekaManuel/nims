// Take 5 (resumes take 4 after a network blip): Saltmere Harbour and the three frontiers, on the live game, as the saved guest (renamed "Nims Demo").
// Each trip is real and takes real time (a game hour is 10 s). Only the departure and the arrival are recorded; the road in between is waited out.
// The guest pays the real passage (120, 160, 260, 240, then 120 home) and becomes the first to reach each frontier in the public news.
import { launch, signIn, state, clickAt, glide, startRecording } from './lib.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
const OUT = new URL('../public/clips/', import.meta.url).pathname;
const FR = '/private/tmp/claude-501/-Users-emekamanuel-Documents-sim/b6890cae-3cb2-48f5-afc5-5ca08ed83428/scratchpad/frames-take4-';
mkdirSync(OUT, { recursive: true });
const { browser, ctx, page } = await launch();
await signIn(page);
const post = (path, body) => page.evaluate(([p, b]) => fetch(p, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), [path, body]);
console.log('rename:', (await post('/game/name', { name: 'Nims Demo' })).message);
await page.waitForTimeout(1500);

const sleep = (ms) => page.waitForTimeout(ms);
const st = async () => { for (let i = 0; i < 8; i++) { try { return await state(page); } catch { await sleep(2000); } } throw new Error('the game state could not be read'); };
import { readFileSync, existsSync } from 'node:fs';
const prior = existsSync(OUT + 'take4.trips.json') ? JSON.parse(readFileSync(OUT + 'take4.trips.json')).trips : [];
const trips = [...prior];
const open = async () => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const b = await page.getByRole('button', { name: /^Travel/ }).first().boundingBox();
    await clickAt(page, b.x + b.width / 2, b.y + b.height / 2, 650);
    if (await page.locator('aside').waitFor({ timeout: 4000 }).then(() => true, () => false)) { await sleep(1500); return; }
  }
  throw new Error('the Travel panel did not open');
};
async function record(name, fn) { const rec = await startRecording(page, FR + name); await fn(); const info = await rec.finish(OUT + name + '.mp4'); rmSync(FR + name, { recursive: true, force: true }); return { clip: name + '.mp4', seconds: +info.seconds.toFixed(1), startEpoch: info.startEpoch }; }

async function trip(realm, label) {
  const s0 = await st();
  const road = s0.realm.roads.find((r) => r.realm === realm);
  const before = s0.you.cash;
  const t = { realm, label, hours: road.hours, passage: road.passage, travel: road.travel, from: s0.realm.here, cashBefore: before, wasDiscovered: road.discovered };
  // departure: open the Travel panel and set off
  t.go = await record(`trip-${realm}-go`, async () => {
    await open();
    const block = page.locator('aside').getByText(road.name, { exact: true }).first().locator('xpath=ancestor::*[.//button][1]');
    const btn = block.getByRole('button').first();
    const b = await btn.boundingBox(); await clickAt(page, b.x + b.width / 2, b.y + b.height / 2, 700);
    t.departedAt = new Date().toISOString();
    await sleep(4500);
  });
  let s = await st();
  t.journey = s.realm.journey; console.log(label, 'set off; journey:', JSON.stringify(s.realm.journey), 'cash', s.you.cash);
  t.cashAfter = s.you.cash;
  // wait out the road, then record the arrival
  const hoursLeft = async () => { const q = await st(); return { left: q.realm.journey ? q.realm.journey.hoursLeft : 0, q }; };
  while ((await hoursLeft()).left > 1.7) await sleep(1000);
  t.arrive = await record(`trip-${realm}-arrive`, async () => {
    while ((await hoursLeft()).q.realm.journey) await sleep(500);
    t.arrivedAt = new Date().toISOString();
    await sleep(3500);
    // a free plot, if one is on screen: the land panel
    const plot = page.getByText('Free plot', { exact: false }).first();
    if (await plot.count()) { const pb = await plot.boundingBox().catch(() => null); if (pb) { await clickAt(page, pb.x + pb.width / 2, pb.y + pb.height / 2, 700); await sleep(3000); } }
    await sleep(1500);
  });
  s = await st();
  t.here = s.realm.here; t.discovered = s.realm.roads.find((r) => r.realm === realm)?.discovered ?? null;
  t.news = (s.events ?? []).filter((e) => e.type === 'discovery').slice(-3).map((e) => e.text);
  trips.push(t);
  console.log(label, 'arrived; here', t.here, 'cash', s.you.cash, '| discovery news:', JSON.stringify(t.news));
  // the panel can stay open from the land click; close it for the next trip
  await page.keyboard.press('Escape').catch(() => {}); await sleep(600);
  const x = page.locator('aside').getByRole('button', { name: /Close|✕/ }).first(); if (await x.count()) await x.click().catch(() => {});
  await sleep(800);
}
async function finishRoad() { // the guest is already on a road: wait for it, and record the place it arrives at
  const s = await st(); const j = s.realm.journey; if (!j) return;
  const realm = j.to.split('-')[0] === j.to ? j.to : j.to; const road = s.realm.roads.find((r) => r.realm === realm) ?? { name: j.name };
  console.log('resuming: on the road to', j.name, 'hoursLeft', j.hoursLeft);
  const t = { realm, label: j.name, resumed: true, hours: j.hours, passage: s.realm.roads.find((r) => r.realm === realm)?.passage, note: 'the departure clip is from the first run; the arrival moment itself was missed, so this clip starts in the place' };
  t.arrive = await record(`trip-${realm}-arrive`, async () => {
    while ((await st()).realm.journey) await sleep(500);
    t.arrivedAt = new Date().toISOString(); await sleep(3500);
    const plot = page.getByText('Free plot', { exact: false }).first();
    if (await plot.count()) { const pb = await plot.boundingBox().catch(() => null); if (pb) { await clickAt(page, pb.x + pb.width / 2, pb.y + pb.height / 2, 700); await sleep(3000); } }
    await sleep(1500);
  });
  const q = await st(); t.here = q.realm.here; t.discovered = q.realm.roads.find((r) => r.realm === realm)?.discovered ?? null;
  t.news = (q.events ?? []).filter((e) => e.type === 'discovery').slice(-3).map((e) => e.text);
  const prev = trips.find((x) => x.realm === realm); if (prev) Object.assign(prev, t); else trips.push(t);
  console.log('arrived in', t.here, '| news', JSON.stringify(t.news));
  await page.keyboard.press('Escape').catch(() => {}); await sleep(600);
  const x = page.locator('aside').getByRole('button', { name: /Close|✕/ }).first(); if (await x.count()) await x.click().catch(() => {}); await sleep(800);
}
try {
  await finishRoad();
  for (const [realm, label] of [['gemhollow', 'Gem Hollow'], ['sunvale', 'Sunvale'], ['town', 'Nims (home)']]) { if (!trips.some((x) => x.realm === realm && x.arrive)) await trip(realm, label); }
} finally {
  writeFileSync(OUT + 'take4.trips.json', JSON.stringify({ guest: 'Nims Demo', trips }, null, 2));
  await ctx.close(); await browser.close();
}
console.log('done; trips', trips.length);
