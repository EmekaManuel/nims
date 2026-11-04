/** Simple simulated-player strategies (DESIGN.md §5). They only use engine trade helpers. */
import { BASE_PRICE, CAPACITY, Item, MARKETS, MarketId, Player, World } from './world';
import {
  buyShares,
  transferCoins,
  buyFromMerchant,
  carryCost,
  contributeToFund,
  gatherRate,
  merchantItems,
  quoteFor,
  sellToMerchant,
  Strategy,
} from './engine';

const carried = (p: Player) => Object.values(p.inventory).reduce((a, b) => a + (b ?? 0), 0);

export function newPlayer(id: string, strategy: Player['strategy'], cash = 3_000): Player {
  return { id, strategy, cash, vehicle: 'wheelbarrow', inventory: {}, reputation: {}, notes: [] };
}

/** Collect a load from a source. Respects capacity, rain, source stock and the player's cash. */
export function gather(w: World, p: Player, item: Item): number {
  const src = w.sources.find((s) => s.item === item);
  if (!src) return 0;
  const room = CAPACITY[p.vehicle] - carried(p);
  const affordable = src.cost > 0 ? Math.floor(p.cash / src.cost) : Infinity;
  const n = Math.max(0, Math.floor(Math.min(room * gatherRate(w), src.units, affordable)));
  src.units -= n;
  transferCoins(w, p, 'town', n * src.cost);
  p.inventory[item] = (p.inventory[item] ?? 0) + n;
  if (n) w.ledger.push({ hour: w.hour, kind: 'mint', to: p.id, item, units: n });
  return n;
}

/** Sell everything we carry of `item` to whichever merchant pays most right now. */
function sellBest(w: World, p: Player, item: Item, floorFraction: number) {
  while ((p.inventory[item] ?? 0) > 0) {
    const buyers = w.merchants
      .filter((m) => m.target[item] !== undefined && m.state !== 'closed')
      .map((m) => ({ m, q: quoteFor(w, m, item, p) }))
      .filter((x) => x.q.willBuy && x.q.buyPrice >= BASE_PRICE[item] * floorFraction)
      .sort((a, b) => b.q.buyPrice - a.q.buyPrice);
    if (!buyers.length) return;
    // Sell a lot of 5 at a time so we re-pick the best buyer as prices move.
    const n = sellToMerchant(w, p, buyers[0].m, item, 5, BASE_PRICE[item] * floorFraction);
    if (n === 0) return;
  }
}

function upgradeVehicle(w: World, p: Player) {
  if (p.vehicle === 'wheelbarrow' && p.cash > 8_000) (p.vehicle = 'pickup'), transferCoins(w, p, 'town', 5_000);
  else if (p.vehicle === 'pickup' && p.cash > 25_000) (p.vehicle = 'van'), transferCoins(w, p, 'town', 18_000);
}

const GATHERABLE: Item[] = ['tomatoes', 'pepper', 'iron', 'copper wire'];

/**
 * A sensible trader, not a firehose. Each gatherer works one source, on its own beat (every third hour),
 * and only when the trip clearly pays: the best price in town must beat the wholesale cost by 40%. It sells
 * only above what the goods cost, holding on to them (for up to half a day) rather than dumping at a loss.
 * That makes supply follow profit, so a glut corrects itself instead of flattening every price.
 */
const gatherer: Strategy = (w, p) => {
  // Spread gatherers evenly over the goods by their number (gatherer-1, -2, -3 ...), so no good gets flooded by accident.
  const hash = Number(/(\d+)$/.exec(p.id)?.[1] ?? [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0));
  const item = GATHERABLE[hash % GATHERABLE.length];
  const src = w.sources.find((x) => x.item === item);
  if (!src) return;
  if (w.hour % 3 !== hash % 3) {
    // Not this trader's hour to travel, but still sell what they are holding if the price is right.
    holdOrSell(w, p, item, src.cost);
    return;
  }
  const best = Math.max(0, ...w.merchants.filter((m) => m.target[item] !== undefined && m.state !== 'closed').map((m) => {
    const q = quoteFor(w, m, item, p);
    return q.willBuy ? q.buyPrice : 0;
  }));
  if (carriedUnits(p) === 0 && best >= src.cost * 1.4) {
    gather(w, p, item);
    p.lastGatherHour = w.hour;
  }
  holdOrSell(w, p, item, src.cost);
  upgradeVehicle(w, p);
};

const carriedUnits = (p: Player) => Object.values(p.inventory).reduce((a, b) => a + (b ?? 0), 0);

/** Sell above cost, or after holding for 12 hours accept anything above the usual 50% floor. */
function holdOrSell(w: World, p: Player, item: Item, cost: number) {
  if ((p.inventory[item] ?? 0) <= 0) return;
  const waited = w.hour - (p.lastGatherHour ?? w.hour);
  const floor = waited > 12 ? BASE_PRICE[item] * 0.5 : Math.max(cost * 1.1, BASE_PRICE[item] * 0.5);
  sellBest(w, p, item, floor / BASE_PRICE[item]);
}

const arbitrageur: Strategy = (w, p) => {
  for (const item of Object.keys(p.inventory) as Item[]) sellBest(w, p, item, 0.5);
  let best: { item: Item; from: number; to: number; profit: number } | null = null;
  const sellers = (item: Item) => w.merchants.filter((m) => m.target[item] !== undefined && m.state !== 'closed');
  for (const item of Object.keys(BASE_PRICE) as Item[]) {
    const qs = sellers(item).map((m) => ({ m, q: quoteFor(w, m, item, p) }));
    const cheap = qs.filter((x) => x.q.willSell).sort((a, b) => a.q.sellPrice - b.q.sellPrice)[0];
    const dear = qs.filter((x) => x.q.willBuy).sort((a, b) => b.q.buyPrice - a.q.buyPrice)[0];
    if (!cheap || !dear || cheap.m === dear.m) continue;
    const cost = cheap.m.market === dear.m.market ? 5 : carryCost(w);
    const profit = dear.q.buyPrice - cheap.q.sellPrice - cost;
    if (profit > 0 && (!best || profit > best.profit)) best = { item, from: cheap.q.sellPrice, to: dear.q.buyPrice, profit };
  }
  if (best) {
    const sellerM = sellers(best.item).sort((a, b) => quoteFor(w, a, best!.item).sellPrice - quoteFor(w, b, best!.item).sellPrice)[0];
    buyFromMerchant(w, p, sellerM, best.item, CAPACITY[p.vehicle] - carried(p), best.to - 5);
  }
  upgradeVehicle(w, p);
};

/** Revives closed shops through fund, and otherwise holds a stake in each market so dividends keep arriving. */
const investor: Strategy = (w, p) => {
  for (const m of w.merchants) if (m.state === 'closed') contributeToFund(w, p, m, 4_000);
  const staked = new Set(w.merchants.filter((m) => !m.owner && (m.shares[p.id] ?? 0) > 0).map((m) => m.market));
  for (const market of Object.keys(MARKETS) as MarketId[]) {
    if (staked.has(market) || p.cash < 12_000) continue;
    const pick = w.merchants.find((m) => !m.owner && m.market === market && m.state === 'open');
    if (pick) buyShares(w, p, pick, 10);
  }
};

/** Dump iron as fast as possible, ignoring price. */
const flooder: Strategy = (w, p) => {
  gather(w, p, 'iron');
  sellBest(w, p, 'iron', 0);
  upgradeVehicle(w, p);
};

export const act: Strategy = (w, p) => {
  if (p.strategy === 'human') return; // humans act through the game API
  ({ gatherer, arbitrageur, investor, flooder })[p.strategy](w, p);
};

export { MARKETS, merchantItems };
