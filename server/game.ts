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
import { act, newPlayer } from '../sim/players';
import { activeShock, buyFromMerchant, carryCost, merchantItems, quoteFor, sellToMerchant, tick, gatherRate } from '../sim/engine';
import { gather } from '../sim/players';
import { BASE_PRICE, CAPACITY, createWorld, Item, MARKETS, MarketId, Player, Vehicle, World } from '../sim/world';

export const UPGRADE_COST: Record<Exclude<Vehicle, 'wheelbarrow'>, number> = { keke: 5_000, van: 18_000 };
const SOURCE_LABEL: Record<string, string> = {};
const START_CASH = 3_000;

export type GoalKind = 'fortune' | 'reach' | 'district';

/** The session goals a player can pick (DESIGN.md §2). Shown in the UI with a progress bar. */
export const GOALS: Record<GoalKind, { title: string; blurb: string }> = {
  fortune: { title: 'Build a fortune', blurb: `Grow your net worth to ₦${(25_000).toLocaleString('en-NG')}. Buy low, carry it, sell high.` },
  reach: { title: 'Trade everywhere', blurb: 'Sell in all three markets and buy a van. Learn where each good is dear.' },
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

  /** Advance one in-game hour (server/main.ts calls this on a timer). */
  tickOnce() {
    tick(this.w, act);
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
    if (pr.kind === 'fortune') return { progress: Math.min(1, worth / FORTUNE_TARGET), label: `₦${worth.toLocaleString('en-NG')} of ₦${FORTUNE_TARGET.toLocaleString('en-NG')}` };
    if (pr.kind === 'reach') {
      const van = p.vehicle === 'van';
      return { progress: (pr.marketsSold.size + (van ? 1 : 0)) / 4, label: `Sold in ${pr.marketsSold.size} of 3 markets · ${van ? 'you have a van' : 'no van yet'}` };
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

  private netWorth(p: Player) {
    return Math.round(p.cash + Object.entries(p.inventory).reduce((a, [i, n]) => a + (n ?? 0) * BASE_PRICE[i as Item], 0));
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
    return p;
  }

  private carried = (p: Player) => Object.values(p.inventory).reduce((a, b) => a + (b ?? 0), 0);

  /** Moving to a stall in another market costs a fare per unit carried (fuel queues double it). */
  private travelTo(p: Player, market: MarketId): ActionResult | null {
    if (p.at === market) return null;
    const fare = this.carried(p) * carryCost(this.w);
    if (p.cash < fare) return fail(`You can't afford the fare to ${MARKETS[market].name} (₦${fare}).`);
    p.cash -= fare;
    p.at = market;
    return null;
  }

  gather(email: string, item: Item): ActionResult {
    const p = this.playerFor(email);
    const src = this.w.sources.find((s) => s.item === item);
    if (!src) return fail('Nothing to collect there.');
    if (this.carried(p) >= CAPACITY[p.vehicle]) return fail(`Your ${p.vehicle} is full. Sell something first.`);
    if (src.cost > 0 && p.cash < src.cost) return fail(`You need ₦${src.cost} per unit here.`);
    const n = gather(this.w, p, item);
    if (n === 0) return fail(src.units <= 0 ? 'Someone has already cleared this spot. It refills over time.' : 'You could not carry any more.');
    const rain = activeShock(this.w, 'rain') ? ' Rain slowed you down.' : '';
    return ok(`You collected ${n} ${item}.${rain}`);
  }

  sell(email: string, merchantId: string, item: Item, units: number, haggle = false): ActionResult {
    const p = this.playerFor(email);
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m || !(item in BASE_PRICE) || !merchantItems(m).includes(item)) return fail('That stall does not trade that.');
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
    return ok(`Sold ${sold} ${item} to ${m.name}.${haggle ? ` You haggled a ${Math.round((mult - 1) * 100)}% better price.` : ''}`);
  }

  buy(email: string, merchantId: string, item: Item, units: number, haggle = false): ActionResult {
    const p = this.playerFor(email);
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m || !(item in BASE_PRICE) || !merchantItems(m).includes(item)) return fail('That stall does not trade that.');
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
    return ok(`Bought ${bought} ${item} from ${m.name}.`);
  }

  /** One haggle per merchant per in-game hour. A regular gets a bigger swing (2%–8%). Returns 1 if not allowed. */
  private haggleSwing(p: Player, merchantId: string): number {
    const k = `${p.id}|${merchantId}`;
    if (this.haggled.get(k) === this.w.hour) return 1;
    this.haggled.set(k, this.w.hour);
    return 1 + Math.min(0.08, 0.02 + 0.06 * (p.reputation[merchantId] ?? 0));
  }

  upgrade(email: string, to: string): ActionResult {
    const p = this.playerFor(email);
    if (to !== 'keke' && to !== 'van') return fail('Pick keke or van.');
    const order: Vehicle[] = ['wheelbarrow', 'keke', 'van'];
    if (order.indexOf(to) <= order.indexOf(p.vehicle)) return fail(`You already have a ${p.vehicle}.`);
    if (order.indexOf(to) > order.indexOf(p.vehicle) + 1) return fail('Buy a keke first.');
    if (p.cash < UPGRADE_COST[to]) return fail(`A ${to} costs ₦${UPGRADE_COST[to]}.`);
    p.cash -= UPGRADE_COST[to];
    p.vehicle = to;
    this.checkDone(email);
    return ok(`You bought a ${to}. It carries ${CAPACITY[to]}.`);
  }

  /** Where the money is right now: collect or buy cheap, sell dear. Best three, by profit per unit. */
  private deals(p: Player, stalls: ReturnType<Game['stallViews']>) {
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
  private coach(email: string, p: Player, stalls: ReturnType<Game['stallViews']>, deals: ReturnType<Game['deals']>) {
    const pr = this.prog(email);
    type Focus = { kind: 'source' | 'stall'; id: string } | null;
    const say = (text: string, focus: Focus = null) => ({ text, focus });
    if (!pr.kind) return say('Pick a goal to play towards. You can change it any time.');
    if (pr.done) return say('Goal reached! Well traded. Pick a new goal to keep going.');
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
        return say(`Sell your ${units} ${item} to ${top.s.name}: they pay ₦${top.o.buyPrice} each, the best in town.${here}`, { kind: 'stall', id: top.s.id });
      }
      return say(`Nobody is buying ${item} right now. Try another market, or wait for prices to recover.`);
    }
    if (deals.length) {
      const d = deals[0];
      return say(
        d.from.kind === 'source'
          ? `Collect ${d.item} at the ${d.from.label.replace(/ \(.*\)$/, '').toLowerCase()}${d.from.cost ? ` (₦${d.from.cost} each)` : ' (free)'}, then sell it to ${d.to.stall} for ₦${d.to.price} each.`
          : `Buy ${d.item} from ${d.from.label} at ₦${d.from.cost}, then sell it to ${d.to.stall} for ₦${d.to.price}.`,
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
          why: q.tooltip,
        };
      }),
      ajo: m.state === 'closed' ? { pool: m.ajo.pool, goal: m.ajo.goal } : undefined,
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
    return {
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
        upgrades: (['keke', 'van'] as const).map((v) => ({ vehicle: v, cost: UPGRADE_COST[v], capacity: CAPACITY[v] })),
      },
    };
  }
}
