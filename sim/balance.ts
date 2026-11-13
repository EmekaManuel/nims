/**
 * Balance check: how fast does a SENSIBLE player get rich? A bot that acts a few times per in-game hour (one hour is
 * 10 real seconds at the default TICK_MS, so 3 actions an hour is one every 3 seconds or so), buys the source whose goods sell best after the fare, sells in lots to the best stall,
 * holds rather than sell at a loss, and upgrades its vehicle. Prints net worth over time and when each
 * rank and the fortune goal are reached, in real minutes.
 *
 *   npm run balance
 */
import { Game } from '../server/game/game';
import { BASE_PRICE, Item, realmOf } from './world';

function play(seed: number, rate: number, hours: number, actionsPerHour: number) {
  const g = new Game(seed);
  const me = 'bot@example.com';
  g.state(me);
  g.chooseGoal(me, 'fortune');
  // BALANCE_WIDER=1: every merchant plans the widest margin the model can ask for, the worst case for a player (see sim/plan.ts)
  if (process.env.BALANCE_WIDER) for (const m of g.w.merchants) if (!m.owner) m.plan = { day: 1e9, stock: {}, margin: 'wider', reason: 'worst case' };
  for (const s of g.w.sources) if (s.item !== 'cotton') s.cost = Math.round(BASE_PRICE[s.item as Item] * rate);
  const costOf: Record<string, number> = {};
  const worth: number[] = [];
  const hit: Record<number, number> = {};
  let waited = 0;
  const unreachable = new Set<string>();
  const noSale = new Set<string>(); // stalls in another place that refused a sale
 // sources in another place (the harbour, the frontiers): the bot plays the home town only
  for (let h = 0; h < hours; h++) {
    for (let a = 0; a < actionsPerHour; a++) {
      const s = g.state(me);
      const home = s.stalls.filter((st) => realmOf(st.market) === 'town'); // the bot plays the home town: the harbour and the frontiers take a journey
      // the fare for the whole load, spread over the units, for a stall in another market
      const net = (st: (typeof s.stalls)[number], price: number) => price - (st.market !== s.you.at ? s.fares[st.market] / Math.max(1, s.you.carrying) : 0);
      const carry = s.you.inventory[0];
      if (carry) {
        // sell in lots of 8 to the stall with the best price AFTER the fare; hold if that would lose money, unless we've waited long
        const best = home.filter((st) => !noSale.has(st.id)).flatMap((st) => st.offers.filter((o) => o.item === carry.item && o.willBuy).map((o) => ({ st, o, n: net(st, o.buyPrice) }))).sort((x, y) => y.n - x.n)[0];
        const basis = costOf[carry.item] ?? 0;
        if (best && (best.n >= basis * 1.0 || waited > 8)) { if (g.sell(me, best.st.id, carry.item as Item, Math.min(8, carry.units)).ok) waited = 0; else noSale.add(best.st.id); }
        else waited++;
      } else {
        // pick the source whose goods sell best after the fare, relative to what they cost
        const picks = s.sources.filter((src) => src.units >= 5 && src.item !== 'cotton' && !unreachable.has(src.item)).map((src) => {
          const best = home.flatMap((st) => st.offers.filter((o) => o.item === src.item && o.willBuy).map((o) => net(st, o.buyPrice))).sort((x, y) => y - x)[0] ?? 0;
          return { src, ratio: (best - src.cost) / Math.max(1, src.cost) };
        }).sort((x, y) => y.ratio - x.ratio);
        const top = picks[0];
        if (top && top.ratio >= 0.1) {
          const afford = Math.min(s.you.capacity, Math.floor(s.you.cash / top.src.cost));
          if (afford >= 3) { costOf[top.src.item] = top.src.cost; if (!g.gather(me, top.src.item as Item).ok) unreachable.add(top.src.item); }
        }
      }
      const u = g.state(me);
      if (u.you.vehicle === "wheelbarrow" && u.you.cash >= 5_500) g.upgrade(me, 'pickup');
      else if (u.you.vehicle === 'pickup' && u.you.cash >= 19_000) g.upgrade(me, 'van');
    }
    g.tickOnce();
    const nw = g.state(me).you.netWorth;
    worth.push(nw);
    for (const t of [3_000, 7_000, 10_000, 15_000]) if (nw >= t && hit[t] === undefined) hit[t] = h;
  }
  return { worth, hit };
}
const mins = (h?: number) => (h === undefined ? 'never' : `${((h * 10) / 60).toFixed(1)}m`);
for (const actions of [3, 4]) {
  console.log(`\n=== ${actions} actions per game hour; times are real minutes at 10 s a game hour ===`);
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = play(seed, 0.5, 240, actions);
    console.log(`seed ${seed}: peak ${Math.max(...r.worth).toLocaleString()}, after 40 min ${r.worth[239].toLocaleString()} | rank 2 ${mins(r.hit[3000])}  rank 3 ${mins(r.hit[7000])}  GOAL 10k ${mins(r.hit[10000])}  rank 4 ${mins(r.hit[15000])}`);
  }
}
