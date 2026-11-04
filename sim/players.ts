/** Simple simulated-player strategies (DESIGN.md §5). They only use engine trade helpers. */
import { BASE_PRICE, CAPACITY, Item, MARKETS, MarketId, Player, World } from './world';
import {
  buyShares,
  buyFromMerchant,
  carryCost,
  contributeToAjo,
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
  p.cash -= n * src.cost;
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

function upgradeVehicle(p: Player) {
  if (p.vehicle === 'wheelbarrow' && p.cash > 8_000) (p.vehicle = 'keke'), (p.cash -= 5_000);
  else if (p.vehicle === 'keke' && p.cash > 25_000) (p.vehicle = 'van'), (p.cash -= 18_000);
}

const GATHERABLE: Item[] = ['tomatoes', 'pepper', 'iron', 'copper wire'];

const gatherer: Strategy = (w, p) => {
  // Each gatherer works a different source (by the id's hash) and takes a fair price.
  const item = GATHERABLE[[...p.id].reduce((a, c) => a + c.charCodeAt(0), 0) % GATHERABLE.length];
  gather(w, p, item);
  sellBest(w, p, item, 0.5);
  upgradeVehicle(p);
};

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
  upgradeVehicle(p);
};

/** Revives closed shops through ajo, and otherwise holds a stake in each market so dividends keep arriving. */
const investor: Strategy = (w, p) => {
  for (const m of w.merchants) if (m.state === 'closed') contributeToAjo(w, p, m, 4_000);
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
  upgradeVehicle(p);
};

export const act: Strategy = (w, p) => {
  if (p.strategy === 'human') return; // humans act through the game API
  ({ gatherer, arbitrageur, investor, flooder })[p.strategy](w, p);
};

export { MARKETS, merchantItems };
