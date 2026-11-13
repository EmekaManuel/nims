// Take 3: the features montage. Real UI of the live game as the saved guest; nothing is bought, sold or changed.
import { launch, signIn, clickAt, glide, startRecording } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const OUT = new URL('../public/clips/', import.meta.url).pathname;
const { browser, ctx, page } = await launch();
const rec = await startRecording(page, '/private/tmp/claude-501/-Users-emekamanuel-Documents-sim/b6890cae-3cb2-48f5-afc5-5ca08ed83428/scratchpad/frames-take3');
const marks = {}; const mark = (k) => { marks[k] = Date.now() / 1000; };
const closeDrawer = async () => { const x = page.locator('aside').getByRole('button', { name: /Close|✕/ }).first(); if (await x.count()) { const b = await x.boundingBox(); await clickAt(page, b.x + b.width / 2, b.y + b.height / 2, 450); await page.waitForTimeout(500); } };
const tab = async (re) => { const b = await page.getByRole('button', { name: re }).first().boundingBox(); await clickAt(page, b.x + b.width / 2, b.y + b.height / 2, 600); };
await signIn(page); await page.waitForTimeout(2500);
mark('map');
await tab(/^Quests/); await page.locator('aside').waitFor({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3000); mark('quests'); await closeDrawer();
await tab(/^Deals/); await page.waitForTimeout(3000); mark('deals'); await closeDrawer();
// a stall: shares ("Own a piece") and delivery orders, scrolled into view
const lab = await page.getByText('Tomas Produce', { exact: false }).first().boundingBox();
await clickAt(page, lab.x + lab.width / 2, lab.y + 120, 700); await page.waitForTimeout(1800);
await page.locator('aside').evaluate((a) => { const s = [...a.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible'); if (s) s.scrollTo({ top: s.scrollHeight, behavior: 'smooth' }); });
await page.waitForTimeout(3200); mark('stall-shares'); await closeDrawer();
const trav = page.getByRole('button', { name: /^Travel/ }).first(); const tb = await trav.boundingBox(); await clickAt(page, tb.x + tb.width / 2, tb.y + tb.height / 2, 700);
await page.locator('aside').waitFor({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3200); mark('travel'); await closeDrawer();
await tab(/^My business/); await page.waitForTimeout(3000); mark('business'); await closeDrawer();
await page.waitForTimeout(1500); mark('end');
const info = await rec.finish(OUT + 'features.mp4');
for (const k of Object.keys(marks)) marks[k] = +(marks[k] - info.startEpoch).toFixed(2);
writeFileSync(OUT + 'features.meta.json', JSON.stringify({ ...info, marks }, null, 2));
console.log('features.mp4', info.seconds.toFixed(1) + 's', JSON.stringify(marks));
await ctx.close(); await browser.close();
