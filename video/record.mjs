// Records clean 1920x1080 gameplay (no overlays) with a visible cursor, and writes beats.json:
// when each scene starts and ends, plus real numbers read from the page for the callouts.
// Usage: node record.mjs <outdir>   (a local server must be running on :3100, see README)
import { chromium } from '../node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2];
mkdirSync(OUT + '/video', { recursive: true });
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: exe });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: OUT + '/video', size: { width: 1920, height: 1080 } } });

// A visible cursor with a click ripple, drawn in the page so it is part of the footage.
await ctx.addInitScript(() => {
  const mk = () => {
    if (document.getElementById('demo-cursor')) return;
    const c = document.createElement('div'); c.id = 'demo-cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:none';
    c.innerHTML = '<svg width="34" height="40" viewBox="0 0 34 40" style="filter:drop-shadow(0 3px 5px rgba(0,0,0,.45))"><path d="M4 2 L4 31 L11 25 L16 37 L21 35 L16 23 L26 23 Z" fill="#fff" stroke="#0b1530" stroke-width="2.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const st = document.createElement('style');
    st.textContent = '@keyframes demo-rip{from{transform:translate(-50%,-50%) scale(.2);opacity:.9}to{transform:translate(-50%,-50%) scale(1.6);opacity:0}}';
    document.documentElement.appendChild(st);
    addEventListener('mousemove', (e) => { c.style.transform = `translate(${e.clientX - 5}px,${e.clientY - 3}px)`; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:70px;height:70px;border-radius:50%;border:4px solid #ffc83d;background:rgba(255,200,61,.25);z-index:2147483646;pointer-events:none;animation:demo-rip .55s ease-out forwards`;
      document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
  };
  mk(); document.addEventListener('DOMContentLoaded', mk);
});

const p = await ctx.newPage();
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const wait = (ms) => p.waitForTimeout(ms);
const beats = {};
const facts = {};
const begin = (k) => { beats[k] = { start: now() }; console.log('beat', k, now().toFixed(1)); };
const end = (k) => { beats[k].end = now(); };

let mx = 960, my = 540;
/** Glide the cursor to the middle of an element, then click it: so the viewer can follow what is being pressed. */
async function click(loc, { steps = 22, pause = 160 } = {}) {
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const box = await loc.boundingBox({ timeout: 5000 });
  if (!box) throw new Error('no box for ' + loc);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await p.mouse.move(x, y, { steps });
  mx = x; my = y;
  await wait(pause);
  await p.mouse.click(x, y);
}
const glide = async (x, y, steps = 24) => { await p.mouse.move(x, y, { steps }); mx = x; my = y; };

const num = (s) => Number(String(s ?? '').replace(/[^0-9]/g, ''));
const cash = async () => num(await p.locator('small.k', { hasText: 'Cash' }).locator('xpath=following-sibling::b').first().textContent());
const stall = (name) => p.locator('svg.map').getByText(name, { exact: false }).first();
const tab = (name) => p.locator('nav, .dock, footer').getByText(name, { exact: true }).first();
const closeDrawer = async () => { if (await p.locator('button.drawer-close').isVisible()) { await click(p.locator('button.drawer-close'), { steps: 10 }); await wait(500); } };
const openStall = async (name) => { await closeDrawer(); await click(stall(name)); await wait(700); };
const collect = async (item) => {
  const src = p.locator(`g.source[aria-label*="${item}"]`).first();
  const btn = p.getByRole('button', { name: new RegExp(`Collect ${item}`) });
  const shown = () => btn.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false);
  await closeDrawer();
  await click(src);
  if (!(await shown())) { await click(src); await shown(); }
  await click(btn);
  await wait(900);
};

// --- sync flash: a solid magenta frame at a known moment, so the footage offset is measured, not guessed.
await p.goto('http://localhost:3100/');
await wait(1200);
await p.evaluate(() => { const d = document.createElement('div'); d.id = 'sync'; d.style.cssText = 'position:fixed;inset:0;background:#ff00ff;z-index:2147483647'; document.documentElement.appendChild(d); });
facts.syncAt = now();
await wait(450);
await p.evaluate(() => document.getElementById('sync')?.remove());
await wait(900);

begin('signin');
await glide(1300, 500, 8);
await click(p.locator('input[type=email]'), { steps: 18 });
await p.keyboard.type(`demo${Date.now() % 100000}@nims.game`, { delay: 55 });
await wait(500);
await click(p.getByText('Send me a link'));
await wait(1100);
await click(p.getByText('Open my link'));
await wait(2200);
await click(p.getByRole('button', { name: 'Start trading' }));
await wait(1200);
end('signin');

begin('goal');
await wait(1200);
await click(p.getByRole('button', { name: 'Build a fortune' }));
await wait(1800);
end('goal');

begin('collect');
await collect('cotton');
await wait(1400);
end('collect');

begin('tooltip');
await openStall('Lena');
await wait(900);
{ const box = await p.locator('.price').first().boundingBox(); await glide(box.x + box.width / 2, box.y + box.height / 2, 30); }
await wait(1100);
facts.tooltip = (await p.locator('[role=tooltip]').first().textContent({ timeout: 4000 }).catch(() => '')) ?? '';
await wait(3600);
end('tooltip');

begin('sale');
await glide(1500, 900, 18); // let the tooltip close so it cannot swallow the click
await wait(500);
facts.cashBefore = await cash();
await click(p.locator('tr', { hasText: 'Cotton' }).getByRole('button', { name: 'All' }));
facts.mSale = now();
await wait(2600);
facts.cashAfterSale = await cash();
end('sale');

begin('order');
await collect('cotton');
await openStall('Lena');
await p.getByText('Send it here when the price is right').scrollIntoViewIfNeeded({ timeout: 4000 });
await wait(600);
await p.screenshot({ path: OUT + '/dbg-order.png' });
await p.selectOption('#order-item', { label: 'Cotton' }, { timeout: 5000 });
const pay = num(await p.locator('tr', { hasText: 'Cotton' }).locator('.price').first().textContent());
const carried = num((await p.locator('text=/^\\d+\\/\\d+$/').first().textContent()) ?? '0'.split('/')[0]);
const carriedN = Number(((await p.locator('text=/^\\d+\\/\\d+$/').first().textContent()) ?? '0').split('/')[0]);
facts.orderMin = Math.max(1, Math.floor(pay * 0.85));
facts.orderUnits = Math.max(1, carriedN);
await p.fill('#order-min', String(facts.orderMin));
await p.fill('#order-units', String(facts.orderUnits));
await wait(1200);
facts.cashBeforeOrder = await cash();
await click(p.getByRole('button', { name: 'Place order' }));
facts.mOrder = now();
await wait(2800);
end('order');

begin('filled');
const deadline = Date.now() + 30000;
while (Date.now() < deadline && (await cash()) <= facts.cashBeforeOrder + 50) await wait(500);
facts.mFill = now();
await wait(2200);
facts.cashAfterOrder = await cash();
end('filled');

begin('prices');
await closeDrawer();
await click(tab('Prices'));
await wait(3800);
end('prices');

begin('shares');
await openStall('Mira');
await wait(3600);
end('shares');

begin('sim');
await p.goto('http://localhost:3100/#sim');
await wait(1500);
await click(p.getByRole('button', { name: /Fast-forward a week/ }));
facts.mSim = now();
await wait(4500);
await p.evaluate(() => window.scrollTo({ top: 400, behavior: 'smooth' }));
await p.getByRole('button', { name: /Replay/ }).waitFor({ timeout: 40000 }).catch(() => {});
await wait(2500);
end('sim');

facts.total = now();
writeFileSync(OUT + '/beats.json', JSON.stringify({ beats, facts }, null, 1));
await ctx.close();
await b.close();
console.log('done', JSON.stringify(facts));
