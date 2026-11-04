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
    return ok(`You bought a ${to}. It carries ${CAPACITY[to]}.`);
  }

  /** Everything the UI needs, including each merchant's own reasoning for every price. */
  state(email: string) {
    const w = this.w;
    const p = this.playerFor(email);
    const stalls = w.merchants.map((m) => ({
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

    const worth = p.cash + Object.entries(p.inventory).reduce((a, [i, n]) => a + (n ?? 0) * BASE_PRICE[i as Item], 0);
    return {
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
        netWorth: Math.round(worth),
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
