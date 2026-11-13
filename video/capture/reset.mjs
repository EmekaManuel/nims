// Unrecorded setup: sell whatever the saved guest is carrying, so a take starts from an empty wheelbarrow.
import { launch, signIn, state, clickAt } from './lib.mjs';
const { browser, page } = await launch();
await signIn(page);
let s = await state(page);
console.log('before: carrying', s.you.carrying, JSON.stringify(s.you.inventory), 'cash', s.you.cash);
for (const inv of s.you.inventory) {
  const best = s.stalls.filter((x) => x.state !== 'closed' && ['produce', 'fabric', 'scrap'].includes(x.market)).map((x) => ({ x, o: x.offers.find((o) => o.item === inv.item && o.willBuy) })).filter((q) => q.o).sort((a, b) => b.o.buyPrice - a.o.buyPrice)[0];
  const r = await page.evaluate(([m, item, n]) => fetch('/game/sell', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ merchant: m, item, units: n, haggle: false }) }).then((r) => r.json()), [best.x.id, inv.item, inv.units]);
  console.log('sold', inv.item, 'to', best.x.id, '->', r.message ?? JSON.stringify(r).slice(0, 80));
}
s = await state(page);
console.log('after: carrying', s.you.carrying, 'cash', s.you.cash);
await browser.close();
