/** Typed client for the Oja game server. Nothing here knows about wallets — the player never sees the chain. */
export type Item = 'tomatoes' | 'pepper' | 'garri' | 'ankara' | 'lace' | 'thread' | 'iron' | 'copper wire';
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
  /** The merchant's own plain-English reasoning. */
  why: string;
}

export interface Stall {
  id: string;
  name: string;
  market: MarketId;
  personality: 'cautious' | 'greedy' | 'loyal';
  state: 'open' | 'struggling' | 'closed';
  till: number;
  offers: Offer[];
  ajo?: { pool: number; goal: number };
}

export interface GameState {
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
    netWorth: number;
    vehicle: 'wheelbarrow' | 'keke' | 'van';
    capacity: number;
    carrying: number;
    inventory: { item: Item; units: number }[];
    at?: MarketId;
    upgrades: { vehicle: 'keke' | 'van'; cost: number; capacity: number }[];
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

export const api = {
  /** null means "not logged in". */
  async state(): Promise<GameState | null> {
    const r = await json<GameState>('/game/state');
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
  upgrade: (to: string) => post('/game/upgrade', { to }).then((r) => r.body),
};

export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
