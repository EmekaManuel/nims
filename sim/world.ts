import { MerchantState, Personality } from '../merchants/pricing';
import { makeRng, Rng } from './rng';

export type Item = 'tomatoes' | 'pepper' | 'flour' | 'cotton' | 'lace' | 'thread' | 'iron' | 'copper wire';
export type MarketId = 'produce' | 'fabric' | 'scrap';

export const BASE_PRICE: Record<Item, number> = {
  tomatoes: 120,
  pepper: 200,
  flour: 150,
  cotton: 800,
  lace: 1500,
  thread: 100,
  iron: 300,
  'copper wire': 600,
};

export const MARKETS: Record<MarketId, { name: string; items: Item[] }> = {
  produce: { name: 'Produce Market', items: ['tomatoes', 'pepper', 'flour'] },
  fabric: { name: 'Fabric Market', items: ['cotton', 'lace', 'thread'] },
  scrap: { name: 'Scrap & Hardware', items: ['iron', 'copper wire'] },
};

export const PERISHABLE: Item[] = ['tomatoes', 'pepper'];

export interface MemoryEntry {
  hour: number;
  item: Item;
  /** 'bought' = a player bought from the merchant; 'sold' = a player sold to the merchant. */
  kind: 'bought' | 'sold';
  units: number;
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
  /** Set only on a player-owned stall. Prices are the owner's own choice, not pricing.ts's formula. */
  owner?: string;
  ownerName?: string;
  prices?: Partial<Record<Item, { buy: number; sell: number }>>;
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
  type: 'shock' | 'state' | 'revived' | 'dividend';
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
}

export interface Snapshot {
  hour: number;
  /** Average mid price per item per market. */
  prices: Record<string, number>;
  cash: Record<string, number>;
}

/** Everything that moved items, in order. server/settle.ts turns this into on-chain batches. */
export interface LedgerEntry {
  hour: number;
  kind: 'mint' | 'transfer';
  /** Sim id of the sender (transfers only). 'town' is the everyday-customer sink. */
  from?: string;
  to: string;
  item: Item;
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
  ledger: LedgerEntry[];
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
    merchant('june', "June's Pantry", 'produce', 'loyal', { pepper: 60, flour: 80 }),
    merchant('lena', "Lena's Textiles", 'fabric', 'loyal', { cotton: 40, thread: 120 }),
    merchant('omar', "Omar's Fabrics", 'fabric', 'cautious', { lace: 25, cotton: 40 }),
    merchant('anil', 'Anil Metals', 'scrap', 'greedy', { iron: 50, 'copper wire': 30 }),
    merchant('ruth', "Ruth's Salvage", 'scrap', 'cautious', { iron: 60 }),
    merchant('diego', 'Diego Hardware', 'scrap', 'loyal', { 'copper wire': 40, iron: 40 }),
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
const wholesale = (item: Item) => Math.round(BASE_PRICE[item] * WHOLESALE_RATE);

export function createSources(): Source[] {
  return [
    { item: 'tomatoes', label: 'Farm (tomatoes)', units: 160, max: 160, respawnPerHour: 8, cost: wholesale('tomatoes') },
    { item: 'pepper', label: 'Farm (pepper)', units: 120, max: 120, respawnPerHour: 6, cost: wholesale('pepper') },
    { item: 'iron', label: 'Scrap spot (iron)', units: 120, max: 120, respawnPerHour: 6, cost: wholesale('iron') },
    { item: 'copper wire', label: 'Scrap spot (copper wire)', units: 60, max: 60, respawnPerHour: 3, cost: wholesale('copper wire') },
    // Wholesaler: fixed price anchor for cloth.
    { item: 'cotton', label: 'Wholesaler (cotton)', units: 1_000_000, max: 1_000_000, respawnPerHour: 0, cost: 680 },
  ];
}

export function createWorld(seed = 1, players: Player[] = []): World {
  return {
    hour: 0,
    rng: makeRng(seed),
    merchants: createMerchants(),
    players,
    sources: createSources(),
    shocks: [],
    events: [],
    history: [],
    ledger: [],
  };
}
