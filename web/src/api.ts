/** Typed client for the Nims game server. Nothing here knows about wallets — the player never sees the chain. */
export type Item = 'tomatoes' | 'pepper' | 'flour' | 'cotton' | 'lace' | 'thread' | 'iron' | 'copper wire';
export type MarketId = 'produce' | 'fabric' | 'scrap';

export interface Offer {
  item: Item;
  base: number;
  /** What the stall pays you. */
  buyPrice: number;
  /** What the stall charges you. */
  sellPrice: number;
  willBuy: boolean;
  willSell: boolean;
  stock: number;
  /** How much the stall likes to hold. */
  target: number;
  /** The merchant's own plain-English reasoning. */
  why: string;
  /** This stall pays the most in town for this item. */
  bestPay: boolean;
  /** This stall charges the least in town for this item. */
  bestCharge: boolean;
}

export interface Stall {
  id: string;
  name: string;
  market: MarketId;
  personality: 'cautious' | 'greedy' | 'loyal';
  state: 'open' | 'struggling' | 'closed';
  till: number;
  offers: Offer[];
  fund?: { pool: number; goal: number; contributors: { name: string; put: number }[] };
  /** Fund contributors who reopened this shop. Shown on its sign. */
  sign: string[];
  /** Present on a stall run by a player. */
  owner?: { name: string; mine: boolean };
  /** Present on merchants you can invest in. */
  shares?: { price: number; left: number; yours: number };
}

export type GoalKind = 'fortune' | 'reach' | 'stake' | 'district';
export type Focus = { kind: 'source' | 'stall'; id: string } | null;

export interface Deal {
  item: Item;
  from: { kind: 'source' | 'stall'; id: string; label: string; cost: number };
  to: { stall: string; id: string; price: number; market: MarketId };
  /** Profit per unit, in coins. */
  profit: number;
}

export interface StallItem {
  item: Item;
  base: number;
  min: number;
  max: number;
  buy: number;
  sell: number;
  stock: number;
  carrying: number;
}

export interface Business {
  shares: { id: string; name: string; market: MarketId; shares: number; price: number; value: number; state: 'open' | 'struggling' | 'closed' }[];
  stall: { id: string; name: string; market: MarketId; till: number; items: StallItem[] } | null;
  stallOffer: { cost: number; markets: { id: MarketId; name: string; free: boolean }[] } | null;
  notes: { hour: number; text: string }[];
}

export interface Away {
  hours: number;
  notes: string[];
  town: string[];
}

export interface GameState {
  away: Away | null;
  business: Business;
  goal: { kind: GoalKind; title: string; blurb: string; progress: number; label: string; done: boolean } | null;
  goals: { kind: GoalKind; title: string; blurb: string }[];
  coach: { text: string; focus: Focus };
  deals: Deal[];
  hour: number;
  day: number;
  shocks: { kind: string; hoursLeft: number }[];
  faresPerUnit: number;
  gatherSpeed: number;
  markets: { id: MarketId; name: string; items: Item[] }[];
  stalls: Stall[];
  board: { market: MarketId; item: Item; base: number; price: number | null }[];
  sources: { item: Item; label: string; units: number; cost: number }[];
  events: { hour: number; type: string; text: string }[];
  you: {
    cash: number;
    /** Fare you couldn't pay up front. It comes out of your next sale. */
    fareOwed: number;
    netWorth: number;
    vehicle: 'wheelbarrow' | 'pickup' | 'van';
    capacity: number;
    carrying: number;
    inventory: { item: Item; units: number }[];
    at?: MarketId;
    upgrades: { vehicle: 'pickup' | 'van'; cost: number; capacity: number }[];
  };
}

export interface ActionResponse {
  ok: boolean;
  message: string;
  state?: GameState;
}

async function json<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const r = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...init });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as T };
}

const post = (path: string, body: unknown) => json<ActionResponse>(path, { method: 'POST', body: JSON.stringify(body) });

export interface ChainProof { account: string; explorer: string; behind: number }

export const api = {
  /** Where this player's goods and coins live on the testnet, or null when the live chain is off. */
  async chain(): Promise<ChainProof | null> {
    const r = await json<ChainProof | null>('/game/chain').catch(() => null);
    return r && r.status === 200 ? r.body : null;
  },

  /** null means "not logged in". */
  async state(): Promise<GameState | null> {
    const r = await json<GameState>('/game/state');
    if (r.status >= 500) throw new Error('offline'); // e.g. the dev proxy can't reach the game server
    return r.status === 401 ? null : r.body;
  },
  async requestLogin(email: string) {
    const r = await json<{ ok?: boolean; error?: string; devLink?: string }>('/auth/request', { method: 'POST', body: JSON.stringify({ email }) });
    return r.body;
  },
  /** Open a sign-in link (dev only: the server returns it directly). */
  async openLink(link: string) {
    const u = new URL(link);
    const r = await json<{ ok?: boolean; error?: string }>(u.pathname + u.search);
    return r.body;
  },
  gather: (item: Item) => post('/game/gather', { item }).then((r) => r.body),
  sell: (merchant: string, item: Item, units: number, haggle: boolean) => post('/game/sell', { merchant, item, units, haggle }).then((r) => r.body),
  buy: (merchant: string, item: Item, units: number, haggle: boolean) => post('/game/buy', { merchant, item, units, haggle }).then((r) => r.body),
  goal: (kind: GoalKind) => post('/game/goal', { kind }).then((r) => r.body),
  buyShares: (merchant: string, shares: number) => post('/game/shares/buy', { merchant, shares }).then((r) => r.body),
  sellShares: (merchant: string, shares: number) => post('/game/shares/sell', { merchant, shares }).then((r) => r.body),
  contribute: (merchant: string, amount: number) => post('/game/fund', { merchant, amount }).then((r) => r.body),
  openStall: (market: MarketId) => post('/game/stall/open', { market }).then((r) => r.body),
  stallStock: (item: Item, units: number) => post('/game/stall/stock', { item, units }).then((r) => r.body),
  stallTake: (item: Item, units: number) => post('/game/stall/take', { item, units }).then((r) => r.body),
  stallPrice: (item: Item, buy: number, sell: number) => post('/game/stall/price', { item, buy, sell }).then((r) => r.body),
  stallDeposit: (amount: number) => post('/game/stall/deposit', { amount }).then((r) => r.body),
  stallWithdraw: (amount: number) => post('/game/stall/withdraw', { amount }).then((r) => r.body),
  ack: () => post('/game/ack', {}).then((r) => r.body),
  upgrade: (to: string) => post('/game/upgrade', { to }).then((r) => r.body),
};

export const coins = (n: number) => `${Math.round(n).toLocaleString('en-US')} coins`;

// ---- fast-forward (the open dashboard; no login) ----------------------------------------------

export interface FastForwardParams {
  days: number;
  seed: number;
  gatherers: number;
  arbitrageur: boolean;
  investor: boolean;
  flooder: boolean;
}

export interface FastForward {
  params: FastForwardParams;
  hours: number;
  items: { item: Item; market: MarketId; base: number }[];
  /** Average price per item per hour, in coins. */
  prices: Record<string, number[]>;
  merchants: { id: string; name: string; market: MarketId }[];
  cash: Record<string, number[]>;
  shocks: { kind: 'rain' | 'fuel queue' | 'festive season'; start: number; end: number }[];
  closures: { hour: number; merchant: string; text: string }[];
  revivals: { hour: number; merchant: string; text: string }[];
  dividends: { hour: number; merchant: string; amount: number }[];
  players: { id: string; label: string; strategy: string; start: number; worth: number[] }[];
  highlights: string[];
}

export async function fastForward(params: Partial<FastForwardParams>): Promise<FastForward> {
  const r = await fetch('/sim/fastforward', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? 'Could not run the simulation.');
  return body as FastForward;
}
