import type { Avatar } from '../art/avatar';
/** Typed client for the Nims game server. Nothing here knows about wallets — the player never sees the chain. */
export type Item = 'tomatoes' | 'pepper' | 'flour' | 'cotton' | 'lace' | 'thread' | 'iron' | 'copper wire' | 'fish' | 'salt' | 'spice' | 'timber' | 'gems' | 'wine';
export type MarketId = 'produce' | 'fabric' | 'scrap' | 'harbour' | 'woods' | 'mine' | 'vale';
/** A place reached by a journey: the town, Saltmere Harbour, and the three unexplored frontiers. */
export type RealmId = 'town' | 'saltmere' | 'timberfell' | 'gemhollow' | 'sunvale';

/** A shop you run: your town stall or a frontier business. */
export interface Shop { id: string; name: string; market: MarketId; till: number; items: StallItem[] }
/** A plot of land in a frontier. */
export interface Plot {
  id: string; realm: RealmId; n: number; price: number; forSale: number | null;
  owner: { name: string; mine: boolean } | null;
  business: { id: string; name: string } | null;
}

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
  /** The merchant's own plan for the day (a town merchant only): what it chose and why, in its own words. */
  plan?: { day: number; reason: string; stock: Partial<Record<string, 'more' | 'less'>>; margin: 'wider' | 'narrower' | 'same' };
  /** Present on merchants you can invest in. */
  /** price: one share at today's worth. worth: what the merchant is worth, which sets the exact cost of a purchase (see shareCost). */
  shares?: { price: number; left: number; yours: number; worth?: number };
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
  stall: Shop | null;
  /** Your businesses in the frontiers, each on land you own. */
  businesses?: (Shop & { realm: RealmId })[];
  stallOffer: { cost: number; markets: { id: MarketId; name: string; free: boolean }[] } | null;
  notes: { hour: number; text: string }[];
}

export interface Away {
  hours: number;
  notes: string[];
  town: string[];
}

export interface DeliveryOrder { id: number; item: Item; units: number; merchantId: string; minPrice: number; expiresHour: number; status: 'open' | 'filled' | 'expired' | 'cancelled'; done: number; earned: number }

/** One market's council: its rules, your say, and any open vote. */
export interface CouncilView {
  market: MarketId;
  name: string;
  rent: string;
  payout: string;
  effects: string[];
  options: { rent: string[]; payout: string[] };
  /** Your weight in a vote here: one seat for trading in the market, and one per share you hold in its merchants. */
  seats: number;
  /** You have traded here, which gives you a seat even with no shares. */
  regular?: boolean;
  canPropose: boolean;
  proposal: {
    lever: 'rent' | 'payout';
    to: string;
    effect: string;
    by: string;
    yes: number;
    no: number;
    merchants: { for: number; against: number };
    closesIn: number;
    yourVote: 'yes' | 'no' | null;
  } | null;
}

/** Another signed-in person currently playing, for the map and the click-for-stats panel. */
export interface OnlinePlayer {
  id: string;
  name: string;
  avatar: Avatar | null;
  market: MarketId;
  realm: RealmId;
  worth: number;
  vehicle: 'wheelbarrow' | 'pickup' | 'van';
  shares: number;
  stall: boolean;
}

export interface GameState {
  /** Absent on older servers and in recorded fixtures. */
  council?: CouncilView[];
  orders?: DeliveryOrder[];
  away: Away | null;
  business: Business;
  goal: { kind: GoalKind; title: string; blurb: string; progress: number; label: string; done: boolean } | null;
  goals: { kind: GoalKind; title: string; blurb: string }[];
  coach: { text: string; focus: Focus };
  deals: Deal[];
  hour: number;
  day: number;
  shocks: { kind: string; hoursLeft: number }[];
  /** What it would cost to walk your current load to each market (0 where you already are). */
  fares: Record<MarketId, number>;
  gatherSpeed: number;
  markets: { id: MarketId; name: string; items: Item[] }[];
  stalls: Stall[];
  /** Present when the server supports the way back from broke. `needed` is true when you are nearly out of coins with nothing to sell. */
  help?: { needed: boolean; scavengeIn: number; canWork: boolean; workIn: number };
  /** The odd jobs board, and the job you hold, if any. */
  jobs?: { board: JobView[]; active: JobView | null };
  board: { market: MarketId; item: Item; base: number; price: number | null }[];
  sources: { item: Item; label: string; units: number; cost: number }[];
  events: { hour: number; type: string; text: string }[];
  /** Where you are, whether you're on the road, and the roads to other realms. */
  realm?: {
    here: RealmId;
    name: string;
    journey: { to: RealmId; name: string; hoursLeft: number; hours?: number; travel?: 'car' | 'plane' } | null;
    roads: { realm: RealmId; name: string; blurb: string; hours: number; passage: number; freight: number; travel?: 'car' | 'plane'; frontier?: boolean; discovered?: boolean }[];
  };
  /** Land in the place you're in (a frontier has plots), the land you own anywhere, and who first reached this place. */
  land?: { buildCost: number; here: Plot[]; mine: Plot[]; discovered: { by: string; hour: number } | null };
  /** Quests you're on and today's daily reward (server/game/quests.ts). */
  quests?: {
    active: { id: string; chain: 'starter' | 'realm'; title: string; story: string; reward: number; complete: boolean; objectives: { label: string; done: number; target: number }[] }[];
    starter: { done: number; total: number };
    daily: { day: number; reward: number; ready: boolean };
  };
  /** Your invite link's code, and how many friends joined and were rewarded. */
  invite?: { code: string; joined: number; rewarded: number; max: number; reward: number };
  /** Other signed-in people currently playing: where they are, and a few public stats for clicking their avatar. */
  online?: OnlinePlayer[];
  you: {
    /** The name other traders and the town board see. */
    name: string;
    /** The look you chose, or null before you create one. */
    avatar: Avatar | null;
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
  /** Set when the player won a haggle: ask for the merchant's reaction. */
  haggled?: { merchant: string; name: string; personality: 'cautious' | 'greedy' | 'loyal' };
}

async function json<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const r = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...init });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as T };
}

const post = (path: string, body: unknown) => json<ActionResponse>(path, { method: 'POST', body: JSON.stringify(body) });

export interface JobView {
  id: number;
  item: Item;
  units: number;
  reward: number;
  from: { id: string; name: string };
  to: { id: string; name: string };
  hoursLeft: number;
}

export interface VoiceReply { text: string | null; audio: string | null }

export interface ChainProof { account: string; explorer: string; behind: number }

/** Public numbers about the town (GET /stats). Activity is in real time; `day` is the town's own day count. */
export interface Leader { name: string; avatar?: Avatar | null; worth: number; shares: number; stall: boolean; vehicle: 'wheelbarrow' | 'pickup' | 'van' }
export interface TownStats {
  day: number;
  players: number;
  last24h: { players: number; trades: number; votes: number };
  total: { trades: number; votes: number; decisions: number; passed: number };
  shops: { open: number; total: number; playerStalls: number };
  /** When counting began (ISO). */
  since?: string;
  /** The settlement to NEAR testnet, when it is on. */
  chain?: { contract?: string; lastSettledAt?: string | null } | null;
  /** The ten richest people who have played, by the first name others see in the game. */
  leaders: Leader[];
  /** The same table for the people who played in the last 24 real hours. Absent from a server that predates it. */
  leaders24h?: Leader[];
  /** The latest town-council decisions, newest first. */
  decisions: { day: number; market: string; lever: string; to: string; passed: boolean; yes: number; no: number; daoId: number | null }[];
}

export const api = {
  /** Where this player's goods and coins live on the testnet, or null when the live chain is off. */
  async chain(): Promise<ChainProof | null> {
    const r = await json<ChainProof | null>('/game/chain').catch(() => null);
    return r && r.status === 200 ? r.body : null;
  },

  /**
   * A merchant's price reasoning in their own words (`text`, written by NEAR AI Cloud) and a link to natural speech for it
   * (`audio`). Either may be null: null text keeps the plain line, null audio means the browser's own voice is used. Never throws.
   */
  async voice(merchant: string, item: Item): Promise<VoiceReply> {
    try {
      const r = await json<Partial<VoiceReply>>(`/game/voice?merchant=${encodeURIComponent(merchant)}&item=${encodeURIComponent(item)}`);
      return r.status === 200 ? { text: r.body.text ?? null, audio: r.body.audio ?? null } : { text: null, audio: null };
    } catch {
      return { text: null, audio: null };
    }
  },

  /** The merchant's reaction to the player's last won haggle (`text`, plus `audio` natural speech), or nulls. Never throws. */
  async haggle(): Promise<VoiceReply> {
    try {
      const r = await json<Partial<VoiceReply>>('/game/haggle');
      return r.status === 200 ? { text: r.body.text ?? null, audio: r.body.audio ?? null } : { text: null, audio: null };
    } catch {
      return { text: null, audio: null };
    }
  },

  /** Newspaper headlines for the town's latest events (written by NEAR AI Cloud), or null for none. Never throws. */
  async gazette(): Promise<string[] | null> {
    try {
      const r = await json<{ headlines?: string[] | null }>('/game/gazette');
      return r.status === 200 ? r.body.headlines ?? null : null;
    } catch {
      return null;
    }
  },

  /** null means "not logged in". */
  async state(): Promise<GameState | null> {
    // a request that hangs counts as a failed check, so the next poll can try again
    const r = await json<GameState>('/game/state', typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(8000) } : undefined);
    if (r.status >= 500) throw new Error('offline'); // e.g. the dev proxy can't reach the game server
    return r.status === 401 ? null : r.body;
  },
  /** Play as a guest: the server sets a session cookie for a new guest trader. */
  async guest(): Promise<{ ok?: boolean; error?: string }> {
    try {
      return (await json<{ ok?: boolean; error?: string }>('/auth/guest', { method: 'POST', body: '{}' })).body;
    } catch {
      return { error: 'Lost touch with the game server. Try again in a moment.' };
    }
  },
  /** Which sign-in options the server offers. Never throws: if it can't be reached, only the guest button is shown. */
  async providers(): Promise<{ google: boolean }> {
    try {
      const r = await json<{ google?: boolean }>('/auth/providers');
      return { google: r.status === 200 && r.body?.google === true };
    } catch {
      return { google: false };
    }
  },
  /** How busy the town is: public counts, no names. Never throws: null when the server can't say. */
  async stats(): Promise<TownStats | null> {
    try {
      const r = await json<TownStats>('/stats');
      return r.status === 200 && r.body && typeof r.body.day === 'number' ? r.body : null;
    } catch {
      return null;
    }
  },
  gather: (item: Item) => post('/game/gather', { item }).then((r) => r.body),
  sell: (merchant: string, item: Item, units: number, haggle: boolean) => post('/game/sell', { merchant, item, units, haggle }).then((r) => r.body),
  order: (merchant: string, item: Item, units: number, minPrice: number) => post('/game/order', { merchant, item, units, minPrice }).then((r) => r.body),
  cancelOrder: (id: number) => post('/game/order/cancel', { id }).then((r) => r.body),
  buy: (merchant: string, item: Item, units: number, haggle: boolean) => post('/game/buy', { merchant, item, units, haggle }).then((r) => r.body),
  goal: (kind: GoalKind) => post('/game/goal', { kind }).then((r) => r.body),
  buyShares: (merchant: string, shares: number) => post('/game/shares/buy', { merchant, shares }).then((r) => r.body),
  sellShares: (merchant: string, shares: number) => post('/game/shares/sell', { merchant, shares }).then((r) => r.body),
  councilPropose: (market: MarketId, lever: string, to: string) => post('/game/council/propose', { market, lever, to }).then((r) => r.body),
  councilVote: (market: MarketId, yes: boolean) => post('/game/council/vote', { market, yes }).then((r) => r.body),
  contribute: (merchant: string, amount: number) => post('/game/fund', { merchant, amount }).then((r) => r.body),
  openStall: (market: MarketId) => post('/game/stall/open', { market }).then((r) => r.body),
  stallStock: (item: Item, units: number, shop?: string) => post('/game/stall/stock', { item, units, shop }).then((r) => r.body),
  stallTake: (item: Item, units: number, shop?: string) => post('/game/stall/take', { item, units, shop }).then((r) => r.body),
  stallPrice: (item: Item, buy: number, sell: number, shop?: string) => post('/game/stall/price', { item, buy, sell, shop }).then((r) => r.body),
  stallDeposit: (amount: number, shop?: string) => post('/game/stall/deposit', { amount, shop }).then((r) => r.body),
  stallWithdraw: (amount: number, shop?: string) => post('/game/stall/withdraw', { amount, shop }).then((r) => r.body),
  buyLand: (plot: string) => post('/game/land/buy', { plot }).then((r) => r.body),
  listLand: (plot: string, price: number) => post('/game/land/list', { plot, price }).then((r) => r.body),
  build: (plot: string, name?: string) => post('/game/land/build', { plot, name }).then((r) => r.body),
  ack: () => post('/game/ack', {}).then((r) => r.body),
  scavenge: () => post('/game/scavenge', {}).then((r) => r.body),
  takeJob: (id: number) => post('/game/job/take', { id }).then((r) => r.body),
  deliverJob: () => post('/game/job/deliver', {}).then((r) => r.body),
  dropJob: () => post('/game/job/drop', {}).then((r) => r.body),
  upgrade: (to: string) => post('/game/upgrade', { to }).then((r) => r.body),
  setName: (name: string) => post('/game/name', { name }).then((r) => r.body),
  setAvatar: (avatar: Avatar) => post('/game/avatar', { avatar }).then((r) => r.body),
  claimQuest: (id: string) => post('/game/quest/claim', { id }).then((r) => r.body),
  claimDaily: () => post('/game/daily', {}).then((r) => r.body),
  redeemInvite: (code: string) => post('/game/invite', { code }).then((r) => r.body),
  travel: (realm: RealmId) => post('/game/travel', { realm }).then((r) => r.body),
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
