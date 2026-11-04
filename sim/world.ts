import { MerchantState, Personality } from '../merchants/pricing';
import { makeRng, Rng } from './rng';

export type Item = 'tomatoes' | 'pepper' | 'garri' | 'ankara' | 'lace' | 'thread' | 'iron' | 'copper wire';
export type MarketId = 'produce' | 'fabric' | 'scrap';

export const BASE_PRICE: Record<Item, number> = {
  tomatoes: 120,
  pepper: 200,
  garri: 150,
  ankara: 800,
  lace: 1500,
  thread: 100,
  iron: 300,
  'copper wire': 600,
};

export const MARKETS: Record<MarketId, { name: string; items: Item[] }> = {
  produce: { name: 'Produce Market', items: ['tomatoes', 'pepper', 'garri'] },
  fabric: { name: 'Fabric Market', items: ['ankara', 'lace', 'thread'] },
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
  /** Ajo pool that revives the shop once it is closed. */
  ajo: { pool: number; goal: number; contributors: Record<string, number> };
  /** Shareholders: player id -> shares. At most MAX_PUBLIC_SHARES in total, so a merchant is never taken over. */
  shares: Record<string, number>;
  /** Player ids of the ajo contributors who last reopened this shop. Their names go on the sign. */
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

export type Vehicle = 'wheelbarrow' | 'keke' | 'van';
export const CAPACITY: Record<Vehicle, number> = { wheelbarrow: 20, keke: 60, van: 150 };

export interface Player {
  id: string;
  strategy: 'gatherer' | 'arbitrageur' | 'investor' | 'flooder' | 'human';
  cash: number;
  vehicle: Vehicle;
  inventory: Partial<Record<Item, number>>;
  /** Market the player last traded in (moving between markets costs a fare). */
  at?: MarketId;
  /** Per-merchant reputation 0..1; grows with trades. */
  reputation: Record<string, number>;
  /** What happened to the player's business: dividends, ajo, stall sales. Shown as "while you were away". */
  notes: { hour: number; text: string }[];
}

export interface Source {
  item: Item;
  label: string;
  units: number;
  max: number;
  respawnPerHour: number;
  /** ₦ per unit; 0 for free gathering. */
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
  /** dividend events: total ₦ paid out. */
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
    ajo: { pool: 0, goal: 12_000, contributors: {} },
    shares: {},
    sign: [],
  };
}

/** 8 merchants across 3 markets (DESIGN.md §1). */
export function createMerchants(): Merchant[] {
  return [
    merchant('bisi', 'Mama Bisi', 'produce', 'greedy', { tomatoes: 80, pepper: 60 }),
    merchant('kemi', 'Iya Kemi', 'produce', 'cautious', { garri: 100, tomatoes: 60 }),
    merchant('tunde', 'Baba Tunde', 'produce', 'loyal', { pepper: 60, garri: 80 }),
    merchant('nkechi', 'Madam Nkechi', 'fabric', 'loyal', { ankara: 40, thread: 120 }),
    merchant('sade', 'Alhaja Sade', 'fabric', 'cautious', { lace: 25, ankara: 40 }),
    merchant('chidi', 'Chidi Iron Works', 'scrap', 'greedy', { iron: 50, 'copper wire': 30 }),
    merchant('wale', 'Baba Wale', 'scrap', 'cautious', { iron: 60 }),
    merchant('emeka', 'Emeka Hardware', 'scrap', 'loyal', { 'copper wire': 40, iron: 40 }),
  ];
}

export function createSources(): Source[] {
  return [
    { item: 'tomatoes', label: 'Farm (tomatoes)', units: 200, max: 200, respawnPerHour: 12, cost: 0 },
    { item: 'pepper', label: 'Farm (pepper)', units: 150, max: 150, respawnPerHour: 8, cost: 0 },
    { item: 'iron', label: 'Scrap spot (iron)', units: 150, max: 150, respawnPerHour: 10, cost: 0 },
    { item: 'copper wire', label: 'Scrap spot (copper wire)', units: 80, max: 80, respawnPerHour: 5, cost: 0 },
    // Wholesaler: fixed price anchor for cloth.
    { item: 'ankara', label: 'Wholesaler (ankara)', units: 1_000_000, max: 1_000_000, respawnPerHour: 0, cost: 680 },
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
