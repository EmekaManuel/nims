/**
 * Live game state. The sim world IS the game: it ticks in real time, NPC traders keep the town
 * moving, and human players act on it through these methods.
 *
 * Gameplay never waits on the chain (CLAUDE.md): every action applies to this in-memory state
 * immediately. The world's item ledger is what gets batch-settled afterwards.
 *
 * Nothing here knows about wallets, keys or gas, and nothing returned to a player mentions them.
 */
import { createHash } from 'node:crypto';
import { makeRng } from '../sim/rng';
import { act, newPlayer } from '../sim/players';
import {
  activeShock, addNote, buyFromMerchant, buyShares, carryCost, contributeToFund, gatherRate, merchantItems, openOwnerStall, ownerStallOf,
  publicSharesLeft, quoteFor, refreshState, sellShares, sellToMerchant, sharePrice, STALL_COST, STALL_MARKETS, tick,
} from '../sim/engine';
import { clampPlayerPrice, MAX_MULT, MIN_MULT } from '../merchants/pricing';
import { gather } from '../sim/players';
import { BASE_PRICE, CAPACITY, createWorld, Item, MARKETS, MarketId, Merchant, Player, Vehicle, World } from '../sim/world';

export const UPGRADE_COST: Record<Exclude<Vehicle, 'wheelbarrow'>, number> = { pickup: 5_000, van: 18_000 };
const SOURCE_LABEL: Record<string, string> = {};
const START_CASH = 3_000;
/** Away for this many in-game hours (about 1.5 minutes of real time) and you get a summary on return. */
const AWAY_HOURS = 24;
const HISTORY_KEEP = 24 * 7;
const LEDGER_KEEP = 20_000;
/** Version 2: the Nims renaming (merchants, goods, vehicles). Older saves hold names and items that no longer exist. */
export const SNAPSHOT_VERSION = 2;

export type GoalKind = 'fortune' | 'reach' | 'stake' | 'district';

/** The session goals a player can pick (DESIGN.md §2). Shown in the UI with a progress bar. */
export const GOALS: Record<GoalKind, { title: string; blurb: string }> = {
  fortune: { title: 'Build a fortune', blurb: `Grow your net worth to ${(25_000).toLocaleString('en-US')} coins. Buy low, carry it, sell high.` },
  reach: { title: 'Trade everywhere', blurb: 'Sell in all three markets and buy a van. Learn where each good is dear.' },
  stake: { title: 'A stake in every market', blurb: 'Own shares in a merchant in each of the three markets. Your money works while you sleep.' },
  district: { title: 'Keep the district alive', blurb: 'Keep every stall open for 3 days in a row. Flood a stall with goods and it can go broke.' },
};
const FORTUNE_TARGET = 25_000;
const DISTRICT_HOURS = 72;

interface Progress {
  kind: GoalKind | null;
  done: boolean;
  marketsSold: Set<MarketId>;
  /** Consecutive in-game hours with every stall open (district goal). */
  streak: number;
  /** Last in-game hour this player looked at the game, and where an absence began. */
  lastSeen?: number;
  awayFrom?: number;
}

/** A friendly name from the part of the email before the @, e.g. ada.obi@x.com -> "Ada". Never the full address. */
export function displayName(email: string): string {
  const first = email.split('@')[0].split(/[._\-+0-9]+/).find((x) => x.length > 0) ?? 'Trader';
  const name = first.slice(0, 12);
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export interface ActionResult {
  ok: boolean;
  /** Plain-English line to show the player. */
  message: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });
const ok = (message: string): ActionResult => ({ ok: true, message });

export class Game {
  readonly w: World;
  private humans = new Map<string, Player>();
  /** player id -> merchant id -> hour of the last haggle (one haggle per merchant per hour). */
  private haggled = new Map<string, number>();
  private progress = new Map<string, Progress>();
  /** player id -> the name shown on signs and stalls. */
  private names = new Map<string, string>([['npc-investor', 'The Community Fund']]);

  constructor(seed = 1) {
    // A few NPC traders so the town is alive before anyone logs in.
    this.w = createWorld(seed, [
      newPlayer('npc-gatherer-1', 'gatherer'),
      newPlayer('npc-gatherer-2', 'gatherer'),
      newPlayer('npc-arbitrageur', 'arbitrageur', 8_000),
      newPlayer('npc-investor', 'investor', 40_000),
    ]);
    for (const s of this.w.sources) SOURCE_LABEL[s.item] = s.label;
  }

  /**
   * Everything needed to carry on after a restart: the world (with its RNG), who the human players
   * are, their goals and progress, and their display names. Plain JSON.
   */
  snapshot() {
    const w = this.w;
    return {
      version: SNAPSHOT_VERSION,
      world: {
        hour: w.hour,
        merchants: w.merchants,
        players: w.players,
        sources: w.sources,
        shocks: w.shocks,
        events: w.events,
        history: w.history,
        ledger: w.ledger,
        rngState: w.rng.state(),
      },
      humans: [...this.humans].map(([email, p]) => [email, p.id] as [string, string]),
      progress: [...this.progress].map(([email, pr]) => [email, { ...pr, marketsSold: [...pr.marketsSold] }] as [string, unknown]),
      names: [...this.names],
      haggled: [...this.haggled],
    };
  }

  /** Rebuild a game from snapshot(). Throws on a snapshot it does not understand. */
  static restore(snap: ReturnType<Game['snapshot']>): Game {
    if (!snap || snap.version !== SNAPSHOT_VERSION) throw new Error(`Unsupported save (version ${snap?.version})`);
    const g = new Game(1);
    const w = g.w;
    w.hour = snap.world.hour;
    w.merchants = snap.world.merchants;
    w.players = snap.world.players;
    w.sources = snap.world.sources;
    w.shocks = snap.world.shocks;
    w.events = snap.world.events;
    w.history = snap.world.history;
    w.ledger = snap.world.ledger;
    w.rng = makeRng(0, snap.world.rngState);
    g.humans = new Map(snap.humans.map(([email, id]) => [email, w.players.find((p) => p.id === id)!]).filter(([, p]) => p) as [string, Player][]);
    g.progress = new Map((snap.progress as [string, Progress & { marketsSold: MarketId[] }][]).map(([email, pr]) => [email, { ...pr, marketsSold: new Set(pr.marketsSold) }]));
    g.names = new Map(snap.names);
    g.haggled = new Map(snap.haggled);
    return g;
  }

  /** Advance one in-game hour (server/main.ts calls this on a timer). */
  tickOnce() {
    tick(this.w, act);
    // A live game runs for days: keep only the recent past so memory and save files stay small.
    if (this.w.history.length > HISTORY_KEEP) this.w.history.splice(0, this.w.history.length - HISTORY_KEEP);
    if (this.w.ledger.length > LEDGER_KEEP) this.w.ledger.splice(0, this.w.ledger.length - LEDGER_KEEP);
    if (this.w.events.length > 200) this.w.events.splice(0, this.w.events.length - 200);
    const anyClosed = this.w.merchants.some((m) => m.state === 'closed');
    for (const [email, pr] of this.progress) {
      if (pr.kind === 'district' && !pr.done) pr.streak = anyClosed ? 0 : pr.streak + 1;
      this.checkDone(email);
    }
  }

  private prog(email: string): Progress {
    let pr = this.progress.get(email);
    if (!pr) this.progress.set(email, (pr = { kind: null, done: false, marketsSold: new Set(), streak: 0 }));
    return pr;
  }

  chooseGoal(email: string, kind: string): ActionResult {
    if (!(kind in GOALS)) return fail('Pick one of the goals.');
    const pr = this.prog(email);
    pr.kind = kind as GoalKind;
    pr.done = false;
    pr.streak = 0;
    return ok(`Your goal: ${GOALS[pr.kind].title}.`);
  }

  /** 0..1 progress and a plain-English status line for the chosen goal. */
  private goalStatus(email: string, p: Player): { progress: number; label: string } | null {
    const pr = this.prog(email);
    if (!pr.kind) return null;
    const worth = this.netWorth(p);
    if (pr.kind === 'fortune') return { progress: Math.min(1, worth / FORTUNE_TARGET), label: `${worth.toLocaleString('en-US')} coins of ${FORTUNE_TARGET.toLocaleString('en-US')} coins` };
    if (pr.kind === 'reach') {
      const van = p.vehicle === 'van';
      return { progress: (pr.marketsSold.size + (van ? 1 : 0)) / 4, label: `Sold in ${pr.marketsSold.size} of 3 markets · ${van ? 'you have a van' : 'no van yet'}` };
    }
    if (pr.kind === 'stake') {
      const n = this.marketsWithStake(p).size;
      return { progress: n / 3, label: `Shares in ${n} of 3 markets` };
    }
    return { progress: Math.min(1, pr.streak / DISTRICT_HOURS), label: `${pr.streak} of ${DISTRICT_HOURS} hours with every stall open` };
  }

  private checkDone(email: string) {
    const pr = this.prog(email);
    const p = this.humans.get(email);
    if (!p || !pr.kind || pr.done) return;
    const st = this.goalStatus(email, p);
    if (st && st.progress >= 1) pr.done = true;
  }

  /** Cash, what you carry, your shares at today's price, and your stall's till and stock. */
  private netWorth(p: Player) {
    let worth = p.cash + Object.entries(p.inventory).reduce((a, [i, n]) => a + (n ?? 0) * BASE_PRICE[i as Item], 0);
    for (const m of this.w.merchants) {
      if (m.shares[p.id]) worth += m.shares[p.id] * sharePrice(m);
      if (m.owner === p.id) worth += m.cash + Object.entries(m.stock).reduce((a, [i, n]) => a + (n ?? 0) * BASE_PRICE[i as Item], 0);
    }
    return Math.round(worth);
  }

  private marketsWithStake(p: Player): Set<MarketId> {
    return new Set(this.w.merchants.filter((m) => !m.owner && (m.shares[p.id] ?? 0) > 0).map((m) => m.market));
  }

  /** The player for this login. Created on first visit; the id is opaque. */
  playerFor(email: string): Player {
    const existing = this.humans.get(email);
    if (existing) return existing;
    const id = 'h-' + createHash('sha256').update(email).digest('hex').slice(0, 10);
    const p = newPlayer(id, 'human', START_CASH);
    p.at = 'produce';
    this.w.players.push(p);
    this.humans.set(email, p);
    this.names.set(id, displayName(email));
    return p;
  }

  private carried = (p: Player) => Object.values(p.inventory).reduce((a, b) => a + (b ?? 0), 0);

  /** Moving to a stall in another market costs a fare per unit carried (fuel queues double it). */
  private travelTo(p: Player, market: MarketId): ActionResult | null {
    if (p.at === market) return null;
    const fare = this.carried(p) * carryCost(this.w);
    if (p.cash < fare) return fail(`You can't afford the fare to ${MARKETS[market].name} (${fare} coins).`);
    p.cash -= fare;
    p.at = market;
    return null;
  }

  gather(email: string, item: Item): ActionResult {
    const p = this.playerFor(email);
    const src = this.w.sources.find((s) => s.item === item);
    if (!src) return fail('Nothing to collect there.');
    if (this.carried(p) >= CAPACITY[p.vehicle]) return fail(`Your ${p.vehicle} is full. Sell something first.`);
    if (src.cost > 0 && p.cash < src.cost) return fail(`You need ${src.cost} coins per unit here.`);
    const n = gather(this.w, p, item);
    if (n === 0) return fail(src.units <= 0 ? 'Someone has already cleared this spot. It refills over time.' : 'You could not carry any more.');
    const rain = activeShock(this.w, 'rain') ? ' Rain slowed you down.' : '';
    return ok(`You collected ${n} ${item}.${rain}`);
  }

  sell(email: string, merchantId: string, item: Item, units: number, haggle = false): ActionResult {
    const p = this.playerFor(email);
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m || !(item in BASE_PRICE) || !merchantItems(m).includes(item)) return fail('That stall does not trade that.');
    if (m.owner === p.id) return fail('That is your own stall. Use the stock controls in My business.');
    if (!Number.isInteger(units) || units < 1) return fail('Pick a whole number of units.');
    if (m.state === 'closed') return fail(`${m.name} is closed.`);
    const have = p.inventory[item] ?? 0;
    if (have < 1) return fail(`You are not carrying any ${item}.`);
    const q = quoteFor(this.w, m, item, p);
    if (!q.willBuy) return fail(`${m.name} has stopped buying ${item}. ${q.reasons.find((r) => r.includes('cash')) ?? ''}`.trim());
    const trip = this.travelTo(p, m.market);
    if (trip) return trip;
    const mult = haggle ? this.haggleSwing(p, m.id) : 1;
    if (haggle && mult === 1) return fail('You already haggled with them this hour.');
    const sold = sellToMerchant(this.w, p, m, item, Math.min(units, have), 0, mult);
    if (sold === 0) return fail(`${m.name} could not take any ${item} right now.`);
    this.prog(email).marketsSold.add(m.market);
    this.checkDone(email);
    this.tellOwner(m, p, `bought ${sold} ${item} from`, `sold you`, sold, item, 'sell');
    return ok(`Sold ${sold} ${item} to ${m.name}.${haggle ? ` You haggled a ${Math.round((mult - 1) * 100)}% better price.` : ''}`);
  }

  buy(email: string, merchantId: string, item: Item, units: number, haggle = false): ActionResult {
    const p = this.playerFor(email);
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m || !(item in BASE_PRICE) || !merchantItems(m).includes(item)) return fail('That stall does not trade that.');
    if (m.owner === p.id) return fail('That is your own stall. Use the stock controls in My business.');
    if (!Number.isInteger(units) || units < 1) return fail('Pick a whole number of units.');
    if (m.state === 'closed') return fail(`${m.name} is closed.`);
    const room = CAPACITY[p.vehicle] - this.carried(p);
    if (room < 1) return fail(`Your ${p.vehicle} is full.`);
    const trip = this.travelTo(p, m.market);
    if (trip) return trip;
    const mult = haggle ? this.haggleSwing(p, m.id) : 1;
    if (haggle && mult === 1) return fail('You already haggled with them this hour.');
    const bought = buyFromMerchant(this.w, p, m, item, Math.min(units, room), Infinity, mult);
    if (bought === 0) return fail(`You could not buy any ${item} (out of stock, or not enough cash).`);
    this.tellOwner(m, p, '', '', bought, item, 'buy');
    return ok(`Bought ${bought} ${item} from ${m.name}.`);
  }

  /** One haggle per merchant per in-game hour. A regular gets a bigger swing (2%–8%). Returns 1 if not allowed. */
  private haggleSwing(p: Player, merchantId: string): number {
    const k = `${p.id}|${merchantId}`;
    if (this.haggled.get(k) === this.w.hour) return 1;
    this.haggled.set(k, this.w.hour);
    return 1 + Math.min(0.08, 0.02 + 0.06 * (p.reputation[merchantId] ?? 0));
  }

  /** When someone trades with a player's stall, the owner hears about it. */
  private tellOwner(m: Merchant, p: Player, _a: string, _b: string, units: number, item: Item, dir: 'sell' | 'buy') {
    if (!m.owner || m.owner === p.id) return;
    const owner = this.w.players.find((x) => x.id === m.owner);
    if (!owner) return;
    const who = this.names.get(p.id) ?? 'A trader';
    addNote(this.w, owner, dir === 'sell' ? `${who} sold ${units} ${item} to your stall.` : `${who} bought ${units} ${item} from your stall.`);
  }

  // ---- shares and fund ----------------------------------------------------------------------

  buyShares(email: string, merchantId: string, n: number): ActionResult {
    const p = this.playerFor(email);
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m) return fail('No such stall.');
    const r = buyShares(this.w, p, m, n);
    if ('error' in r) return fail(r.error);
    this.checkDone(email);
    return ok(`You bought ${n} shares in ${m.name} for ${r.cost} coins. You'll share in their profit each evening.`);
  }

  sellShares(email: string, merchantId: string, n: number): ActionResult {
    const p = this.playerFor(email);
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m) return fail('No such stall.');
    const r = sellShares(this.w, p, m, n);
    if ('error' in r) return fail(r.error);
    return ok(`You sold ${n} shares in ${m.name} for ${r.proceeds} coins.`);
  }

  /** Put money into a closed shop's community fund. When the pool is full the shop reopens and you co-own it. */
  contribute(email: string, merchantId: string, amount: number): ActionResult {
    const p = this.playerFor(email);
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m || m.owner) return fail('No such shop.');
    if (m.state !== 'closed') return fail(`${m.name} is open. An community fund is for shops that have closed.`);
    if (!Number.isInteger(amount) || amount < 100) return fail('The smallest contribution is 100 coins.');
    const was = m.state;
    const before = m.fund.pool;
    if (p.cash < 1) return fail('You have no cash to put in.');
    if (!contributeToFund(this.w, p, m, amount)) return fail('Could not add to the pool.');
    this.checkDone(email);
    if (was === 'closed' && (m.state as string) === 'open') return ok(`The pool is full: ${m.name} is open again, and you co-own it.`);
    return ok(`You put ${Math.round(m.fund.pool - before)} coins into ${m.name}'s community fund (${Math.round(m.fund.pool)} coins of ${m.fund.goal} coins).`);
  }

  // ---- your own stall ----------------------------------------------------------------------

  private myStall(email: string): Merchant | undefined {
    return ownerStallOf(this.w, this.playerFor(email));
  }

  openStall(email: string, market: string): ActionResult {
    const p = this.playerFor(email);
    if (this.myStall(email)) return fail('You already have a stall.');
    if (!STALL_MARKETS.includes(market as MarketId)) return fail('There is no free plot in that market. Try the Produce or Fabric Market.');
    if (p.cash < STALL_COST) return fail(`A stall costs ${STALL_COST.toLocaleString('en-US')} coins.`);
    p.cash -= STALL_COST;
    const stall = openOwnerStall(this.w, p, market as MarketId, this.names.get(p.id) ?? 'Your');
    addNote(this.w, p, `You opened ${stall.name} in the ${MARKETS[market as MarketId].name}.`);
    return ok(`Your stall is open in the ${MARKETS[market as MarketId].name}. Stock the shelves and set your prices.`);
  }

  stallStock(email: string, item: Item, units: number): ActionResult {
    const p = this.playerFor(email);
    const st = this.myStall(email);
    if (!st) return fail('You do not have a stall yet.');
    if (!(item in st.target)) return fail(`Your stall in the ${MARKETS[st.market].name} does not trade ${item}.`);
    if (!Number.isInteger(units) || units < 1) return fail('Pick a whole number of units.');
    const have = p.inventory[item] ?? 0;
    if (have < units) return fail(`You are only carrying ${have} ${item}.`);
    p.inventory[item] = have - units;
    st.stock[item] = (st.stock[item] ?? 0) + units;
    this.w.ledger.push({ hour: this.w.hour, kind: 'transfer', from: p.id, to: st.id, item, units });
    return ok(`Put ${units} ${item} on your shelves.`);
  }

  stallTake(email: string, item: Item, units: number): ActionResult {
    const p = this.playerFor(email);
    const st = this.myStall(email);
    if (!st) return fail('You do not have a stall yet.');
    if (!Number.isInteger(units) || units < 1) return fail('Pick a whole number of units.');
    const have = st.stock[item] ?? 0;
    if (have < units) return fail(`Your shelves only hold ${have} ${item}.`);
    if (this.carried(p) + units > CAPACITY[p.vehicle]) return fail(`Your ${p.vehicle} can't carry that many.`);
    st.stock[item] = have - units;
    p.inventory[item] = (p.inventory[item] ?? 0) + units;
    this.w.ledger.push({ hour: this.w.hour, kind: 'transfer', from: st.id, to: p.id, item, units });
    return ok(`Took ${units} ${item} off your shelves.`);
  }

  stallPrice(email: string, item: Item, buy: number, sell: number): ActionResult {
    const st = this.myStall(email);
    if (!st) return fail('You do not have a stall yet.');
    if (!(item in st.target)) return fail(`Your stall does not trade ${item}.`);
    if (![buy, sell].every((n) => Number.isInteger(n))) return fail('Prices are whole coins.');
    const lo = Math.round(BASE_PRICE[item] * MIN_MULT);
    const hi = Math.round(BASE_PRICE[item] * MAX_MULT);
    if ([buy, sell].some((n) => n < lo || n > hi)) return fail(`Keep ${item} between ${lo} coins and ${hi} coins. The usual price is ${BASE_PRICE[item]} coins.`);
    if (sell < buy) return fail('You would lose money selling for less than you pay.');
    st.prices = { ...st.prices, [item]: { buy: clampPlayerPrice(buy, BASE_PRICE[item]), sell: clampPlayerPrice(sell, BASE_PRICE[item]) } };
    return ok(`${item}: you pay ${buy} coins, you charge ${sell} coins.`);
  }

  /** Move cash between you and your till. The till is what your stall uses to buy. */
  stallCash(email: string, direction: 'deposit' | 'withdraw', amount: number): ActionResult {
    const p = this.playerFor(email);
    const st = this.myStall(email);
    if (!st) return fail('You do not have a stall yet.');
    if (!Number.isInteger(amount) || amount < 1) return fail('Pick a whole number of coins.');
    if (direction === 'deposit') {
      if (p.cash < amount) return fail('You do not have that much cash.');
      p.cash -= amount;
      st.cash += amount;
      return ok(`Put ${amount} coins in your till.`);
    }
    if (st.cash < amount) return fail(`Your till only holds ${Math.round(st.cash)} coins.`);
    st.cash -= amount;
    p.cash += amount;
    return ok(`Took ${amount} coins out of your till.`);
  }

  /** Dismiss the "while you were away" summary. */
  ack(email: string): ActionResult {
    this.prog(email).awayFrom = undefined;
    return ok('Welcome back.');
  }

  upgrade(email: string, to: string): ActionResult {
    const p = this.playerFor(email);
    if (to !== 'pickup' && to !== 'van') return fail('Pick pickup or van.');
    const order: Vehicle[] = ['wheelbarrow', 'pickup', 'van'];
    if (order.indexOf(to) <= order.indexOf(p.vehicle)) return fail(`You already have a ${p.vehicle}.`);
    if (order.indexOf(to) > order.indexOf(p.vehicle) + 1) return fail('Buy a pickup first.');
    if (p.cash < UPGRADE_COST[to]) return fail(`A ${to} costs ${UPGRADE_COST[to]} coins.`);
    p.cash -= UPGRADE_COST[to];
    p.vehicle = to;
    this.checkDone(email);
    return ok(`You bought a ${to}. It carries ${CAPACITY[to]}.`);
  }

  /** Where the money is right now: collect or buy cheap, sell dear. Best three, by profit per unit. */
  private deals(p: Player, allStalls: ReturnType<Game['stallViews']>) {
    const stalls = allStalls.filter((s) => s.owner?.mine !== true);
    const out: { item: Item; from: { kind: 'source' | 'stall'; id: string; label: string; cost: number }; to: { stall: string; id: string; price: number; market: MarketId }; profit: number }[] = [];
    for (const item of Object.keys(BASE_PRICE) as Item[]) {
      const offers = stalls.flatMap((s) => s.offers.filter((o) => o.item === item).map((o) => ({ s, o })));
      const best = offers.filter((x) => x.o.willBuy).sort((a, b) => b.o.buyPrice - a.o.buyPrice)[0];
      if (!best) continue;
      const src = this.w.sources.find((x) => x.item === item && x.units >= 5);
      const cheapStall = offers.filter((x) => x.o.willSell && x.s.id !== best.s.id).sort((a, b) => a.o.sellPrice - b.o.sellPrice)[0];
      let from: (typeof out)[number]['from'] | null = null;
      if (src && (!cheapStall || src.cost <= cheapStall.o.sellPrice)) from = { kind: 'source', id: item, label: src.label, cost: src.cost };
      else if (cheapStall) from = { kind: 'stall', id: cheapStall.s.id, label: cheapStall.s.name, cost: cheapStall.o.sellPrice };
      if (!from) continue;
      const fare = from.kind === 'stall' && stalls.find((s) => s.id === from!.id)!.market !== best.s.market ? carryCost(this.w) : 0;
      const profit = best.o.buyPrice - from.cost - fare;
      if (profit > 0) out.push({ item, from, to: { stall: best.s.name, id: best.s.id, price: best.o.buyPrice, market: best.s.market }, profit });
    }
    return out.sort((a, b) => b.profit - a.profit).slice(0, 3);
  }

  /** One clear next step, with somewhere on the map to point at. */
  private coach(email: string, p: Player, allStalls: ReturnType<Game['stallViews']>, deals: ReturnType<Game['deals']>) {
    const stalls = allStalls.filter((s) => s.owner?.mine !== true);
    const pr = this.prog(email);
    type Focus = { kind: 'source' | 'stall'; id: string } | null;
    const say = (text: string, focus: Focus = null) => ({ text, focus });
    if (!pr.kind) return say('Pick a goal to play towards. You can change it any time.');
    if (pr.done) return say('Goal reached! Well traded. Pick a new goal to keep going.');
    // Goal-specific nudges first.
    if (pr.kind === 'district') {
      const shut = stalls.find((x) => x.state === 'closed');
      if (shut) return say(`${shut.name} has closed, which resets your streak. Put money into its community fund to reopen it.`, { kind: 'stall', id: shut.id });
    }
    if (pr.kind === 'stake') {
      const have = this.marketsWithStake(p);
      const missing = (Object.keys(MARKETS) as MarketId[]).find((mk) => !have.has(mk));
      if (missing) {
        const pick = stalls.filter((x) => x.market === missing && x.state !== 'closed' && x.shares).sort((a, b) => a.shares!.price - b.shares!.price)[0];
        if (pick) return say(`Buy a few shares in ${pick.name} (${pick.shares!.price} coins each) to get a stake in the ${MARKETS[missing].name}.`, { kind: 'stall', id: pick.id });
      }
    }
    const carried = this.carried(p);
    if (carried > 0) {
      const [item, units] = Object.entries(p.inventory).filter(([, n]) => (n ?? 0) > 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0] as [Item, number];
      const options = stalls
        .filter((s) => s.state !== 'closed')
        .flatMap((s) => s.offers.filter((o) => o.item === item && o.willBuy).map((o) => ({ s, o })))
        .map((x) => ({ ...x, net: x.o.buyPrice * units - (p.at && p.at !== x.s.market ? carried * carryCost(this.w) : 0) }))
        .sort((a, b) => b.net - a.net);
      if (options.length) {
        const top = options[0];
        const here = p.at === top.s.market ? '' : ` It’s in another market, so the trip costs a fare.`;
        return say(`Sell your ${units} ${item} to ${top.s.name}: they pay ${top.o.buyPrice} coins each, the best in town.${here}`, { kind: 'stall', id: top.s.id });
      }
      return say(`Nobody is buying ${item} right now. Try another market, or wait for prices to recover.`);
    }
    if (deals.length) {
      const d = deals[0];
      return say(
        d.from.kind === 'source'
          ? `Collect ${d.item} at the ${d.from.label.replace(/ \(.*\)$/, '').toLowerCase()}${d.from.cost ? ` (${d.from.cost} coins each)` : ' (free)'}, then sell it to ${d.to.stall} for ${d.to.price} coins each.`
          : `Buy ${d.item} from ${d.from.label} at ${d.from.cost} coins, then sell it to ${d.to.stall} for ${d.to.price} coins.`,
        { kind: d.from.kind, id: d.from.id },
      );
    }
    return say('Prices are flat right now. Look at the price board and wait for a gap to open up.');
  }

  private stallViews(p: Player) {
    const w = this.w;
    return w.merchants.map((m) => ({
      id: m.id,
      name: m.name,
      market: m.market,
      personality: m.personality,
      state: m.state,
      till: Math.round(m.cash),
      offers: merchantItems(m).map((item) => {
        const q = quoteFor(w, m, item, p);
        return {
          item,
          base: BASE_PRICE[item],
          buyPrice: q.buyPrice, // what they pay you
          sellPrice: q.sellPrice, // what they charge you
          willBuy: q.willBuy && m.state !== 'closed',
          willSell: q.willSell && m.state !== 'closed',
          stock: m.stock[item] ?? 0,
          /** How much they like to hold. The map draws crates from stock / target. */
          target: m.target[item] ?? 0,
          why: q.tooltip,
        };
      }),
      fund: m.state === 'closed' ? { pool: m.fund.pool, goal: m.fund.goal, contributors: Object.entries(m.fund.contributors).map(([id, put]) => ({ name: this.names.get(id) ?? 'A trader', put })) } : undefined,
      /** Fund contributors who reopened this shop. Shown on its sign. */
      sign: m.sign.map((id) => this.names.get(id) ?? 'A trader'),
      owner: m.owner ? { name: m.ownerName ?? 'A trader', mine: m.owner === p.id } : undefined,
      shares: m.owner ? undefined : { price: sharePrice(m), left: publicSharesLeft(m), yours: m.shares[p.id] ?? 0 },
    }));
  }

  /** Everything the UI needs, including each merchant's own reasoning for every price. */
  state(email: string) {
    const w = this.w;
    const p = this.playerFor(email);
    const raw = this.stallViews(p);
    // Flag, per item, which stall pays the most and which charges the least.
    const bestPay: Partial<Record<Item, number>> = {};
    const bestCharge: Partial<Record<Item, number>> = {};
    for (const s of raw) for (const o of s.offers) {
      if (o.willBuy) bestPay[o.item] = Math.max(bestPay[o.item] ?? 0, o.buyPrice);
      if (o.willSell) bestCharge[o.item] = Math.min(bestCharge[o.item] ?? Infinity, o.sellPrice);
    }
    const stalls = raw.map((s) => ({ ...s, offers: s.offers.map((o) => ({ ...o, bestPay: o.willBuy && o.buyPrice === bestPay[o.item], bestCharge: o.willSell && o.sellPrice === bestCharge[o.item] })) }));

    // Price board: average mid per item per market, relative to base.
    const board = (Object.keys(MARKETS) as MarketId[]).flatMap((market) =>
      MARKETS[market].items.map((item) => {
        const mids = w.merchants
          .filter((m) => m.market === market && m.state !== 'closed' && merchantItems(m).includes(item))
          .map((m) => quoteFor(w, m, item).mid);
        const mid = mids.length ? Math.round(mids.reduce((a, b) => a + b, 0) / mids.length) : null;
        return { market, item, base: BASE_PRICE[item], price: mid };
      }),
    );

    const worth = this.netWorth(p);
    const deals = this.deals(p, raw);
    const pr = this.prog(email);
    const gs = this.goalStatus(email, p);

    // Coming back after a long absence? Remember where it began until the player dismisses the summary.
    if (pr.lastSeen !== undefined && w.hour - pr.lastSeen >= AWAY_HOURS && pr.awayFrom === undefined) pr.awayFrom = pr.lastSeen;
    pr.lastSeen = w.hour;
    const awayFrom = pr.awayFrom;

    const mine = ownerStallOf(w, p);
    const held = w.merchants.filter((m) => !m.owner && (m.shares[p.id] ?? 0) > 0);
    return {
      away: awayFrom === undefined ? null : {
        hours: w.hour - awayFrom,
        notes: p.notes.filter((n) => n.hour >= awayFrom).slice(-8).reverse().map((n) => n.text),
        town: w.events.filter((e) => e.hour >= awayFrom).slice(-6).reverse().map((e) => e.text),
      },
      business: {
        shares: held.map((m) => ({ id: m.id, name: m.name, market: m.market, shares: m.shares[p.id], price: sharePrice(m), value: m.shares[p.id] * sharePrice(m), state: m.state })),
        stall: mine ? {
          id: mine.id,
          name: mine.name,
          market: mine.market,
          till: Math.round(mine.cash),
          items: merchantItems(mine).map((item) => {
            const pr2 = mine.prices?.[item] ?? { buy: Math.round(BASE_PRICE[item] * 0.8), sell: Math.round(BASE_PRICE[item] * 1.2) };
            return { item, base: BASE_PRICE[item], min: Math.round(BASE_PRICE[item] * MIN_MULT), max: Math.round(BASE_PRICE[item] * MAX_MULT), buy: pr2.buy, sell: pr2.sell, stock: mine.stock[item] ?? 0, carrying: p.inventory[item] ?? 0 };
          }),
        } : null,
        stallOffer: mine ? null : { cost: STALL_COST, markets: (Object.keys(MARKETS) as MarketId[]).map((id) => ({ id, name: MARKETS[id].name, free: STALL_MARKETS.includes(id) })) },
        notes: p.notes.slice(-12).reverse(),
      },
      goal: pr.kind ? { kind: pr.kind, title: GOALS[pr.kind].title, blurb: GOALS[pr.kind].blurb, progress: gs!.progress, label: gs!.label, done: pr.done } : null,
      goals: (Object.keys(GOALS) as GoalKind[]).map((k) => ({ kind: k, ...GOALS[k] })),
      coach: this.coach(email, p, raw, deals),
      deals,
      hour: w.hour,
      day: Math.floor(w.hour / 24) + 1,
      shocks: w.shocks.filter((s) => w.hour >= s.startHour && w.hour < s.endHour).map((s) => ({ kind: s.kind, hoursLeft: s.endHour - w.hour })),
      faresPerUnit: carryCost(w),
      gatherSpeed: gatherRate(w),
      markets: Object.entries(MARKETS).map(([id, mk]) => ({ id, name: mk.name, items: mk.items })),
      stalls,
      board,
      sources: w.sources.map((s) => ({ item: s.item, label: s.label, units: Math.floor(s.units), cost: s.cost })),
      events: w.events.slice(-12).reverse(),
      you: {
        cash: Math.round(p.cash),
        netWorth: worth,
        vehicle: p.vehicle,
        capacity: CAPACITY[p.vehicle],
        carrying: this.carried(p),
        inventory: Object.entries(p.inventory).filter(([, n]) => (n ?? 0) > 0).map(([item, units]) => ({ item, units })),
        at: p.at,
        upgrades: (['pickup', 'van'] as const).map((v) => ({ vehicle: v, cost: UPGRADE_COST[v], capacity: CAPACITY[v] })),
      },
    };
  }
}
