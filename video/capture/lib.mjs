import { chromium } from 'playwright-core';
export const SITE = 'https://nims-app.up.railway.app/';
import { existsSync } from 'node:fs';
export const STATE_FILE = new URL('./.session.json', import.meta.url).pathname; // one guest, reused by every capture run
export async function launch({ record, reuse = true } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, ...(reuse && existsSync(STATE_FILE) ? { storageState: STATE_FILE } : {}), ...(record ? { recordVideo: { dir: record, size: { width: 1920, height: 1080 } } } : {}) });
  const page = await ctx.newPage();
  return { browser, ctx, page };
}
export async function signIn(page) {
  await page.goto(SITE, { waitUntil: 'networkidle' });
  const guest = page.getByRole('button', { name: 'Play as a guest' });
  const hud = page.locator('header.hud');
  const which = await Promise.race([guest.waitFor({ timeout: 40000 }).then(() => 'login'), hud.waitFor({ timeout: 40000 }).then(() => 'game')]);
  if (which === 'game') { // already signed in with the saved guest
    await page.getByRole('button', { name: /Start trading/ }).click({ timeout: 1500 }).catch(() => {}); // the how-to card, if it shows
    await page.waitForTimeout(2500);
    return;
  }
  await page.getByRole('button', { name: 'Play as a guest' }).click();
  await page.getByRole('button', { name: 'Start trading' }).click({ timeout: 20000 }); // the how-to card
  const name = page.getByPlaceholder('e.g. Ngozi');
  if (await name.waitFor({ timeout: 5000 }).then(() => true, () => false)) { // the trader creator
    await name.fill('Demo');
    await page.getByRole('button', { name: 'Start trading' }).click();
  }
  const goal = page.getByRole('button', { name: /Build a fortune/ });
  if (await goal.waitFor({ timeout: 6000 }).then(() => true, () => false)) await goal.click();
  await page.waitForTimeout(2500);
}
export const state = (page) => page.evaluate(() => fetch('/game/state', { credentials: 'include' }).then((r) => r.json()));
// a natural mouse move: eased path in small steps
export async function glide(page, x, y, ms = 700) {
  const cur = page.__mouse ?? { x: 960, y: 540 };
  const steps = Math.max(12, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(cur.x + (x - cur.x) * e, cur.y + (y - cur.y) * e);
    await page.waitForTimeout(ms / steps);
  }
  page.__mouse = { x, y };
}
export async function clickAt(page, x, y, ms = 700) { await glide(page, x, y, ms); await page.waitForTimeout(120); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up(); }

// ---- recording: Chrome's own screencast (high-quality JPEG frames with wall-clock timestamps), encoded with the system ffmpeg.
import { writeFileSync as _w, mkdirSync as _m, rmSync as _rm } from 'node:fs';
import { execFileSync } from 'node:child_process';
function jpegSize(buf) { // [width, height] from the JPEG header
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) break;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m === 0xc0 || m === 0xc2) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return [0, 0];
}
export async function startRecording(page, framesDir) {
  _rm(framesDir, { recursive: true, force: true }); _m(framesDir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = []; let n = 0;
  cdp.on('Page.screencastFrame', (f) => {
    const buf = Buffer.from(f.data, 'base64');
    const [w, h] = jpegSize(buf);
    if (w === 1920 && h === 1080) { // a frame taken while the window was still sizing is skipped
      const file = `${framesDir}/${String(n++).padStart(6, '0')}.jpg`;
      _w(file, buf);
      frames.push({ file, ts: f.metadata.timestamp });
    }
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  return {
    /** Stop, and encode to an mp4 at 30 fps. Returns the wall-clock second of the first frame (to line events up with the video). */
    async finish(outMp4) {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await new Promise((r) => setTimeout(r, 400));
      const list = frames.map((f, i) => `file '${f.file}'\nduration ${(i + 1 < frames.length ? Math.max(0.001, frames[i + 1].ts - f.ts) : 0.1).toFixed(4)}`).join('\n');
      _w(`${framesDir}/list.txt`, list + `\nfile '${frames[frames.length - 1].file}'\n`);
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${framesDir}/list.txt`, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', outMp4]);
      const span = frames[frames.length - 1].ts - frames[0].ts;
      return { startEpoch: frames[0].ts, seconds: span, frames: frames.length, avgFps: frames.length / span };
    },
  };
}
