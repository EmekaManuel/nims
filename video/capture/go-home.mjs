import { launch, signIn, state } from './lib.mjs';
const { browser, page } = await launch();
await signIn(page);
const r = await page.evaluate(() => fetch('/game/travel', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'town' }) }).then((r) => r.json()));
console.log(r.message ?? JSON.stringify(r).slice(0, 160));
const s = await state(page); console.log('journey', JSON.stringify(s.realm.journey), 'cash', s.you.cash);
await browser.close();
