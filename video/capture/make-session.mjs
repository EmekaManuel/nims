// Sign in ONCE as a guest on the live game and save the browser session, so every capture run is the same player.
import { launch, signIn, state, STATE_FILE } from './lib.mjs';
const { browser, ctx, page } = await launch({ reuse: false });
await signIn(page);
const s = await state(page);
await ctx.storageState({ path: STATE_FILE });
console.log('saved session for', s.you.name, '| cash', s.you.cash, '| invite', s.invite?.code);
await browser.close();
