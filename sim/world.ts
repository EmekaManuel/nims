import { MerchantState, Personality } from '../merchants/pricing';
import type { MerchantPlan } from './plan';
import { Councils, newCouncils } from './council';
import { makeRng, Rng } from './rng';

export type Item = 'tomatoes' | 'pepper' | 'flour' | 'cotton' | 'lace' | 'thread' | 'iron' | 'copper wire' | 'fish' | 'salt' | 'spice' | 'timber' | 'gems' | 'wine';
export type MarketId = 'produce' | 'fabric' | 'scrap' | 'harbour' | 'woods' | 'mine' | 'vale';
/** A place you reach by a journey: the town, the harbour beyond the hills, and three unexplored frontiers. */
export type RealmId = 'town' | 'saltmere' | 'timberfell' | 'gemhollow' | 'sunvale';

export const BASE_PRICE: Record<Item, number> = {
  tomatoes: 120,
  pepper: 200,
  flour: 150,
  cotton: 800,
  lace: 1500,
  thread: 100,
  iron: 300,
  'copper wire': 600,
  fish: 90,
  salt: 160,
  spice: 1200,
  timber: 140,
  gems: 900,
  wine: 450,
};

export const MARKETS: Record<MarketId, { name: string; items: Item[]; realm: RealmId }> = {
  produce: { name: 'Produce Market', items: ['tomatoes', 'pepper', 'flour', 'spice', 'salt', 'wine'], realm: 'town' },
  fabric: { name: 'Fabric Market', items: ['cotton', 'lace', 'thread'], realm: 'town' },
  scrap: { name: 'Scrap & Hardware', items: ['iron', 'copper wire', 'timber', 'gems'], realm: 'town' },
  harbour: { name: 'Saltmere Harbour', items: ['fish', 'salt', 'spice', 'thread', 'iron', 'timber'], realm: 'saltmere' },
  // The frontiers: no shops until players build them. Their customers want what the place lacks, and the place has one good of its own.
  woods: { name: 'Timberfell', items: ['timber', 'flour', 'iron', 'salt'], realm: 'timberfell' },
  mine: { name: 'Gem Hollow', items: ['gems', 'flour', 'iron', 'copper wire'], realm: 'gemhollow' },
  vale: { name: 'Sunvale', items: ['wine', 'cotton', 'lace', 'spice'], realm: 'sunvale' },
};

/**
 * Realms: the town, and places further off that take a journey. Getting between realms takes `journeyHours` game hours
 * (you can't trade on the road) and costs `passage` coins plus freight on what you carry.
 */
export const REALMS: Record<RealmId, { name: string; journeyHours: number; passage: number; blurb: string; travel: 'car' | 'plane'; frontier: boolean }> = {
  town: { name: 'Nims', journeyHours: 6, passage: 120, blurb: 'The market town: three markets and the farms and scrap spots around them.', travel: 'car', frontier: false },
  saltmere: { name: 'Saltmere Harbour', journeyHours: 6, passage: 120, blurb: 'A fishing harbour beyond the hills. Ships bring spice; ships need thread and iron.', travel: 'car', frontier: false },
  timberfell: { name: 'Timberfell Woods', journeyHours: 8, passage: 160, blurb: 'Unclaimed forest with a lumber camp. No shops yet: buy land and build the first.', travel: 'car', frontier: true },
  gemhollow: { name: 'Gem Hollow', journeyHours: 10, passage: 260, blurb: 'A mountain valley with a seam of gems. Miners need food and tools, and nobody sells them yet.', travel: 'plane', frontier: true },
  sunvale: { name: 'Sunvale', journeyHours: 10, passage: 240, blurb: 'Sunny hills and a vineyard. The people here want cloth and spice, and nobody sells them yet.', travel: 'plane', frontier: true },
};

/** Which realm a market is in. */
export const realmOf = (m: MarketId): RealmId => MARKETS[m].realm;
/** Markets in a realm, in order. */
export const marketsIn = (r: RealmId) => (Object.keys(MARKETS) as MarketId[]).filter((m) => MARKETS[m].realm === r);

/**
 * Distance makes goods dear: a realm pays this many times the usual price for goods that come from far away. The
 * harbour needs thread and iron for its ships; the town has no spice or salt of its own.
 */
export const IMPORT_PRICE: Record<RealmId, Partial<Record<Item, number>>> = {
  town: { spice: 1.6, salt: 1.3, timber: 1.5, gems: 1.6, wine: 1.5 },
  saltmere: { thread: 1.5, iron: 1.5, timber: 1.6 },
  timberfell: { flour: 1.5, iron: 1.4, salt: 1.5 },
  gemhollow: { flour: 1.7, iron: 1.5, 'copper wire': 1.4 },
  sunvale: { cotton: 1.4, lace: 1.3, spice: 1.4 },
};
/** The usual price of a good in a market: the base price, times what distance adds there. */
export const localBase = (market: MarketId, item: Item) => Math.round(BASE_PRICE[item] * (IMPORT_PRICE[realmOf(market)][item] ?? 1));

export const PERISHABLE: Item[] = ['tomatoes', 'pepper', 'fish'];

export interface MemoryEntry {
  hour: number;
  item: Item;
  /** 'bought' = a player bought from the merchant; 'sold' = a player sold to the merchant. */
  kind: 'bought' | 'sold';
  units: number;
  /** Who did it, when it was a real player (not another merchant trading on its own account). */
  by?: string;
}

export interface Merchant {
  id: string;
  name: string;
  market: MarketId;
  personality: Personality;
  cash: number;
  cashFloor: number;
  stock: Partial<Record<Item, number>>;
  target: Partial<Record<Item, number>>;
  state: MerchantState;
  memory: MemoryEntry[];
  /** Community fund that revives the shop once it is closed. */
  fund: { pool: number; goal: number; contributors: Record<string, number> };
  /** Shareholders: player id -> shares. At most MAX_PUBLIC_SHARES in total, so a merchant is never taken over. */
  shares: Record<string, number>;
  /** Player ids of the fund contributors who last reopened this shop. Their names go on the sign. */
  sign: string[];
  /** Worth at the start of the current in-game day, to measure the day's profit for dividends. */
  dayStartWorth?: number;
  /** Coins shareholders have put into this merchant's till and not taken back. The evening upkeep never touches it: it is their money, not surplus. */
  paidIn?: number;
  /** Who held how many shares when the day began. Dividends and the rent levy go only on shares held since then, so nobody can buy at 10pm, collect, and sell. */
  dayStartShares?: Record<string, number>;
  /** Set only on a player-owned stall. Prices are the owner's own choice, not pricing.ts's formula. */
  owner?: string;
  ownerName?: string;
  prices?: Partial<Record<Item, { buy: number; sell: number }>>;
  /** Today's plan, chosen by the merchant (see plan.ts). Absent: the merchant keeps its usual stock and margin. */
  plan?: MerchantPlan;
}

/** Each merchant is split into this many shares; players can hold up to MAX_PUBLIC_SHARES of them in total. */
export const SHARES_TOTAL = 100;
export const MAX_PUBLIC_SHARES = 49;

export type Vehicle = 'wheelbarrow' | 'pickup' | 'van';
export const CAPACITY: Record<Vehicle, number> = { wheelbarrow: 20, pickup: 60, van: 150 };

export interface Player {
  id: string;
  strategy: 'gatherer' | 'arbitrageur' | 'investor' | 'flooder' | 'human';
  cash: number;
  vehicle: Vehicle;
  inventory: Partial<Record<Item, number>>;
  /** Market the player last traded in (moving between markets costs a fare). */
  at?: MarketId;
  /** On the road to another realm: where to, and the game hour they arrive. Nothing can be traded until then. */
  journey?: { to: MarketId; arrive: number };
  /** When a simulated gatherer last collected (so it knows how long it has been holding goods). */
  lastGatherHour?: number;
  /** Fare you couldn't pay up front. It comes out of your next sale, so you can never be stuck holding goods you can't take to market. */
  fareOwed?: number;
  /** Per-merchant reputation 0..1; grows with trades. */
  reputation: Record<string, number>;
  /** What happened to the player's business: dividends, fund, stall sales. Shown as "while you were away". */
  notes: { hour: number; text: string }[];
}

export interface Source {
  item: Item;
  /** The realm the source is in (the town when absent). */
  realm?: RealmId;
  label: string;
  units: number;
  max: number;
  respawnPerHour: number;
  /** Coins per unit; 0 for free gathering. */
  cost: number;
}

export type ShockKind = 'rain' | 'fuel queue' | 'festive season';
export interface Shock {
  kind: ShockKind;
  startHour: number;
  endHour: number;
}

export interface WorldEvent {
  hour: number;
  type: 'shock' | 'state' | 'revived' | 'dividend' | 'council' | 'guild' | 'plan' | 'discovery' | 'land';
  text: string;
  /** Merchant this is about (state, revived, dividend). */
  merchant?: string;
  /** state events: what the merchant became. dividend events: n/a. */
  to?: MerchantState;
  /** dividend events: total coins paid out. */
  amount?: number;
  /** shock events: which shock and for how long. */
  shock?: ShockKind;
  length?: number;
  /** council events: how a vote ended, and whether it has been recorded on the DAO yet (see server/chain/dao.ts). */
  decision?: { market: MarketId; lever: string; to: string; passed: boolean; yes: number; no: number; daoId?: number; recorded?: boolean };
}

export interface Snapshot {
  hour: number;
  /** Average mid price per item per market. */
  prices: Record<string, number>;
  cash: Record<string, number>;
}

/** What can be held and moved: any good, or the coins that pay for them. One contract holds every token. */
export type Token = Item | 'coins';
export const COINS = 'coins' as const;

/**
 * Everything that moved goods or coins, in order. server/chain/settle.ts turns this into on-chain batches.
 * It is self-contained: it starts with what every account was given when the world was made, so replaying it
 * from the beginning reproduces every balance exactly (a test checks that).
 *
 * 'town' is everyone outside the game's accounts: everyday customers, wholesalers, landlords, carriers.
 * Coins the town pays in are 'mint'; coins paid to the town are a transfer to 'town'.
 */
export interface LedgerEntry {
  hour: number;
  kind: 'mint' | 'transfer';
  /** Sim id of the sender (transfers only). */
  from?: string;
  to: string;
  item: Token;
  /** Units of a good, or an amount of coins. */
  units: number;
}

export interface World {
  hour: number;
  rng: Rng;
  merchants: Merchant[];
  players: Player[];
  sources: Source[];
  shocks: Shock[];
  events: WorldEvent[];
  history: Snapshot[];
  /** Land in the frontiers: who owns each plot, whether it is for sale, and the business built on it. */
  plots: Plot[];
  /** Who first reached each frontier, and when. */
  discovered: Partial<Record<RealmId, { by: string; hour: number }>>;
  ledger: LedgerEntry[];
  /** Per-market rules the shareholders vote on (see council.ts). */
  council: Councils;
}

function merchant(
  id: string,
  name: string,
  market: MarketId,
  personality: Personality,
  target: Partial<Record<Item, number>>,
): Merchant {
  return {
    id,
    name,
    market,
    personality,
    cash: 20_000,
    cashFloor: 1_500,
    stock: { ...target },
    target,
    state: 'open',
    memory: [],
    fund: { pool: 0, goal: 12_000, contributors: {} },
    shares: {},
    sign: [],
  };
}

/** 8 merchants across 3 markets (DESIGN.md §1). */
export function createMerchants(): Merchant[] {
  return [
    merchant('mira', "Mira's Greens", 'produce', 'greedy', { tomatoes: 80, pepper: 60 }),
    merchant('tomas', 'Tomas Produce', 'produce', 'cautious', { flour: 100, tomatoes: 60 }),
    // June also buys spice and salt from the harbour: the town has none of its own, so she pays more for them (IMPORT_PRICE).
    merchant('june', "June's Pantry", 'produce', 'loyal', { pepper: 60, flour: 80, spice: 15, salt: 30, wine: 20 }),
    merchant('lena', "Lena's Textiles", 'fabric', 'loyal', { cotton: 40, thread: 120 }),
    merchant('omar', "Omar's Fabrics", 'fabric', 'cautious', { lace: 25, cotton: 40 }),
    merchant('anil', 'Anil Metals', 'scrap', 'greedy', { iron: 50, 'copper wire': 30, gems: 10 }),
    merchant('ruth', "Ruth's Salvage", 'scrap', 'cautious', { iron: 60 }),
    merchant('diego', 'Diego Hardware', 'scrap', 'loyal', { 'copper wire': 40, iron: 40, timber: 40 }),
    ...harbourMerchants(),
  ];
}

/**
 * Farms and scrap spots sell at a wholesale price: this share of the usual price. Not free: if goods
 * cost nothing, a player's first trip is worth thousands and the market stops mattering. At 50% the
 * money is in price gaps, shortages and shocks, and starting capital is what limits you.
 */
export const WHOLESALE_RATE = 0.5;
/** Goods you carry count towards net worth at this share of their usual price (a stall pays less than "usual"). */
export const CARRY_VALUE = 0.8;
/** What a vehicle is worth to its owner: what it cost. Buying one turns coins into a vehicle, so it never sets you back on your net worth. */
export const VEHICLE_VALUE: Record<Vehicle, number> = { wheelbarrow: 0, pickup: 5_000, van: 18_000 };
const wholesale = (item: Item) => Math.round(BASE_PRICE[item] * WHOLESALE_RATE);

export function createSources(): Source[] {
  return [
    { item: 'tomatoes', label: 'Farm (tomatoes)', units: 160, max: 160, respawnPerHour: 8, cost: wholesale('tomatoes') },
    { item: 'pepper', label: 'Farm (pepper)', units: 120, max: 120, respawnPerHour: 6, cost: wholesale('pepper') },
    { item: 'iron', label: 'Scrap spot (iron)', units: 120, max: 120, respawnPerHour: 6, cost: wholesale('iron') },
    { item: 'copper wire', label: 'Scrap spot (copper wire)', units: 60, max: 60, respawnPerHour: 3, cost: wholesale('copper wire') },
    // Wholesaler: fixed price anchor for cloth.
    { item: 'cotton', label: 'Wholesaler (cotton)', units: 1_000_000, max: 1_000_000, respawnPerHour: 0, cost: 680 },
    ...harbourSources(),
    ...frontierSources(),
  ];
}

/** Saltmere Harbour's merchants: fish and salt, a chandlery that needs thread and iron for the ships, and the spice house. */
export function harbourMerchants(): Merchant[] {
  return [
    merchant('pike', 'Pike & Daughters', 'harbour', 'greedy', { fish: 80, salt: 40 }),
    merchant('marlow', 'Marlow Chandlery', 'harbour', 'cautious', { thread: 100, iron: 50, timber: 40 }),
    merchant('zara', "Zara's Spice House", 'harbour', 'loyal', { spice: 25, salt: 40 }),
  ];
}

/** Saltmere Harbour's sources: the fishing pier and the salt pans. */
export function harbourSources(): Source[] {
  return [
    { item: 'fish', realm: 'saltmere', label: 'Fishing pier (fish)', units: 160, max: 160, respawnPerHour: 8, cost: wholesale('fish') },
    { item: 'salt', realm: 'saltmere', label: 'Salt pans (salt)', units: 120, max: 120, respawnPerHour: 6, cost: wholesale('salt') },
  ];
}

/** Record that `p` was given its starting cash. Call whenever a player joins a world. */
export function addPlayer(w: World, p: Player) {
  w.players.push(p);
  if (p.cash > 0) w.ledger.push({ hour: w.hour, kind: 'mint', to: p.id, item: COINS, units: p.cash });
}

export function createWorld(seed = 1, players: Player[] = []): World {
  const w: World = {
    hour: 0,
    rng: makeRng(seed),
    merchants: createMerchants(),
    players,
    sources: createSources(),
    shocks: [],
    events: [],
    history: [],
    ledger: [],
    council: newCouncils(),
    plots: createPlots(),
    discovered: {},
  };
  // Genesis: what every account starts with, so the ledger alone explains every balance.
  for (const m of w.merchants) {
    w.ledger.push({ hour: 0, kind: 'mint', to: m.id, item: COINS, units: m.cash });
    for (const [item, units] of Object.entries(m.stock)) if (units) w.ledger.push({ hour: 0, kind: 'mint', to: m.id, item: item as Item, units });
  }
  for (const p of w.players) if (p.cash > 0) w.ledger.push({ hour: 0, kind: 'mint', to: p.id, item: COINS, units: p.cash });
  return w;
}

/** The frontiers' own goods: a lumber camp, a gem seam and a vineyard. */
export function frontierSources(): Source[] {
  return [
    { item: 'timber', realm: 'timberfell', label: 'Lumber camp (timber)', units: 140, max: 140, respawnPerHour: 7, cost: wholesale('timber') },
    { item: 'gems', realm: 'gemhollow', label: 'Gem seam (gems)', units: 40, max: 40, respawnPerHour: 2, cost: wholesale('gems') },
    { item: 'wine', realm: 'sunvale', label: 'Vineyard (wine)', units: 80, max: 80, respawnPerHour: 4, cost: wholesale('wine') },
  ];
}

/**
 * A plot of land in a frontier. It is bought from the town, can be resold to another player, and a business can be built on
 * it. `n` is its place in the layout (0 is nearest the source, so the dearest).
 */
export interface Plot {
  id: string;
  realm: RealmId;
  market: MarketId;
  n: number;
  /** What the town asks for it while nobody owns it. */
  price: number;
  owner?: string;
  ownerName?: string;
  /** An owner's asking price, when they have put it up for sale. */
  forSale?: number;
  /** The merchant id of the business built on it. */
  business?: string;
}

/** Plots per frontier, and what the town asks for them: the two nearest the source dearest, the edge cheapest. */
export const PLOTS_PER_FRONTIER = 8;
export const PLOT_PRICES = [3_500, 3_500, 2_600, 2_600, 2_600, 2_600, 1_800, 1_800];
/** What it costs to build a business on land you own. */
export const BUILD_COST = 4_000;
const FRONTIER_MARKET: Partial<Record<RealmId, MarketId>> = { timberfell: 'woods', gemhollow: 'mine', sunvale: 'vale' };
export const frontierMarket = (r: RealmId) => FRONTIER_MARKET[r];

export function createPlots(): Plot[] {
  return (Object.keys(FRONTIER_MARKET) as RealmId[]).flatMap((realm) =>
    Array.from({ length: PLOTS_PER_FRONTIER }, (_, n) => ({ id: `${realm}-${n + 1}`, realm, market: FRONTIER_MARKET[realm]!, n, price: PLOT_PRICES[n] })),
  );
}
