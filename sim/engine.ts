/**
 * Headless economy engine. Every price comes from merchants/pricing.ts —
 * there is deliberately no price logic in this file.
 */
import { merchantState, PERSONALITY_PARAMS, quote, Quote } from '../merchants/pricing';
import { BASE_PRICE, Item, MARKETS, Merchant, PERISHABLE, Player, ShockKind, World } from './world';

/** Demand memory length in in-game hours. */
export const WINDOW = 24;
const RENT_PER_HOUR = 40;

export const activeShock = (w: World, kind: ShockKind) =>
  w.shocks.find((s) => s.kind === kind && w.hour >= s.startHour && w.hour < s.endHour);

/** Units bought/sold in the last WINDOW hours for one item. */
function recent(m: Merchant, item: Item, hour: number) {
  let bought = 0;
  let sold = 0;
  for (const e of m.memory) {
    if (e.item !== item || hour - e.hour >= WINDOW) continue;
    if (e.kind === 'bought') bought += e.units;
    else sold += e.units;
  }
  return { bought, sold };
}

/** The merchant's current quote for an item. This is the single call site of pricing.quote. */
export function quoteFor(w: World, m: Merchant, item: Item, player?: Player): Quote {
  const r = recent(m, item, w.hour);
  const festive = activeShock(w, 'festive season') && m.market === 'fabric';
  return quote({
    itemName: item,
    basePrice: BASE_PRICE[item],
    stock: m.stock[item] ?? 0,
    targetStock: m.target[item] ?? 0,
    cash: m.cash,
    cashFloor: m.cashFloor,
    recentBuys: r.bought,
    recentSells: r.sold,
    window: WINDOW,
    params: PERSONALITY_PARAMS[m.personality],
    reputation: player?.reputation[m.id] ?? 0,
    shockMult: festive ? 1.5 : 1,
    shockNote: festive ? 'Festive season: everyone wants fabric right now.' : undefined,
  });
}

export const merchantItems = (m: Merchant): Item[] => Object.keys(m.target) as Item[];
const totalStock = (m: Merchant) => Object.values(m.stock).reduce((a, b) => a + (b ?? 0), 0);

/** Sell `units` of `item` to a merchant, one unit at a time so each unit moves the price. Returns units sold. */
export function sellToMerchant(w: World, p: Player, m: Merchant, item: Item, units: number, minPrice = 0): number {
  let done = 0;
  while (done < units && (p.inventory[item] ?? 0) > 0 && m.state !== 'closed') {
    const q = quoteFor(w, m, item, p);
    if (!q.willBuy || q.buyPrice < minPrice) break;
    m.cash -= q.buyPrice;
    m.stock[item] = (m.stock[item] ?? 0) + 1;
    p.cash += q.buyPrice;
    p.inventory[item] = (p.inventory[item] ?? 0) - 1;
    m.memory.push({ hour: w.hour, item, kind: 'sold', units: 1 });
    done++;
  }
  if (done) p.reputation[m.id] = Math.min(1, (p.reputation[m.id] ?? 0) + done * 0.002);
  refreshState(w, m);
  return done;
}

/** Buy up to `units` of `item` from a merchant. Returns units bought. */
export function buyFromMerchant(w: World, p: Player, m: Merchant, item: Item, units: number, maxPrice = Infinity): number {
  let done = 0;
  while (done < units && (m.stock[item] ?? 0) > 0 && m.state !== 'closed') {
    const q = quoteFor(w, m, item, p);
    if (!q.willSell || q.sellPrice > maxPrice || p.cash < q.sellPrice) break;
    m.cash += q.sellPrice;
    m.stock[item] = (m.stock[item] ?? 0) - 1;
    p.cash -= q.sellPrice;
    p.inventory[item] = (p.inventory[item] ?? 0) + 1;
    m.memory.push({ hour: w.hour, item, kind: 'bought', units: 1 });
    done++;
  }
  if (done) p.reputation[m.id] = Math.min(1, (p.reputation[m.id] ?? 0) + done * 0.002);
  refreshState(w, m);
  return done;
}

/** Recompute open/struggling/closed and log changes. */
export function refreshState(w: World, m: Merchant) {
  const next = merchantState(m.cash, m.cashFloor, totalStock(m));
  if (next !== m.state) {
    m.state = next;
    const text =
      next === 'closed'
        ? `${m.name} has run out of cash and stock and closed.`
        : next === 'struggling'
          ? `${m.name} is low on cash and stopped buying.`
          : `${m.name} is trading normally again.`;
    w.events.push({ hour: w.hour, type: 'state', text });
  }
}

/** Put cash into a closed shop's ajo pool. When it fills, the shop reopens with contributors on the sign. */
export function contributeToAjo(w: World, p: Player, m: Merchant, amount: number): boolean {
  if (m.state !== 'closed') return false;
  const give = Math.min(amount, p.cash, m.ajo.goal - m.ajo.pool);
  if (give <= 0) return false;
  p.cash -= give;
  m.ajo.pool += give;
  m.ajo.contributors[p.id] = (m.ajo.contributors[p.id] ?? 0) + give;
  if (m.ajo.pool >= m.ajo.goal) {
    m.cash = m.ajo.pool;
    for (const item of merchantItems(m)) m.stock[item] = Math.floor((m.target[item] ?? 0) / 2);
    m.ajo.pool = 0;
    const names = Object.keys(m.ajo.contributors).join(', ');
    m.ajo.contributors = {};
    m.memory = [];
    m.state = 'open';
    w.events.push({ hour: w.hour, type: 'revived', text: `${m.name} reopened thanks to an ajo pool (${names}).` });
    refreshState(w, m);
  }
  return true;
}

/** ~1 shock per in-game day (DESIGN.md §1). */
function rollShocks(w: World) {
  if (w.rng.next() > 1 / 24) return;
  const kind = w.rng.pick<ShockKind>(['rain', 'fuel queue', 'festive season']);
  const length = kind === 'festive season' ? 24 : kind === 'rain' ? 6 : 12;
  w.shocks.push({ kind, startHour: w.hour, endHour: w.hour + length });
  w.events.push({ hour: w.hour, type: 'shock', text: `Shock: ${kind} for ${length}h.` });
}

/** ₦ per unit to move goods between markets. Fuel queues double it. */
export const carryCost = (w: World) => (activeShock(w, 'fuel queue') ? 40 : 20);

/** Gathering capacity multiplier (rain slows it). */
export const gatherRate = (w: World) => (activeShock(w, 'rain') ? 0.5 : 1);

/** The town trades on its own: everyday customers buy, merchants restock from farms and wholesalers. */
function ambientTrade(w: World) {
  const rain = activeShock(w, 'rain');
  for (const m of w.merchants) {
    // Perishables spoil faster in rain.
    for (const item of PERISHABLE) {
      const s = m.stock[item];
      if (s) m.stock[item] = Math.max(0, s - Math.ceil(s * (rain ? 0.05 : 0.01)));
    }
    if (m.state === 'closed') continue;
    m.cash = Math.max(0, m.cash - RENT_PER_HOUR);
    for (const item of merchantItems(m)) {
      // Everyday customers: buy a couple of units if the price is fair.
      const q = quoteFor(w, m, item);
      const want = w.rng.int(0, 2);
      if (q.willSell && q.sellPrice <= BASE_PRICE[item] * 1.6) {
        const n = Math.min(want, m.stock[item] ?? 0);
        m.stock[item] = (m.stock[item] ?? 0) - n;
        m.cash += n * q.sellPrice;
      }
      // Restock from farms/wholesalers at a discount to base when running low.
      if ((m.stock[item] ?? 0) < (m.target[item] ?? 0) * 0.6) {
        const unit = Math.round(BASE_PRICE[item] * 0.85);
        const n = Math.min(3, Math.floor(m.cash / unit));
        m.stock[item] = (m.stock[item] ?? 0) + n;
        m.cash -= n * unit;
      }
    }
    refreshState(w, m);
  }
}

function respawnSources(w: World) {
  for (const s of w.sources) s.units = Math.min(s.max, s.units + s.respawnPerHour);
}

/** Average mid price per item per market, plus merchant cash. */
function snapshot(w: World) {
  const prices: Record<string, number> = {};
  for (const [mid, market] of Object.entries(MARKETS)) {
    for (const item of market.items) {
      const qs = w.merchants
        .filter((m) => m.market === mid && m.state !== 'closed' && m.target[item] !== undefined)
        .map((m) => quoteFor(w, m, item).mid);
      if (qs.length) prices[`${mid}:${item}`] = Math.round(qs.reduce((a, b) => a + b, 0) / qs.length);
    }
  }
  const cash: Record<string, number> = {};
  for (const m of w.merchants) cash[m.id] = Math.round(m.cash);
  w.history.push({ hour: w.hour, prices, cash });
}

export type Strategy = (w: World, p: Player) => void;

/** Advance the world one in-game hour. */
export function tick(w: World, act: Strategy) {
  rollShocks(w);
  respawnSources(w);
  for (const p of w.players) act(w, p);
  ambientTrade(w);
  snapshot(w);
  w.hour++;
}
