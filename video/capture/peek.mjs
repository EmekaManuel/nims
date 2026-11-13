import { launch, signIn, state } from './lib.mjs';
const { browser, page } = await launch();
await signIn(page);
const s = await state(page);
console.log('here:', s.realm.here, '| journey:', JSON.stringify(s.realm.journey), '| cash', s.you.cash, '| name', s.you.name);
console.log('discovered:', s.realm.roads.map((r) => `${r.realm}:${r.discovered ? 'yes' : 'no'}`).join(' '));
await browser.close();
