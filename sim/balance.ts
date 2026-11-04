/**
 * Balance check: how fast does a SENSIBLE player get rich? A bot that acts twice per in-game hour (one hour is
 * 4 real seconds), buys the source whose goods sell best after the fare, sells in lots to the best stall,
 * holds rather than sell at a loss, and upgrades its vehicle. Prints net worth over time and when each
 * rank and the fortune goal are reached, in real minutes.
 *
 *   npm run balance
 */
import { Game } from '../server/game';
import { BASE_PRICE, Item } from './world';

function play(seed: number, rate: number, hours: number, actionsPerHour: number) {
  const g = new Game(seed);
  const me = 'bot@example.com';
  g.state(me);
  g.chooseGoal(me, 'fortune');
  for (const s of g.w.sources) if (s.item !== 'cotton') s.cost = Math.round(BASE_PRICE[s.item as Item] * rate);
  const costOf: Record<string, number> = {};
  const worth: number[] = [];
  const hit: Record<number, number> = {};
  let waited = 0;
  for (let h = 0; h < hours; h++) {
    for (let a = 0; a < actionsPerHour; a++) {
      const s = g.state(me);
      const fare = s.faresPerUnit;
      const net = (st: (typeof s.stalls)[number], price: number) => price - (st.market !== s.you.at ? fare : 0);
      const carry = s.you.inventory[0];
      if (carry) {
        // sell in lots of 8 to the stall with the best price AFTER the fare; hold if that would lose money, unless we've waited long
        const best = s.stalls.flatMap((st) => st.offers.filter((o) => o.item === carry.item && o.willBuy).map((o) => ({ st, o, n: net(st, o.buyPrice) }))).sort((x, y) => y.n - x.n)[0];
        const basis = costOf[carry.item] ?? 0;
        if (best && (best.n >= basis * 1.0 || waited > 8)) { g.sell(me, best.st.id, carry.item as Item, Math.min(8, carry.units)); waited = 0; }
        else waited++;
      } else {
        // pick the source whose goods sell best after the fare, relative to what they cost
        const picks = s.sources.filter((src) => src.units >= 5 && src.item !== 'cotton').map((src) => {
          const best = s.stalls.flatMap((st) => st.offers.filter((o) => o.item === src.item && o.willBuy).map((o) => net(st, o.buyPrice))).sort((x, y) => y - x)[0] ?? 0;
          return { src, ratio: (best - src.cost) / Math.max(1, src.cost) };
        }).sort((x, y) => y.ratio - x.ratio);
        const top = picks[0];
        if (top && top.ratio >= 0.1) {
          const afford = Math.min(s.you.capacity, Math.floor(s.you.cash / top.src.cost));
          if (afford >= 3) { costOf[top.src.item] = top.src.cost; g.gather(me, top.src.item as Item); }
        }
      }
      const u = g.state(me);
      if (u.you.vehicle === "wheelbarrow" && u.you.cash >= 5_500) g.upgrade(me, 'pickup');
      else if (u.you.vehicle === 'pickup' && u.you.cash >= 19_000) g.upgrade(me, 'van');
    }
    g.tickOnce();
    const nw = g.state(me).you.netWorth;
    worth.push(nw);
    for (const t of [3_000, 7_000, 12_000, 35_000]) if (nw >= t && hit[t] === undefined) hit[t] = h;
  }
  return { worth, hit };
}
const mins = (h?: number) => (h === undefined ? 'never' : `${(h * 4 / 60).toFixed(1)}m`);
for (const rate of [0.5]) {
  console.log(`\n=== wholesale ${Math.round(rate * 100)}% of usual price ===`);
  for (const seed of [1, 2, 3, 4]) {
    const r = play(seed, rate, 450, 2);
    const at = (h: number) => r.worth[h].toLocaleString();
    console.log(`seed ${seed}: @15h ${at(15)}  @60h ${at(60)}  @150h ${at(150)}  @449h ${at(449)} | R2 ${mins(r.hit[3000])}  R3 ${mins(r.hit[7000])}  GOAL12k ${mins(r.hit[12000])}  TYCOON ${mins(r.hit[35000])}`);
  }
}
