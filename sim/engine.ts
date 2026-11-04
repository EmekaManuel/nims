/**
 * Headless economy engine. Every price comes from merchants/pricing.ts —
 * there is deliberately no price logic in this file.
 */
import { clampPlayerPrice, merchantState, PERSONALITY_PARAMS, playerQuote, quote, Quote } from '../merchants/pricing';
import { BASE_PRICE, CARRY_VALUE, COINS, Item, MARKETS, MAX_PUBLIC_SHARES, Merchant, MarketId, PERISHABLE, Player, SHARES_TOTAL, ShockKind, World } from './world';

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
  if (m.owner) {
    const pr = m.prices?.[item] ?? { buy: Math.round(BASE_PRICE[item] * 0.8), sell: Math.round(BASE_PRICE[item] * 1.2) };
    return playerQuote({ itemName: item, basePrice: BASE_PRICE[item], buyPrice: pr.buy, sellPrice: pr.sell, stock: m.stock[item] ?? 0, cash: m.cash, ownerName: m.ownerName ?? 'The owner' });
  }
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

/** Anyone who can hold coins: a merchant, a player, or the town (customers, wholesalers, landlords, carriers). */
export type Holder = Merchant | Player | 'town';
const idOf = (h: Holder) => (h === 'town' ? 'town' : h.id);

/**
 * THE way coins move. Updates both balances and records the movement in the ledger, so every coin that
 * changes hands can be settled on chain. Never change `.cash` anywhere else.
 * Coins from the town (a customer paying a stall) are created: a 'mint'. Coins to the town are a transfer.
 */
export function transferCoins(w: World, from: Holder, to: Holder, amount: number): void {
  if (amount <= 0) return;
  if (from !== 'town') from.cash -= amount;
  if (to !== 'town') to.cash += amount;
  w.ledger.push({ hour: w.hour, kind: from === 'town' ? 'mint' : 'transfer', ...(from === 'town' ? {} : { from: idOf(from) }), to: idOf(to), item: COINS, units: amount });
}

export const merchantItems = (m: Merchant): Item[] => Object.keys(m.target) as Item[];
const totalStock = (m: Merchant) => Object.values(m.stock).reduce((a, b) => a + (b ?? 0), 0);

/** Sell `units` of `item` to a merchant, one unit at a time so each unit moves the price. Returns units sold. */
export function sellToMerchant(w: World, p: Player, m: Merchant, item: Item, units: number, minPrice = 0, priceMult = 1): number {
  let done = 0;
  while (done < units && (p.inventory[item] ?? 0) > 0 && m.state !== 'closed') {
    const q = quoteFor(w, m, item, p);
    // priceMult > 1 is a haggled swing in the player's favour (a game mechanic, not pricing logic).
    const price = Math.round(q.buyPrice * priceMult);
    if (!q.willBuy || q.buyPrice < minPrice || m.cash < price) break;
    transferCoins(w, m, p, price);
    m.stock[item] = (m.stock[item] ?? 0) + 1;
    p.inventory[item] = (p.inventory[item] ?? 0) - 1;
    m.memory.push({ hour: w.hour, item, kind: 'sold', units: 1 });
    w.ledger.push({ hour: w.hour, kind: 'transfer', from: p.id, to: m.id, item, units: 1 });
    done++;
  }
  if (done) p.reputation[m.id] = Math.min(1, (p.reputation[m.id] ?? 0) + done * 0.002);
  refreshState(w, m);
  return done;
}

/** Buy up to `units` of `item` from a merchant. Returns units bought. */
export function buyFromMerchant(w: World, p: Player, m: Merchant, item: Item, units: number, maxPrice = Infinity, priceMult = 1): number {
  let done = 0;
  while (done < units && (m.stock[item] ?? 0) > 0 && m.state !== 'closed') {
    const q = quoteFor(w, m, item, p);
    const price = Math.round(q.sellPrice / priceMult); // haggled discount for the player
    if (!q.willSell || q.sellPrice > maxPrice || p.cash < price) break;
    transferCoins(w, p, m, price);
    m.stock[item] = (m.stock[item] ?? 0) - 1;
    p.inventory[item] = (p.inventory[item] ?? 0) + 1;
    m.memory.push({ hour: w.hour, item, kind: 'bought', units: 1 });
    w.ledger.push({ hour: w.hour, kind: 'transfer', from: m.id, to: p.id, item, units: 1 });
    done++;
  }
  if (done) p.reputation[m.id] = Math.min(1, (p.reputation[m.id] ?? 0) + done * 0.002);
  refreshState(w, m);
  return done;
}

/** Recompute open/struggling/closed and log changes. */
export function refreshState(w: World, m: Merchant) {
  if (m.owner) {
    m.state = 'open'; // a player's stall is open whenever its owner says so
    return;
  }
  let next = merchantState(m.cash, m.cashFloor, totalStock(m));
  // Hysteresis: a struggling shop needs a 30% cushion over the floor before it trusts itself again.
  if (m.state === 'struggling' && next === 'open' && m.cash < m.cashFloor * 1.3) next = 'struggling';
  if (next !== m.state) {
    m.state = next;
    const text =
      next === 'closed'
        ? `${m.name} has run out of cash and stock and closed.`
        : next === 'struggling'
          ? `${m.name} is low on cash and stopped buying.`
          : `${m.name} is trading normally again.`;
    w.events.push({ hour: w.hour, type: 'state', text, merchant: m.id, to: next });
  }
}

/** Put cash into a closed shop's community fund. When it fills, the shop reopens with contributors on the sign. */
export function contributeToFund(w: World, p: Player, m: Merchant, amount: number): boolean {
  if (m.state !== 'closed') return false;
  const give = Math.min(amount, p.cash, m.fund.goal - m.fund.pool);
  if (give <= 0) return false;
  // The money waits in escrow (an account of its own) until the pool is full, then goes to the shop.
  p.cash -= give;
  m.fund.pool += give;
  w.ledger.push({ hour: w.hour, kind: 'transfer', from: p.id, to: `fund-${m.id}`, item: COINS, units: give });
  m.fund.contributors[p.id] = (m.fund.contributors[p.id] ?? 0) + give;
  if (m.fund.pool >= m.fund.goal) {
    m.cash += m.fund.pool;
    w.ledger.push({ hour: w.hour, kind: 'transfer', from: `fund-${m.id}`, to: m.id, item: COINS, units: m.fund.pool });
    for (const item of merchantItems(m)) {
      const units = Math.floor((m.target[item] ?? 0) / 2);
      m.stock[item] = units;
      if (units) w.ledger.push({ hour: w.hour, kind: 'mint', to: m.id, item, units });
    }
    // Contributors become shareholders in proportion to what they put in.
    for (const [id, put] of Object.entries(m.fund.contributors)) {
      const grant = Math.min(Math.floor((MAX_PUBLIC_SHARES * put) / m.fund.goal), publicSharesLeft(m));
      if (grant > 0) m.shares[id] = (m.shares[id] ?? 0) + grant;
      const who = w.players.find((x) => x.id === id);
      if (who) addNote(w, who, `${m.name} reopened thanks to your community fund contribution${grant > 0 ? `. You now hold ${m.shares[id]} shares` : ''}.`);
    }
    m.sign = Object.keys(m.fund.contributors);
    m.fund.pool = 0;
    m.fund.contributors = {};
    m.memory = [];
    m.state = 'open';
    m.dayStartWorth = merchantWorth(m);
    w.events.push({ hour: w.hour, type: 'revived', text: `${m.name} reopened thanks to a community fund.`, merchant: m.id });
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
  w.events.push({ hour: w.hour, type: 'shock', text: `Shock: ${kind} for ${length}h.`, shock: kind, length });
}

/** Coins per unit to move goods between markets. Fuel queues double it. */
export const carryCost = (w: World) => (activeShock(w, 'fuel queue') ? 40 : 20);

/** Gathering capacity multiplier (rain slows it). */
export const gatherRate = (w: World) => (activeShock(w, 'rain') ? 0.5 : 1);

/**
 * Units each stall sells to everyday customers per hour at a fair price. Set so a good's town-wide demand
 * roughly matches what its source supplies (see createSources). If supply far outruns demand, prices sit on
 * the floor and nobody can make money; this keeps prices near fair so shocks and shortages are what pay.
 */
export const DEMAND_PER_HOUR: Record<Item, number> = {
  tomatoes: 3.2,
  pepper: 2.4,
  flour: 2,
  cotton: 1,
  lace: 0.4,
  thread: 1.6,
  iron: 2.5,
  'copper wire': 1.3,
};

/** The town trades on its own: everyday customers buy, merchants restock from farms and wholesalers. */
function ambientTrade(w: World) {
  const rain = activeShock(w, 'rain');
  for (const m of w.merchants) {
    // Perishables spoil faster in rain.
    for (const item of PERISHABLE) {
      const s = m.stock[item];
      if (s) {
        const lost = Math.min(s, Math.ceil(s * (rain ? 0.05 : 0.01)));
        m.stock[item] = s - lost;
        w.ledger.push({ hour: w.hour, kind: 'transfer', from: m.id, to: 'town', item, units: lost });
      }
    }
    if (m.state === 'closed') continue;
    if (!m.owner) transferCoins(w, m, 'town', Math.min(m.cash, RENT_PER_HOUR));
    for (const item of merchantItems(m)) {
      // Everyday customers: buy a couple of units if the price is fair.
      const q = quoteFor(w, m, item);
      // How many units everyday customers want this hour: the item's usual rate, a little random.
      const rate = DEMAND_PER_HOUR[item];
      const want = Math.floor(rate) + (w.rng.next() < rate % 1 ? 1 : 0);
      if (q.willSell && q.sellPrice <= BASE_PRICE[item] * 1.6) {
        const n = Math.min(want, m.stock[item] ?? 0);
        m.stock[item] = (m.stock[item] ?? 0) - n;
        transferCoins(w, 'town', m, n * q.sellPrice);
        if (n) w.ledger.push({ hour: w.hour, kind: 'transfer', from: m.id, to: 'town', item, units: n });
      }
      // Restock from farms/wholesalers at a discount to base when running low.
      if (!m.owner && (m.stock[item] ?? 0) < (m.target[item] ?? 0) * 0.85) {
        const unit = Math.round(BASE_PRICE[item] * 0.95);
        const n = Math.min(3, Math.floor(m.cash / unit));
        m.stock[item] = (m.stock[item] ?? 0) + n;
        transferCoins(w, m, 'town', n * unit);
        if (n) w.ledger.push({ hour: w.hour, kind: 'mint', to: m.id, item, units: n });
      }
    }
    refreshState(w, m);
  }
}

// ---------------------------------------------------------------------------------------------
// Ownership: shares, dividends, player-owned stalls
// ---------------------------------------------------------------------------------------------

/** What a merchant is worth: cash plus stock at 80% of base price. */
export function merchantWorth(m: Merchant): number {
  let stock = 0;
  for (const [item, n] of Object.entries(m.stock)) stock += (n ?? 0) * BASE_PRICE[item as Item] * 0.8;
  return m.cash + stock;
}

/** A player's net worth: cash, goods carried (at base price) and shares (at today's price). */
export function playerWorth(w: World, p: Player): number {
  let worth = p.cash;
  for (const [item, n] of Object.entries(p.inventory)) worth += (n ?? 0) * BASE_PRICE[item as Item] * CARRY_VALUE;
  for (const m of w.merchants) if (m.shares[p.id]) worth += m.shares[p.id] * sharePrice(m);
  return Math.round(worth);
}

/** One share is 1% of the merchant's worth (never less than 1 coins). */
export const sharePrice = (m: Merchant) => Math.max(1, Math.round(merchantWorth(m) / SHARES_TOTAL));
export const sharesHeld = (m: Merchant) => Object.values(m.shares).reduce((a, b) => a + b, 0);
export const publicSharesLeft = (m: Merchant) => Math.max(0, MAX_PUBLIC_SHARES - sharesHeld(m));

/** Buying shares puts your cash into the merchant's till, which can lift a struggling shop. */
export function buyShares(w: World, p: Player, m: Merchant, n: number): { error: string } | { cost: number } {
  if (m.owner) return { error: "You can't buy shares in a stall run by another player." };
  if (m.state === 'closed') return { error: `${m.name} is closed. Start a community fund to reopen it.` };
  if (!Number.isInteger(n) || n < 1) return { error: 'Pick a whole number of shares.' };
  if (n > publicSharesLeft(m)) return { error: publicSharesLeft(m) === 0 ? `No shares left in ${m.name}. They keep the majority.` : `Only ${publicSharesLeft(m)} shares left in ${m.name}.` };
  const cost = n * sharePrice(m);
  if (p.cash < cost) return { error: `${n} shares cost ${cost} coins.` };
  transferCoins(w, p, m, cost);
  m.shares[p.id] = (m.shares[p.id] ?? 0) + n;
  m.dayStartWorth = (m.dayStartWorth ?? merchantWorth(m) - cost) + cost; // an investment is not profit
  refreshState(w, m);
  return { cost };
}

/** Selling back is at the current price, if the merchant can afford it. */
export function sellShares(w: World, p: Player, m: Merchant, n: number): { error: string } | { proceeds: number } {
  const have = m.shares[p.id] ?? 0;
  if (!Number.isInteger(n) || n < 1) return { error: 'Pick a whole number of shares.' };
  if (have < n) return { error: `You only hold ${have} shares in ${m.name}.` };
  const proceeds = n * sharePrice(m);
  if (m.cash < proceeds) return { error: `${m.name} can't afford to buy your shares back right now.` };
  transferCoins(w, m, p, proceeds);
  m.shares[p.id] = have - n;
  if (m.shares[p.id] === 0) delete m.shares[p.id];
  m.dayStartWorth = (m.dayStartWorth ?? merchantWorth(m) + proceeds) - proceeds;
  refreshState(w, m);
  return { proceeds };
}

export const DIVIDEND_RATE = 0.3; // share of the day's profit paid out
const DIVIDEND_CUSHION = 1.5; // never pay out below 1.5x the cash floor

/** End of day: each merchant pays shareholders a cut of the day's profit, from cash above a safety cushion. */
function payDividends(w: World) {
  for (const m of w.merchants) {
    if (m.owner || m.state === 'closed') continue;
    const worth = merchantWorth(m);
    const base = m.dayStartWorth ?? worth;
    const profit = worth - base;
    const held = sharesHeld(m);
    if (profit > 0 && held > 0) {
      const pool = Math.min(Math.floor(profit * DIVIDEND_RATE), Math.max(0, Math.floor(m.cash - m.cashFloor * DIVIDEND_CUSHION)));
      let paid = 0;
      for (const [id, n] of Object.entries(m.shares)) {
        const pay = Math.floor((pool * n) / SHARES_TOTAL);
        const holder = w.players.find((x) => x.id === id);
        if (pay <= 0 || !holder) continue;
        transferCoins(w, m, holder, pay);
        paid += pay;
        addNote(w, holder, `${m.name} paid you ${pay} coins in dividends for your ${n} shares.`);
      }
      if (paid > 0) w.events.push({ hour: w.hour, type: 'dividend', text: `${m.name} paid ${paid} coins in dividends to its shareholders.`, merchant: m.id, amount: paid });
    }
    m.dayStartWorth = merchantWorth(m); // tomorrow's baseline
  }
}

export const STALL_COST = 6_000;
/** Markets that have a free plot for a player's stall. */
export const STALL_MARKETS: MarketId[] = ['produce', 'fabric'];

export function ownerStallOf(w: World, p: Player): Merchant | undefined {
  return w.merchants.find((m) => m.owner === p.id);
}

export function openOwnerStall(w: World, p: Player, market: MarketId, ownerName: string): Merchant {
  const items = MARKETS[market].items;
  const stall: Merchant = {
    id: `stall-${p.id}`,
    name: `${ownerName}'s stall`,
    market,
    personality: 'cautious', // unused: a player's prices are not formula-driven
    cash: 0,
    cashFloor: 0,
    stock: {},
    target: Object.fromEntries(items.map((i) => [i, 20])),
    state: 'open',
    memory: [],
    fund: { pool: 0, goal: 0, contributors: {} },
    shares: {},
    sign: [],
    owner: p.id,
    ownerName,
    prices: Object.fromEntries(items.map((i) => [i, { buy: clampPlayerPrice(BASE_PRICE[i] * 0.8, BASE_PRICE[i]), sell: clampPlayerPrice(BASE_PRICE[i] * 1.2, BASE_PRICE[i]) }])),
  };
  w.merchants.push(stall);
  return stall;
}

/** Agent merchants trade with a player's stall using their own pricing.ts quotes (DESIGN.md §2). */
function agentTrade(w: World) {
  for (const o of w.merchants.filter((x) => x.owner)) {
    for (const m of w.merchants) {
      if (m.owner || m.state === 'closed' || m.market !== o.market) continue;
      for (const item of merchantItems(o)) {
        if (m.target[item] === undefined) continue;
        const q = quoteFor(w, m, item);
        const qo = quoteFor(w, o, item);
        // The merchant buys from the stall when the stall undercuts what the merchant would charge,
        // and the merchant has room on its shelf and cash to spare.
        if (qo.willSell && qo.sellPrice < q.mid * 0.95 && (m.stock[item] ?? 0) < (m.target[item] ?? 0) * 1.2) {
          const n = Math.min(2, o.stock[item] ?? 0, Math.floor(Math.max(0, m.cash - m.cashFloor) / qo.sellPrice));
          if (n > 0) {
            o.stock[item] = (o.stock[item] ?? 0) - n;
            m.stock[item] = (m.stock[item] ?? 0) + n;
            transferCoins(w, m, o, n * qo.sellPrice);
            m.memory.push({ hour: w.hour, item, kind: 'sold', units: n });
            w.ledger.push({ hour: w.hour, kind: 'transfer', from: o.id, to: m.id, item, units: n });
            notifyOwner(w, o, `${m.name} bought ${n} ${item} from your stall for ${n * qo.sellPrice} coins.`);
            continue;
          }
        }
        // The merchant sells its surplus to the stall when the stall pays at least what the merchant would.
        if (qo.willBuy && qo.buyPrice >= q.buyPrice && (m.stock[item] ?? 0) > (m.target[item] ?? 0)) {
          const n = Math.min(2, (m.stock[item] ?? 0) - (m.target[item] ?? 0), Math.floor(o.cash / qo.buyPrice));
          if (n > 0) {
            m.stock[item] = (m.stock[item] ?? 0) - n;
            o.stock[item] = (o.stock[item] ?? 0) + n;
            transferCoins(w, o, m, n * qo.buyPrice);
            m.memory.push({ hour: w.hour, item, kind: 'bought', units: n });
            w.ledger.push({ hour: w.hour, kind: 'transfer', from: m.id, to: o.id, item, units: n });
            notifyOwner(w, o, `${m.name} sold ${n} ${item} to your stall for ${n * qo.buyPrice} coins.`);
          }
        }
      }
      refreshState(w, m);
    }
  }
}

function notifyOwner(w: World, stall: Merchant, text: string) {
  const owner = w.players.find((p) => p.id === stall.owner);
  if (owner) addNote(w, owner, text);
}

/** Record something that happened to a player's business. Keeps only the latest 80. */
export function addNote(w: World, p: Player, text: string) {
  p.notes.push({ hour: w.hour, text });
  if (p.notes.length > 80) p.notes.splice(0, p.notes.length - 80);
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
  agentTrade(w);
  if (w.hour % 24 === 23) payDividends(w);
  snapshot(w);
  w.hour++;
}
