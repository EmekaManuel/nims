import { launch, signIn, clickAt } from './lib.mjs';
const OUT = process.argv[2];
const { browser, page } = await launch();
await signIn(page);
const tab = async (re) => { const b = await page.getByRole('button', { name: re }).first().boundingBox(); await clickAt(page, b.x + b.width / 2, b.y + b.height / 2, 500); await page.waitForTimeout(1200); };
const btns = async () => (await page.locator('aside button').evaluateAll((bs) => bs.map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 28) + (b.disabled ? '[x]' : '')))).filter(Boolean).join(' | ');
await tab(/^Quests/); await page.screenshot({ path: OUT + '/f-quests.png' }); console.log('QUESTS:', await btns());
await tab(/^Deals/); await page.screenshot({ path: OUT + '/f-deals.png' }); console.log('DEALS:', await btns());
const jobs = page.getByRole('tab', { name: /Odd jobs/i }).or(page.getByRole('button', { name: /Odd jobs/i })); if (await jobs.count()) { await jobs.first().click(); await page.waitForTimeout(900); await page.screenshot({ path: OUT + '/f-jobs.png' }); console.log('JOBS:', (await page.locator('aside').innerText()).replace(/\n+/g, ' | ').slice(0, 260)); }
await tab(/^My business/); await page.screenshot({ path: OUT + '/f-business.png' }); console.log('BUSINESS:', (await page.locator('aside').innerText()).replace(/\n+/g, ' | ').slice(0, 300));
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
const tr = page.getByRole('button', { name: /^Travel/ }); if (await tr.count()) { const b = await tr.first().boundingBox(); await clickAt(page, b.x + b.width / 2, b.y + b.height / 2, 500); await page.waitForTimeout(1200); await page.screenshot({ path: OUT + '/f-travel.png' }); console.log('TRAVEL:', (await page.locator('aside').innerText()).replace(/\n+/g, ' | ').slice(0, 360)); }
await browser.close();
