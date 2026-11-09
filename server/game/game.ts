/**
 * Live game state. The sim world IS the game: it ticks in real time, NPC traders keep the town
 * moving, and human players act on it through these methods.
 *
 * Gameplay never waits on the chain: every action applies to this in-memory state
 * immediately. The world's item ledger is what gets batch-settled afterwards.
 *
 * Nothing here knows about wallets, keys or gas, and nothing returned to a player mentions them.
 */
import { samePlan, targetOf } from '../../sim/plan';
import type { ChosenPlan, PlanFacts } from '../agents/planner';
import { Activity, type ActivityJSON } from './activity';
import { parseAvatar, type Avatar } from './avatar';
import { claim, claimDaily, newQuestState, questView, record, type QuestEvent, type QuestState } from './quests';
import { createHash } from 'node:crypto';
import { makeRng } from '../../sim/rng';
import { act, newPlayer } from '../../sim/players';
import {
  activeShock, addNote, buyFromMerchant, buyShares, contributeToFund, gatherRate, merchantItems, openOwnerStall, ownerStallOf,
  loadFare, playerWorth, merchantWorth, publicSharesLeft, quoteFor, recent, sellShares, sellToMerchant, sharePrice, STALL_COST, STALL_MARKETS, tick, transferCoins, unitFare,
} from '../../sim/engine';
import { clampPlayerPrice, MAX_MULT, MIN_MULT, type Personality } from '../../merchants/pricing';
import type { VoiceFacts } from '../voice/voice';
import type { GazetteFacts } from '../voice/gazette';
import type { HaggleFacts } from '../voice/haggle';
import { planBoard, totalDue, type Job } from './jobs';
import { gather } from '../../sim/players';
import { EFFECT, isRegular, LEVELS, MIN_VOTING_HOURS, newCouncils, propose, seatsOf, tally, vote, type Lever } from '../../sim/council';
import { addPlayer, BASE_PRICE, CAPACITY, COINS, createWorld, createPlots, frontierSources, harbourMerchants, harbourSources, BUILD_COST, type Plot, marketsIn, REALMS, realmOf, type RealmId, VEHICLE_VALUE, Item, MARKETS, MarketId, Merchant, Player, Vehicle, World } from '../../sim/world';

export const UPGRADE_COST: Record<Exclude<Vehicle, 'wheelbarrow'>, number> = { pickup: VEHICLE_VALUE.pickup, van: VEHICLE_VALUE.van };
const SOURCE_LABEL: Record<string, string> = {};
const START_CASH = 4_000;
/** Away for this many in-game hours (about 1.5 minutes of real time) and you get a summary on return. */
const AWAY_HOURS = 24;
/** The screen polls every 2 real seconds; a player not seen within this long is not shown as online. */
const ONLINE_WINDOW_MS = 60_000;
const HISTORY_KEEP = 24 * 7;
const LEDGER_KEEP = 20_000;
/**
 * Version 3: the economy rebalance (wholesale sources, new demand, new goal). A save from before keeps free
 * sources and old numbers inside it, so it is set aside instead of loaded half-old, half-new.
 * (Version 2 was the Nims renaming of merchants, goods and vehicles.)
 */
export const SNAPSHOT_VERSION = 3;

const FORTUNE_TARGET = 10_000;
/** Invite a friend: what each of you gets when they make their first sale, and how many friends one player can be rewarded for. */
export const INVITE_REWARD = 300;
export const INVITE_MAX = 10;

export type GoalKind = 'fortune' | 'reach' | 'stake' | 'district';

/** The session goals a player can pick (DESIGN.md §2). Shown in the UI with a progress bar. */
export const GOALS: Record<GoalKind, { title: string; blurb: string }> = {
  fortune: { title: 'Build a fortune', blurb: `Grow your net worth to ${FORTUNE_TARGET.toLocaleString('en-US')} coins. Buy low, carry it, sell high.` },
  reach: { title: 'Trade everywhere', blurb: 'Sell in all three markets and buy a van. Learn where each good is dear.' },
  stake: { title: 'A stake in every market', blurb: 'Own shares in a merchant in each of the three markets. Your money works while you sleep.' },
  district: { title: 'Keep the district alive', blurb: 'Keep every stall open for 3 days in a row. Flood a stall with goods and it can go broke.' },
};
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

/**
 * The name other players see: in the town, on stall signs, in the news and on the public town board. Never the address.
 * When the email's username splits into words (ada.obi@, ada_l@, ada-obi@) the first word is very likely a first name,
 * so it is used ("Ada"). A username in one word (adaobi@, adaobi92@) may well hold a surname too, so only its initial is
 * shown ("A."). Digits are dropped and never count as a split.
 */
/** Words a chosen name may not contain (a short list; names are short and public). */
// Kept to words that don't occur inside real names (no 'dick', which would block Dickson; no 'fag', Fagbemi).
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigger', 'nigga', 'bitch', 'whore', 'slut', 'nazi', 'hitler', 'porn', 'pussy', 'admin', 'moderator'];

/** Why a chosen name can't be used, or null if it can. */
export function nameProblem(name: string): string | null {
  if (name.length < 2 || name.length > 16) return 'A name is 2 to 16 characters.';
  if (!/^\p{L}[\p{L} '\-]*$/u.test(name)) return 'Use letters, spaces, hyphens or apostrophes, starting with a letter.';
  const flat = name.toLowerCase().replace(/[^\p{L}]/gu, '');
  if (BLOCKED.some((w) => flat.includes(w))) return 'Pick a different name.';
  return null;
}

export function displayName(email: string): string {
  // a guest (server/http/auth.ts guestIdentity): "Guest" and a short code, until they choose a name
  const guest = /^guest-([0-9a-f]+)@guest\.nims$/.exec(email);
  if (guest) return `Guest ${guest[1].slice(0, 4).toUpperCase()}`;
  const words = email.split('@')[0].replace(/[0-9]+/g, '').split(/[._\-+]+/).filter((x) => x.length > 0);
  const first = words[0];
  if (!first) return 'Trader';
  const name = first.charAt(0).toUpperCase() + first.slice(1, 12).toLowerCase();
  return words.length > 1 ? name : `${name.charAt(0)}.`;
}

/**
 * A delivery order, the game's version of an intent: the player says what they want to end up with
 * ("20 iron sold at Hardware Hal's for at least 280 coins each"), not how to do it. The town's carriers
 * (the game, on every tick) work out the how: they wait until the price is right, take the load there,
 * sell it through the normal sale, and take the fare out of it. If the price never comes, the order lapses.
 */
export interface Order {
  id: number;
  item: Item;
  units: number;
  merchantId: string;
  /** Lowest price per unit the player will accept. */
  minPrice: number;
  placedHour: number;
  expiresHour: number;
  status: 'open' | 'filled' | 'expired' | 'cancelled';
  /** Units delivered so far. */
  done: number;
  /** Coins received so far, before the fare. */
  earned: number;
}
export const ORDER_HOURS = 24;
export const MAX_OPEN_ORDERS = 5;

export interface ActionResult {
  ok: boolean;
  /** Plain-English line to show the player. */
  message: string;
  /** Set when the player won a haggle, so the page can ask for the merchant's reaction. */
  haggled?: { merchant: string; name: string; personality: Personality };
}

/** How long between two scrap searches (in-game hours). */
const SCAVENGE_GAP_HOURS = 3;
/** Odd jobs are for players short of coins: you can take one only below this many times the cheapest wholesale price... */
const LOW_CASH_FACTOR = 10;
/** ...and at most one every this many in-game hours, so a job is a way back up, never a way to farm. */
const JOB_GAP_HOURS = 8;

const fail = (message: string): ActionResult => ({ ok: false, message });
const ok = (message: string): ActionResult => ({ ok: true, message });

export class Game {
  readonly w: World;
  private humans = new Map<string, Player>();
  /** player id -> merchant id -> hour of the last haggle (one haggle per merchant per hour). */
  private haggled = new Map<string, number>();
  /** email -> the last haggle they won, so the merchant's reaction can be written from facts the server holds (not from anything the page sends). Not saved. */
  private lastHaggle = new Map<string, HaggleFacts>();
  /** player id -> real-world ms they were last seen (state() polls). Not saved: everyone just looks offline for a few seconds after a restart. */
  private lastActive = new Map<string, number>();
  private progress = new Map<string, Progress>();
  /** email -> delivery orders (open ones, and recent finished ones for display). */
  private orders = new Map<string, Order[]>();
  private nextOrderId = 1;
  /** The odd jobs board (unclaimed jobs), and the job each player has taken: its goods are reserved for it. */
  private board: Job[] = [];
  private nextJobId = 1;
  private activeJobs = new Map<string, Job>();
  /** email -> hour of the last scrap search, so help can't be farmed. */
  private scavenged = new Map<string, number>();
  /** email -> hour of the last delivered job. */
  private jobDone = new Map<string, number>();
  /** player id -> quests and daily rewards (quests.ts). */
  private quests = new Map<string, QuestState>();
  /** player id -> the look they chose (avatar.ts). Absent until they create one. */
  private avatars = new Map<string, Avatar>();
  /** invited player id -> who invited them, and whether the reward has been paid (it pays on their first sale). */
  private invites = new Map<string, { by: string; paid: boolean }>();
  /** The real clock, for daily rewards. Tests replace it. */
  clock: () => number = Date.now;
  /** Players who chose the name others see (setName). The email-based name never replaces a chosen one. */
  private chosen = new Set<string>();
  /** What real people have been doing, in real time, for /stats. Counts and opaque ids only. */
  activity = new Activity();
  /** player id -> the name shown on signs and stalls. */
  private names = new Map<string, string>([['npc-investor', 'The Community Fund']]);

  constructor(seed = 1) {
    // A few NPC traders so the town is alive before anyone logs in.
    this.w = createWorld(seed, [
      newPlayer('npc-gatherer-1', 'gatherer'),
      newPlayer('npc-gatherer-2', 'gatherer'),
      newPlayer('npc-gatherer-3', 'gatherer'),
      newPlayer('npc-gatherer-4', 'gatherer'),
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
        ledgerBase: this.ledgerBase,
        council: w.council,
        plots: w.plots,
        discovered: w.discovered,
        rngState: w.rng.state(),
      },
      humans: [...this.humans].map(([email, p]) => [email, p.id] as [string, string]),
      progress: [...this.progress].map(([email, pr]) => [email, { ...pr, marketsSold: [...pr.marketsSold] }] as [string, unknown]),
      names: [...this.names],
      haggled: [...this.haggled],
      orders: [...this.orders],
      nextOrderId: this.nextOrderId,
      jobs: this.board,
      activeJobs: [...this.activeJobs],
      nextJobId: this.nextJobId,
      scavenged: [...this.scavenged],
      jobDone: [...this.jobDone],
      activity: this.activity.toJSON(),
      chosenNames: [...this.chosen],
      quests: [...this.quests],
      invites: [...this.invites],
      avatars: [...this.avatars],
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
    // Saves from before the council existed have none: the markets start on the usual rules.
    // Saves from before the council existed have none: the markets start on the usual rules. Markets added since get theirs.
    w.council = { ...newCouncils(), ...((snap.world as { council?: Partial<World['council']> }).council ?? {}) };
    g.ledgerBase = (snap.world as { ledgerBase?: number }).ledgerBase ?? 0;
    w.plots = (snap.world as { plots?: World['plots'] }).plots ?? createPlots();
    w.discovered = (snap.world as { discovered?: World['discovered'] }).discovered ?? {};
    w.rng = makeRng(0, snap.world.rngState);
    g.humans = new Map(snap.humans.map(([email, id]) => [email, w.players.find((p) => p.id === id)!]).filter(([, p]) => p) as [string, Player][]);
    g.progress = new Map((snap.progress as [string, Progress & { marketsSold: MarketId[] }][]).map(([email, pr]) => [email, { ...pr, marketsSold: new Set(pr.marketsSold) }]));
    g.names = new Map(snap.names);
    g.chosen = new Set((snap as { chosenNames?: string[] }).chosenNames ?? []);
    g.quests = new Map((snap as { quests?: [string, QuestState][] }).quests ?? []);
    g.avatars = new Map((snap as { avatars?: [string, Avatar][] }).avatars ?? []);
    g.invites = new Map((snap as { invites?: [string, { by: string; paid: boolean }][] }).invites ?? []);
    g.renameFromEmails();
    g.haggled = new Map(snap.haggled);
    const o = snap as { orders?: [string, Order[]][]; nextOrderId?: number };
    g.orders = new Map(o.orders ?? []);
    g.nextOrderId = o.nextOrderId ?? 1;
    const j = snap as { jobs?: Job[]; activeJobs?: [string, Job][]; nextJobId?: number; scavenged?: [string, number][]; jobDone?: [string, number][] };
    g.board = j.jobs ?? [];
    g.activeJobs = new Map(j.activeJobs ?? []);
    g.nextJobId = j.nextJobId ?? 1;
    g.scavenged = new Map(j.scavenged ?? []);
    g.jobDone = new Map(j.jobDone ?? []);
    g.addMissingPlaces();
    g.activity = Activity.from((snap as { activity?: ActivityJSON }).activity);
    return g;
  }

  /**
   * The ledger is numbered over the whole life of the game. `ledgerBase` is the number of ledger[0];
   * everything before it has been dropped. A chain settler reads from a number it remembers, and tells
   * us how far it got, so nothing is dropped before it is settled.
   */
  ledgerBase = 0;
  /** How far the chain has been settled, or null when nothing is settling (then only the latest entries are kept). */
  private settledTo: number | null = null;

  ledgerEnd(): number {
    return this.ledgerBase + this.w.ledger.length;
  }

  /** Entries from absolute number `from`, at most `max` of them. */
  ledgerFrom(from: number, max = Infinity) {
    if (from < this.ledgerBase) throw new Error(`Ledger entries before ${this.ledgerBase} are gone (asked for ${from})`);
    return this.w.ledger.slice(from - this.ledgerBase, from - this.ledgerBase + max);
  }

  /** A settler says: everything before `cursor` is on the chain. */
  markSettled(cursor: number) {
    this.settledTo = cursor;
    this.trimLedger();
  }

  private trimLedger() {
    const drop = this.settledTo === null ? Math.max(0, this.w.ledger.length - LEDGER_KEEP) : Math.max(0, Math.min(this.settledTo - this.ledgerBase, this.w.ledger.length));
    if (drop > 0) {
      this.w.ledger.splice(0, drop);
      this.ledgerBase += drop;
    }
  }

  /** Advance one in-game hour (server/main.ts calls this on a timer). */
  tickOnce() {
    const seenEvents = this.w.events.length;
    tick(this.w, act);
    for (const e of this.w.events.slice(seenEvents)) if (e.type === 'council' && e.decision) this.activity.decision(e.decision.passed);
    this.arrivals();
    // A live game runs for days: keep only the recent past so memory and save files stay small.
    if (this.w.history.length > HISTORY_KEEP) this.w.history.splice(0, this.w.history.length - HISTORY_KEEP);
    this.trimLedger();
    this.fillOrders();
    this.refreshJobs();
    if (this.w.events.length > 200) this.w.events.splice(0, this.w.events.length - 200);
    const anyClosed = this.w.merchants.some((m) => m.state === 'closed');
    for (const [email, pr] of this.progress) {
      if (pr.kind === 'district' && !pr.done) pr.streak = anyClosed ? 0 : pr.streak + 1;
      this.checkDone(email);
    }
  }

  // ---- delivery orders (intents) ---------------------------------------------------------------

  /** Say where you want a load to end up and the least you'll take. The carriers do the rest. */
  placeOrder(email: string, merchantId: string, item: Item, units: number, minPrice: number): ActionResult {
    const p = this.playerFor(email);
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m || !(item in BASE_PRICE) || !merchantItems(m).includes(item)) return fail('That stall does not trade that.');
    const away = this.onRoad(p) ?? this.otherRealm(p, m.market);
    if (away) return away;
    if (m.owner === p.id) return fail('That is your own stall.');
    if (!Number.isInteger(units) || units < 1) return fail('Pick a whole number of units.');
    if (!Number.isFinite(minPrice) || minPrice < 1) return fail('Say the lowest price you will accept per unit.');
    const mine = this.orders.get(email) ?? [];
    if (mine.filter((o) => o.status === 'open').length >= MAX_OPEN_ORDERS) return fail(`You can have ${MAX_OPEN_ORDERS} open orders at a time. Cancel one first.`);
    const o: Order = { id: this.nextOrderId++, item, units, merchantId, minPrice: Math.round(minPrice), placedHour: this.w.hour, expiresHour: this.w.hour + ORDER_HOURS, status: 'open', done: 0, earned: 0 };
    this.orders.set(email, [...mine.filter((x) => x.status === 'open' || this.w.hour - x.placedHour < 72), o]);
    this.track(p, { kind: 'order' });
    return ok(`Order placed: sell ${units} ${item} at ${m.name} for at least ${o.minPrice} coins each. The carriers will take it as soon as the price is right (up to ${ORDER_HOURS} hours).`);
  }

  cancelOrder(email: string, id: number): ActionResult {
    const o = (this.orders.get(email) ?? []).find((x) => x.id === id && x.status === 'open');
    if (!o) return fail('That order is not open.');
    o.status = 'cancelled';
    return ok('Order cancelled. Your goods stay with you.');
  }

  /** Every hour: for each open order, deliver if the stall will pay the limit price now, or let it lapse. */
  private fillOrders() {
    for (const [email, list] of this.orders) {
      const p = this.humans.get(email);
      if (!p) continue;
      for (const o of list) {
        if (o.status !== 'open') continue;
        const m = this.w.merchants.find((x) => x.id === o.merchantId);
        const left = o.units - o.done;
        const lapse = (why: string) => { o.status = 'expired'; addNote(this.w, p, `Your order for ${o.units} ${o.item} lapsed: ${why}`); };
        if (this.w.hour >= o.expiresHour) { lapse(`the price never reached ${o.minPrice} coins.`); continue; }
        if (!m || m.state === 'closed') continue; // wait: a closed stall may be revived
        const have = this.available(email, o.item);
        if (have < 1) continue; // wait for the player to collect some goods
        const q = quoteFor(this.w, m, o.item, p);
        if (!q.willBuy || q.buyPrice < o.minPrice) continue;
        const before = p.cash;
        const r = this.sell(email, o.merchantId, o.item, Math.min(left, have));
        if (!r.ok) continue;
        const sold = have - (p.inventory[o.item] ?? 0);
        o.done += sold;
        o.earned += Math.round(p.cash - before);
        if (o.done >= o.units) {
          o.status = 'filled';
          addNote(this.w, p, `Order filled: ${o.done} ${o.item} delivered to ${m.name}. ${r.message}`);
        }
      }
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

  /** Cash, what you carry, your vehicle, your shares at today's price, and your stall's till and stock. */
  private netWorth(p: Player) {
    let worth = playerWorth(this.w, p);
    for (const m of this.w.merchants) {
      if (m.owner === p.id) worth += m.cash + Object.entries(m.stock).reduce((a, [i, n]) => a + (n ?? 0) * BASE_PRICE[i as Item], 0);
    }
    return Math.round(worth - (p.fareOwed ?? 0));
  }

  private marketsWithStake(p: Player): Set<MarketId> {
    return new Set(this.w.merchants.filter((m) => !m.owner && (m.shares[p.id] ?? 0) > 0).map((m) => m.market));
  }

  /**
   * Bring every saved name up to the current rule (displayName), wherever other players can see it: the name itself, a
   * player stall's name and owner, an open council proposal, and the public news. Saves made before the rule changed
   * could show a whole one-word username, which may hold a surname.
   */
  private renameFromEmails() {
    for (const [email, p] of this.humans) if (!this.chosen.has(p.id)) this.rename(p, displayName(email));
  }

  /** Give a player a new name wherever others can see it: the name, their stall's name and owner, an open proposal, the news. */
  private rename(p: Player, now: string) {
    const old = this.names.get(p.id);
    this.names.set(p.id, now);
    if (!old || old === now) return;
    for (const m of this.w.merchants) {
      if (m.owner !== p.id) continue;
      m.ownerName = now;
      if (m.name === `${old}'s stall`) m.name = `${now}'s stall`;
    }
    for (const c of Object.values(this.w.council)) if (c.proposal?.by === p.id) c.proposal.byName = now;
    // Only whole-word matches, so renaming "Ada" never touches "Adaeze".
    const re = new RegExp(`(?<![\\p{L}])${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu');
    for (const e of this.w.events) e.text = e.text.replace(re, now);
  }

  // ---- quests and daily rewards (quests.ts) --------------------------------------------------

  private questsOf(p: Player): QuestState {
    let s = this.quests.get(p.id);
    if (!s) this.quests.set(p.id, (s = newQuestState()));
    return s;
  }

  /** Count what a player just did towards their quests, and tell them when one is ready to claim. */
  private track(p: Player, e: QuestEvent) {
    if (!this.humanIds().has(p.id)) return;
    if (e.kind === 'sell') this.payInvite(p);
    for (const q of record(this.questsOf(p), e)) addNote(this.w, p, `Quest complete: ${q.title}. Claim ${q.reward} coins in Quests.`);
  }

  private humanIds() { return new Set([...this.humans.values()].map((p) => p.id)); }

  // ---- avatar --------------------------------------------------------------------------------

  /** Choose your look. Every part must be one of the allowed picks. */
  setAvatar(email: string, raw: unknown): ActionResult {
    const p = this.playerFor(email);
    const a = parseAvatar(raw);
    if (!a) return fail('Pick each part of your look from the choices.');
    const first = !this.avatars.has(p.id);
    this.avatars.set(p.id, a);
    return ok(first ? 'Welcome to Nims. Your trader is ready.' : 'Your new look is saved.');
  }

  // ---- invite a friend ----------------------------------------------------------------------

  /** A player's invite code: from their opaque id, never their email. */
  inviteCode(p: Player) { return p.id.replace(/^h-/, '').slice(0, 8).toUpperCase(); }

  /**
   * A new player says who invited them. Only before their first sale, only once, never themselves, and each inviter is
   * rewarded for at most INVITE_MAX friends. The reward is paid later, on the friend's first sale (payInvite).
   */
  redeemInvite(email: string, code: string): ActionResult {
    const p = this.playerFor(email);
    const want = code.trim().toUpperCase();
    const inviter = [...this.humans.values()].find((x) => this.inviteCode(x) === want);
    if (!inviter) return fail('That invite link is not valid.');
    if (inviter.id === p.id) return fail('That is your own invite link. Send it to a friend.');
    if (this.invites.has(p.id)) return fail('You have already joined with an invite.');
    if (Object.values(p.reputation).some((r) => (r ?? 0) > 0)) return fail('Invite links are for new players, before their first sale.');
    if ([...this.invites.values()].filter((i) => i.by === inviter.id && i.paid).length >= INVITE_MAX) return fail('Your friend has already invited as many players as an invite can reward.');
    this.invites.set(p.id, { by: inviter.id, paid: false });
    return ok(`Welcome! You were invited by ${this.names.get(inviter.id) ?? 'a friend'}. Make your first sale and you both get ${INVITE_REWARD} coins.`);
  }

  /** On an invited player's first sale, pay them and whoever invited them. */
  private payInvite(p: Player) {
    const inv = this.invites.get(p.id);
    if (!inv || inv.paid) return;
    const inviter = this.w.players.find((x) => x.id === inv.by);
    if (!inviter) return;
    if ([...this.invites.values()].filter((i) => i.by === inv.by && i.paid).length >= INVITE_MAX) return;
    inv.paid = true;
    transferCoins(this.w, 'town', p, INVITE_REWARD);
    transferCoins(this.w, 'town', inviter, INVITE_REWARD);
    addNote(this.w, p, `Your first sale: you and ${this.names.get(inviter.id) ?? 'your friend'} each got ${INVITE_REWARD} coins for the invite.`);
    addNote(this.w, inviter, `${this.names.get(p.id) ?? 'A friend you invited'} made their first sale: you each got ${INVITE_REWARD} coins.`);
  }

  private inviteView(p: Player) {
    const mine = [...this.invites.values()].filter((i) => i.by === p.id);
    return { code: this.inviteCode(p), joined: mine.length, rewarded: mine.filter((i) => i.paid).length, max: INVITE_MAX, reward: INVITE_REWARD };
  }

  /** Claim a finished quest's reward. The town pays it, through the ledger. */
  claimQuest(email: string, id: string): ActionResult {
    const p = this.playerFor(email);
    const r = claim(this.questsOf(p), id);
    if ('error' in r) return fail(r.error);
    transferCoins(this.w, 'town', p, r.reward);
    this.checkDone(email);
    return ok(`Quest done: ${r.quest.title}. You earned ${r.reward} coins.`);
  }

  /** Claim today's daily reward. It grows each day you come back in a row. */
  claimDailyReward(email: string): ActionResult {
    const p = this.playerFor(email);
    const r = claimDaily(this.questsOf(p), this.clock());
    if ('error' in r) return fail(r.error);
    transferCoins(this.w, 'town', p, r.reward);
    this.checkDone(email);
    return ok(r.day > 1 ? `Day ${r.day} in a row: ${r.reward} coins. Come back tomorrow for more.` : `Daily reward: ${r.reward} coins. Come back tomorrow and it grows.`);
  }

  /** Choose the name other players (and the town board) see. Letters, spaces, hyphens and apostrophes; 2 to 16 characters. */
  setName(email: string, raw: string): ActionResult {
    const p = this.playerFor(email);
    const name = raw.replace(/\s+/g, ' ').trim();
    const check = nameProblem(name);
    if (check) return fail(check);
    if (this.names.get(p.id) === name) return ok(`You are already ${name}.`);
    this.chosen.add(p.id);
    this.rename(p, name);
    return ok(`Other traders will now see you as ${name}.`);
  }

  /** The player for this login. Created on first visit; the id is opaque. */
  playerFor(email: string): Player {
    const existing = this.humans.get(email);
    if (existing) return existing;
    const id = 'h-' + createHash('sha256').update(email).digest('hex').slice(0, 10);
    const p = newPlayer(id, 'human', START_CASH);
    p.at = 'produce';
    addPlayer(this.w, p); // records the starting cash, so the ledger explains every coin
    this.humans.set(email, p);
    this.names.set(id, displayName(email));
    return p;
  }

  private carried = (p: Player) => Object.values(p.inventory).reduce((a, b) => a + (b ?? 0), 0);

  /** The fare to carry your load to another market: a small share of what it is worth, less in a bigger vehicle (see unitFare). */
  private fareTo(p: Player, market: MarketId): number {
    return p.at === market ? 0 : loadFare(this.w, p);
  }

  /**
   * Go to another market. When you're SELLING you can always go: you pay what you can now and the rest
   * comes out of your sale ("pay on delivery"), so being short of cash never strands goods you can't sell.
   * When you're BUYING you need the fare in hand, because you'd have nothing to buy with otherwise.
   */
  private travelTo(p: Player, market: MarketId, payOnDelivery: boolean): ActionResult | null {
    const away = this.onRoad(p) ?? this.otherRealm(p, market);
    if (away) return away;
    const fare = this.fareTo(p, market);
    if (fare === 0) return null;
    if (p.cash < fare && !payOnDelivery) return fail(`You can't afford the fare to ${MARKETS[market].name} (${fare} coins). Sell what you're carrying nearby first.`);
    const now = Math.min(p.cash, fare);
    transferCoins(this.w, p, 'town', now);
    p.fareOwed = (p.fareOwed ?? 0) + (fare - now);
    p.at = market;
    return null;
  }

  /** Pay off fare you owe from cash you now have. Returns what was paid. */
  private settleFare(p: Player): number {
    const owed = p.fareOwed ?? 0;
    if (owed <= 0) return 0;
    const pay = Math.min(owed, p.cash);
    transferCoins(this.w, p, 'town', pay);
    p.fareOwed = owed - pay;
    return pay;
  }

  // ---- realms and journeys ------------------------------------------------------------------

  /**
   * A save from before a place existed gets it now: its merchants and sources, with their starting cash and stock booked
   * in the ledger exactly as a new world books them (so the ledger still explains every balance), and June's new goods.
   */
  private addMissingPlaces() {
    const w = this.w;
    for (const m of harbourMerchants()) {
      if (w.merchants.some((x) => x.id === m.id)) continue;
      w.merchants.push(m);
      w.ledger.push({ hour: w.hour, kind: 'mint', to: m.id, item: COINS, units: m.cash });
      for (const [item, units] of Object.entries(m.stock)) if (units) w.ledger.push({ hour: w.hour, kind: 'mint', to: m.id, item: item as Item, units });
    }
    for (const s of [...harbourSources(), ...frontierSources()]) if (!w.sources.some((x) => x.item === s.item)) w.sources.push(s);
    // goods merchants took on since: June's spice, salt and wine; the frontiers' timber and gems
    const adds: [string, Item, number][] = [['june', 'spice', 15], ['june', 'salt', 30], ['june', 'wine', 20], ['anil', 'gems', 10], ['diego', 'timber', 40], ['marlow', 'timber', 40]];
    for (const [id, item, t] of adds) {
      const m = w.merchants.find((x) => x.id === id);
      if (m && m.target[item] === undefined) { m.target[item] = t; m.stock[item] = m.stock[item] ?? 0; }
    }
  }

  /** The realm a player is in (the town for a new player). */
  realmHere(p: Player): RealmId { return realmOf(p.at ?? 'produce'); }

  /** Refuse an action while the player is on the road between realms. */
  private onRoad(p: Player): ActionResult | null {
    if (!p.journey) return null;
    const left = Math.max(1, p.journey.arrive - this.w.hour);
    return fail(`You're on the road to ${REALMS[realmOf(p.journey.to)].name}. You arrive in ${left} hour${left === 1 ? '' : 's'}.`);
  }

  /** Refuse an action at a market in another realm: getting there is a journey you set off on deliberately. */
  private otherRealm(p: Player, market: MarketId): ActionResult | null {
    if (realmOf(market) === this.realmHere(p)) return null;
    return fail(`${MARKETS[market].name} is in ${REALMS[realmOf(market)].name}, a journey away. Take the road from the map to travel there.`);
  }

  /** What it costs to carry your load to another realm: double the usual fare for each unit, on top of the passage. */
  private journeyFreight(p: Player): number {
    return Object.entries(p.inventory).reduce((a, [i, n]) => a + (n ?? 0) * unitFare(this.w, i as Item, p.vehicle) * 2, 0);
  }

  /**
   * Set off for another realm. It takes REALMS[..].journeyHours game hours (you can't trade on the road) and costs the
   * passage plus freight on what you carry, paid up front.
   */
  travel(email: string, realm: string): ActionResult {
    const p = this.playerFor(email);
    const road = this.onRoad(p);
    if (road) return road;
    if (!(realm in REALMS)) return fail('There is no road to there.');
    const r = realm as RealmId;
    if (r === this.realmHere(p)) return fail(`You are already in ${REALMS[r].name}.`);
    const passage = REALMS[r].passage;
    const freight = this.journeyFreight(p);
    const cost = passage + freight;
    if (p.cash < cost) return fail(`The journey costs ${cost} coins (${passage} for the passage${freight ? `, ${freight} to carry your load` : ''}). You have ${Math.floor(p.cash)}.`);
    transferCoins(this.w, p, 'town', cost);
    p.journey = { to: marketsIn(r)[0], arrive: this.w.hour + REALMS[r].journeyHours };
    return ok(`You set off for ${REALMS[r].name}: ${REALMS[r].journeyHours} hours on the road (about a minute). It cost ${cost} coins.`);
  }

  /** Players whose journey has ended arrive, and hear about it. */
  private arrivals() {
    for (const p of this.humans.values()) {
      if (!p.journey || this.w.hour < p.journey.arrive) continue;
      const to = p.journey.to;
      p.at = to;
      delete p.journey;
      addNote(this.w, p, `You arrived in ${REALMS[realmOf(to)].name}.`);
      const r = realmOf(to);
      if (REALMS[r].frontier && !this.w.discovered[r]) {
        const who = this.names.get(p.id) ?? 'A trader';
        this.w.discovered[r] = { by: who, hour: this.w.hour };
        this.w.events.push({ hour: this.w.hour, type: 'discovery', text: `${who} was the first to reach ${REALMS[r].name}.` });
        addNote(this.w, p, `You are the first to reach ${REALMS[r].name}. The best land is yours to pick.`);
      }
      this.track(p, { kind: 'travel', to, realm: realmOf(to) });
    }
  }

  private realmsView(p: Player) {
    const here = this.realmHere(p);
    return {
      here,
      name: REALMS[here].name,
      journey: p.journey ? { to: realmOf(p.journey.to), name: REALMS[realmOf(p.journey.to)].name, hoursLeft: Math.max(0, p.journey.arrive - this.w.hour), hours: REALMS[realmOf(p.journey.to)].journeyHours, travel: REALMS[realmOf(p.journey.to)].travel } : null,
      roads: (Object.keys(REALMS) as RealmId[]).filter((r) => r !== here).map((r) => ({ realm: r, name: REALMS[r].name, blurb: REALMS[r].blurb, hours: REALMS[r].journeyHours, passage: REALMS[r].passage, freight: this.journeyFreight(p), travel: REALMS[r].travel, frontier: REALMS[r].frontier, discovered: !!this.w.discovered[r] })),
    };
  }

  // ---- odd jobs and scrap searching: the way back from broke ----------------------------------------

  /** Goods of this kind held for the player's current job (they can't be sold or shelved until it is done). */
  private reservedFor(email: string, item: Item): number {
    const j = this.activeJobs.get(email);
    return j && j.item === item ? j.units : 0;
  }
  /** What the player can freely use: what they carry, less what is reserved for their job. */
  private available(email: string, item: Item): number {
    return Math.max(0, (this.humans.get(email)?.inventory[item] ?? 0) - this.reservedFor(email, item));
  }

  /** The cheapest a load can start: the lowest price per unit at any source that charges. */
  private cheapestSource = () => Math.min(...this.w.sources.filter((s) => s.cost > 0).map((s) => s.cost));

  /** Nearly out of coins, carrying nothing and holding no job: the player needs a hand. */
  private needsHelp(email: string, p: Player): boolean {
    return this.carried(p) === 0 && !this.activeJobs.has(email) && p.cash < 2 * this.cheapestSource();
  }

  /** Short of coins, so odd jobs are open to you. Richer players leave them to those who need them. */
  private lowOnCoins(p: Player): boolean {
    return p.cash < LOW_CASH_FACTOR * this.cheapestSource();
  }

  /** Hours until the player may take another job (0 = ready). */
  private jobWait(email: string): number {
    const last = this.jobDone.get(email);
    return last === undefined ? 0 : Math.max(0, last + JOB_GAP_HOURS - this.w.hour);
  }

  /** Hours until the player may search the scrap again (0 = ready). */
  private scavengeWait(email: string): number {
    const last = this.scavenged.get(email);
    return last === undefined ? 0 : Math.max(0, last + SCAVENGE_GAP_HOURS - this.w.hour);
  }

  /** Rummage through the scrap heap for something to sell. Only when nearly broke, and not too often. */
  scavenge(email: string): ActionResult {
    const p = this.playerFor(email);
    const road = this.onRoad(p);
    if (road) return road;
    if (!this.needsHelp(email, p)) return fail('You are not that short. Trade, or sell what you carry.');
    const wait = this.scavengeWait(email);
    if (wait > 0) return fail(`You have picked this heap clean for now. Try again in ${wait} hour${wait === 1 ? '' : 's'}.`);
    this.scavenged.set(email, this.w.hour);
    p.inventory.iron = (p.inventory.iron ?? 0) + 1;
    this.w.ledger.push({ hour: this.w.hour, kind: 'mint', to: p.id, item: 'iron', units: 1 });
    return ok('You found a piece of iron in the scrap heap. Sell it at a stall that buys iron, then you are back in business.');
  }

  /** Each hour: lapse jobs that ran out of time (the cargo goes back to where it came from) and refresh the board. */
  private refreshJobs() {
    for (const [email, j] of [...this.activeJobs]) {
      if (this.w.hour >= j.expires) this.returnCargo(email, j, 'ran out of time');
    }
    this.board = planBoard(this.w, this.board, () => this.nextJobId++);
  }

  /** Send a job's goods back to the source they came from (the town takes them back), and end the job. */
  private returnCargo(email: string, j: Job, why: string) {
    const p = this.humans.get(email);
    const m = this.w.merchants.find((x) => x.id === j.to);
    this.activeJobs.delete(email);
    if (!p) return;
    const n = Math.min(j.units, p.inventory[j.item] ?? 0);
    if (n > 0) {
      p.inventory[j.item] = (p.inventory[j.item] ?? 0) - n;
      const src = this.w.sources.find((x) => x.item === j.item);
      if (src) src.units = Math.min(src.max, src.units + n);
      this.w.ledger.push({ hour: this.w.hour, kind: 'transfer', from: p.id, to: 'town', item: j.item, units: n });
    }
    addNote(this.w, p, `Your job to carry ${j.units} ${j.item} to ${m?.name ?? 'a merchant'} ${why}. The goods went back to the ${SOURCE_LABEL[j.item] ?? 'source'}.`);
  }

  /** Take a job from the board: collect the goods from the source (free for you), which are reserved until you deliver them. */
  takeJob(email: string, id: number): ActionResult {
    const p = this.playerFor(email);
    const road = this.onRoad(p);
    if (road) return road;
    const posted = this.board.find((j) => j.id === id);
    const toM = posted && this.w.merchants.find((m) => m.id === posted.to);
    const far = toM && this.otherRealm(p, toM.market);
    if (far) return far;
    if (this.activeJobs.has(email)) return fail('Finish or give back your current job first.');
    if (!this.lowOnCoins(p)) return fail('Odd jobs are for people who are short of coins. You are doing fine: trade instead.');
    const wait = this.jobWait(email);
    if (wait > 0) return fail(`You have just finished a job. The next one is on offer in ${wait} hour${wait === 1 ? '' : 's'}.`);
    const job = this.board.find((j) => j.id === id);
    if (!job) return fail('That job is gone.');
    const to = this.w.merchants.find((m) => m.id === job.to);
    const src = this.w.sources.find((s) => s.item === job.item);
    if (!to || !src || to.state === 'closed' || src.units < job.units) return fail('That job is no longer on offer.');
    if (CAPACITY[p.vehicle] - this.carried(p) < job.units) return fail(`You need room for ${job.units} ${job.item}. Sell something first.`);
    src.units -= job.units;
    p.inventory[job.item] = (p.inventory[job.item] ?? 0) + job.units;
    this.w.ledger.push({ hour: this.w.hour, kind: 'mint', to: p.id, item: job.item, units: job.units });
    this.board = this.board.filter((j) => j.id !== id);
    this.activeJobs.set(email, job);
    return ok(`You collected ${job.units} ${job.item} at the ${SOURCE_LABEL[job.item] ?? 'source'}, paid for by ${to.name}. Carry them there: it pays you ${job.reward} coins. The goods are reserved for this job.`);
  }

  /** Hand the goods to the merchant. They pay what the goods cost at the source (to the town) and your reward, from their own till. */
  deliverJob(email: string): ActionResult {
    const p = this.playerFor(email);
    const road = this.onRoad(p);
    if (road) return road;
    const job = this.activeJobs.get(email);
    if (!job) return fail('You have no job to deliver.');
    const to = this.w.merchants.find((m) => m.id === job.to);
    if (!to || to.state === 'closed') return fail('They are closed right now. Try again later, before the job runs out.');
    if (to.cash < totalDue(job)) return fail(`${to.name} cannot pay for this just now. Try again later, before the job runs out.`);
    if ((p.inventory[job.item] ?? 0) < job.units) return fail('The goods for this job are missing.');
    const trip = this.travelTo(p, to.market, true);
    if (trip) return trip;
    p.inventory[job.item] = (p.inventory[job.item] ?? 0) - job.units;
    to.stock[job.item] = (to.stock[job.item] ?? 0) + job.units;
    this.w.ledger.push({ hour: this.w.hour, kind: 'transfer', from: p.id, to: to.id, item: job.item, units: job.units });
    transferCoins(this.w, to, 'town', job.units * job.unitCost);
    transferCoins(this.w, to, p, job.reward);
    const fare = this.settleFare(p);
    this.activeJobs.delete(email);
    this.jobDone.set(email, this.w.hour);
    this.track(p, { kind: 'job' });
    return ok(`Delivered ${job.units} ${job.item} to ${to.name} and earned ${job.reward} coins.${fare > 0 ? ` The fare you owed (${fare} coins) came out of it.` : ''}`);
  }

  /** Give a job up: the goods go back to where they came from. */
  dropJob(email: string): ActionResult {
    const job = this.activeJobs.get(email);
    if (!job) return fail('You have no job to drop.');
    this.returnCargo(email, job, 'was given back');
    return ok('You gave the job back and returned the goods.');
  }

  gather(email: string, item: Item): ActionResult {
    const p = this.playerFor(email);
    const road = this.onRoad(p);
    if (road) return road;
    const src = this.w.sources.find((s) => s.item === item);
    if (!src) return fail('Nothing to collect there.');
    if ((src.realm ?? 'town') !== this.realmHere(p)) return fail(`The ${src.label.replace(/ \(.*\)$/, '').toLowerCase()} is in ${REALMS[src.realm ?? 'town'].name}, a journey away. Take the road from the map to travel there.`);
    if (this.carried(p) >= CAPACITY[p.vehicle]) return fail(`Your ${p.vehicle} is full. Sell something first.`);
    if (src.cost > 0 && p.cash < src.cost) return fail(`You need ${src.cost} coins per unit here.`);
    const n = gather(this.w, p, item);
    if (n === 0) return fail(src.units <= 0 ? 'Someone has already cleared this spot. It refills over time.' : 'You could not carry any more.');
    const rain = activeShock(this.w, 'rain') ? ' Rain slowed you down.' : '';
    this.track(p, { kind: 'collect', item, units: n });
    return ok(`You collected ${n} ${item}.${rain}`);
  }

  sell(email: string, merchantId: string, item: Item, units: number, haggle = false): ActionResult {
    const p = this.playerFor(email);
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m || !(item in BASE_PRICE) || !merchantItems(m).includes(item)) return fail('That stall does not trade that.');
    if (m.owner === p.id) return fail('That is your own stall. Use the stock controls in My business.');
    if (!Number.isInteger(units) || units < 1) return fail('Pick a whole number of units.');
    if (m.state === 'closed') return fail(`${m.name} is closed.`);
    const have = this.available(email, item);
    if (have < 1) return fail(this.reservedFor(email, item) > 0 ? `Your ${item} is reserved for your job. Deliver it first.` : `You are not carrying any ${item}.`);
    const q = quoteFor(this.w, m, item, p);
    if (!q.willBuy) return fail(`${m.name} has stopped buying ${item}. ${q.reasons.find((r) => r.includes('cash')) ?? ''}`.trim());
    const mult = haggle ? this.haggleSwing(p, m.id) : 1;
    if (haggle && mult === 1) return fail('You already haggled with them this hour.');
    const trip = this.travelTo(p, m.market, true);
    if (trip) return trip;
    const sold = sellToMerchant(this.w, p, m, item, Math.min(units, have), 0, mult);
    if (sold === 0) return fail(`${m.name} could not take any ${item} right now.`);
    if (haggle) this.lastHaggle.set(email, { id: m.id, merchant: m.name, personality: m.personality, item, side: 'sold', units: sold, usual: q.buyPrice, deal: Math.round(q.buyPrice * mult), pct: Math.round((mult - 1) * 100) });
    const fareTaken = this.settleFare(p);
    this.prog(email).marketsSold.add(m.market);
    this.checkDone(email);
    this.tellOwner(m, p, `bought ${sold} ${item} from`, `sold you`, sold, item, 'sell');
    this.activity.trade(p.id);
    this.track(p, { kind: 'sell', item, units: sold, market: m.market, haggled: haggle && mult !== 1 });
    return this.withHaggle(ok(`Sold ${sold} ${item} to ${m.name}.${haggle ? ` You haggled a ${Math.round((mult - 1) * 100)}% better price.` : ''}${fareTaken > 0 ? ` The fare for the trip (${fareTaken} coins) came out of the sale.` : ''}${(p.fareOwed ?? 0) > 0 ? ` You still owe ${p.fareOwed} coins for the trip.` : ''}`), haggle, m);
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
    const mult = haggle ? this.haggleSwing(p, m.id) : 1;
    if (haggle && mult === 1) return fail('You already haggled with them this hour.');
    const trip = this.travelTo(p, m.market, false);
    if (trip) return trip;
    const q = quoteFor(this.w, m, item, p);
    const bought = buyFromMerchant(this.w, p, m, item, Math.min(units, room), Infinity, mult);
    if (bought === 0) return fail(`You could not buy any ${item} (out of stock, or not enough cash).`);
    if (haggle) this.lastHaggle.set(email, { id: m.id, merchant: m.name, personality: m.personality, item, side: 'bought', units: bought, usual: q.sellPrice, deal: Math.round(q.sellPrice / mult), pct: Math.round((mult - 1) * 100) });
    this.tellOwner(m, p, '', '', bought, item, 'buy');
    this.activity.trade(p.id);
    this.track(p, { kind: 'buy', item, units: bought, market: m.market });
    return this.withHaggle(ok(`Bought ${bought} ${item} from ${m.name}.`), haggle, m);
  }

  /** Tag a successful haggle so the page can ask for the merchant's reaction. */
  private withHaggle(r: ActionResult, haggle: boolean, m: Merchant): ActionResult {
    return haggle ? { ...r, haggled: { merchant: m.id, name: m.name, personality: m.personality } } : r;
  }

  /** The facts of this player's last won haggle, for the merchant's reaction. */
  haggleFacts(email: string): HaggleFacts | null {
    return this.lastHaggle.get(email) ?? null;
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
    this.activity.trade(p.id);
    this.track(p, { kind: 'shares', n });
    return ok(`You bought ${n} shares in ${m.name} for ${r.cost} coins. You'll share in their profit each evening.`);
  }

  sellShares(email: string, merchantId: string, n: number): ActionResult {
    const p = this.playerFor(email);
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m) return fail('No such stall.');
    const r = sellShares(this.w, p, m, n);
    if ('error' in r) return fail(r.error);
    this.activity.trade(p.id);
    return ok(`You sold ${n} shares in ${m.name} for ${r.proceeds} coins.`);
  }

  // ---- town council --------------------------------------------------------------------------

  /** Open a vote on a market's rent or payout. You need a share in one of its merchants. */
  councilPropose(email: string, market: string, lever: string, to: string): ActionResult {
    const p = this.playerFor(email);
    const r = propose(this.w, p, this.names.get(p.id) ?? 'A shareholder', market as MarketId, lever as Lever, to);
    if ('error' in r) return fail(r.error);
    this.activity.vote(p.id);
    this.track(p, { kind: 'vote' });
    return ok(`You put it to the ${MARKETS[market as MarketId].name} council. The vote closes this evening at the latest after ${MIN_VOTING_HOURS} hours.`);
  }

  councilVote(email: string, market: string, yes: boolean): ActionResult {
    const p = this.playerFor(email);
    const r = vote(this.w, p, market as MarketId, yes);
    if ('error' in r) return fail(r.error);
    this.activity.vote(p.id);
    this.track(p, { kind: 'vote' });
    return ok(`You voted ${yes ? 'for' : 'against'}. It counts for the shares you hold in that market.`);
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

  /** One of your shops: a business by id, or (with no id) your stall in town. */
  private myStall(email: string, id?: string): Merchant | undefined {
    const p = this.playerFor(email);
    return id ? this.w.merchants.find((m) => m.owner === p.id && m.id === id) : ownerStallOf(this.w, p);
  }

  openStall(email: string, market: string): ActionResult {
    const p = this.playerFor(email);
    if (this.myStall(email)) return fail('You already have a stall.');
    if (!STALL_MARKETS.includes(market as MarketId)) return fail('There is no free plot in that market. Try the Produce or Fabric Market.');
    if (p.cash < STALL_COST) return fail(`A stall costs ${STALL_COST.toLocaleString('en-US')} coins.`);
    transferCoins(this.w, p, 'town', STALL_COST);
    const stall = openOwnerStall(this.w, p, market as MarketId, this.names.get(p.id) ?? 'Your');
    addNote(this.w, p, `You opened ${stall.name} in the ${MARKETS[market as MarketId].name}.`);
    return ok(`Your stall is open in the ${MARKETS[market as MarketId].name}. Stock the shelves and set your prices.`);
  }

  stallStock(email: string, item: Item, units: number, id?: string): ActionResult {
    const p = this.playerFor(email);
    const st = this.myStall(email, id);
    if (!st) return fail('You do not have a stall yet.');
    if (!(item in st.target)) return fail(`Your stall in the ${MARKETS[st.market].name} does not trade ${item}.`);
    if (!Number.isInteger(units) || units < 1) return fail('Pick a whole number of units.');
    const have = this.available(email, item);
    if (have < units) return fail(`You are only carrying ${have} ${item} that is free to use${this.reservedFor(email, item) > 0 ? ' (the rest is reserved for your job)' : ''}.`);
    const trip = this.travelTo(p, st.market, true); // you walk your load to your stall: the fare is for that walk, owed from your next sale if you are short
    if (trip) return trip; // a business in another realm is stocked by going there
    p.inventory[item] = (p.inventory[item] ?? 0) - units;
    st.stock[item] = (st.stock[item] ?? 0) + units;
    this.w.ledger.push({ hour: this.w.hour, kind: 'transfer', from: p.id, to: st.id, item, units });
    return ok(`Put ${units} ${item} on your shelves.`);
  }

  stallTake(email: string, item: Item, units: number, id?: string): ActionResult {
    const p = this.playerFor(email);
    const st = this.myStall(email, id);
    if (!st) return fail('You do not have a stall yet.');
    if (!Number.isInteger(units) || units < 1) return fail('Pick a whole number of units.');
    const have = st.stock[item] ?? 0;
    if (have < units) return fail(`Your shelves only hold ${have} ${item}.`);
    if (this.carried(p) + units > CAPACITY[p.vehicle]) return fail(`Your ${p.vehicle} can't carry that many.`);
    const trip = this.travelTo(p, st.market, true); // you go to your stall, so selling in its market afterwards costs no second fare
    if (trip) return trip;
    st.stock[item] = have - units;
    p.inventory[item] = (p.inventory[item] ?? 0) + units;
    this.w.ledger.push({ hour: this.w.hour, kind: 'transfer', from: st.id, to: p.id, item, units });
    return ok(`Took ${units} ${item} off your shelves.`);
  }

  stallPrice(email: string, item: Item, buy: number, sell: number, id?: string): ActionResult {
    const st = this.myStall(email, id);
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
  stallCash(email: string, direction: 'deposit' | 'withdraw', amount: number, id?: string): ActionResult {
    const p = this.playerFor(email);
    const st = this.myStall(email, id);
    if (!st) return fail('You do not have a stall yet.');
    if (!Number.isInteger(amount) || amount < 1) return fail('Pick a whole number of coins.');
    if (direction === 'deposit') {
      if (p.cash < amount) return fail('You do not have that much cash.');
      transferCoins(this.w, p, st, amount);
      return ok(`Put ${amount} coins in your till.`);
    }
    if (st.cash < amount) return fail(`Your till only holds ${Math.round(st.cash)} coins.`);
    transferCoins(this.w, st, p, amount);
    return ok(`Took ${amount} coins out of your till.`);
  }

  // ---- land and businesses in the frontiers --------------------------------------------------

  /**
   * Buy a plot. From the town while nobody owns it (at its price), or from another player who has put it up for sale (at
   * their asking price, paid to them). You must be there, and you can own one plot in each place.
   */
  buyLand(email: string, plotId: string): ActionResult {
    const p = this.playerFor(email);
    const road = this.onRoad(p);
    if (road) return road;
    const plot = this.w.plots.find((x) => x.id === plotId);
    if (!plot) return fail('There is no such plot.');
    if (this.realmHere(p) !== plot.realm) return fail(`That land is in ${REALMS[plot.realm].name}. Go there to buy it.`);
    if (plot.owner === p.id) return fail('You already own that plot.');
    if (this.w.plots.some((x) => x.owner === p.id && x.realm === plot.realm)) return fail(`You already own land in ${REALMS[plot.realm].name}: one plot per place.`);
    const seller = plot.owner ? this.w.players.find((x) => x.id === plot.owner) : undefined;
    if (plot.owner && plot.forSale === undefined) return fail(`${plot.ownerName ?? 'Someone'} owns that plot and is not selling.`);
    const price = seller ? plot.forSale! : plot.price;
    if (p.cash < price) return fail(`That plot costs ${price.toLocaleString('en-US')} coins.`);
    transferCoins(this.w, p, seller ?? 'town', price);
    if (seller) addNote(this.w, seller, `${this.names.get(p.id) ?? 'A trader'} bought your plot in ${REALMS[plot.realm].name} for ${price.toLocaleString('en-US')} coins.`);
    plot.owner = p.id;
    plot.ownerName = this.names.get(p.id) ?? 'A trader';
    delete plot.forSale;
    this.w.events.push({ hour: this.w.hour, type: 'land', text: `${plot.ownerName} bought land in ${REALMS[plot.realm].name}.` });
    this.track(p, { kind: 'land' });
    return ok(`The plot is yours, for ${price.toLocaleString('en-US')} coins. Build a business on it when you're ready (${BUILD_COST.toLocaleString('en-US')} coins).`);
  }

  /** Put your empty land up for sale at your price, or take it off the market (price 0). Land with a business on it stays yours. */
  listLand(email: string, plotId: string, price: number): ActionResult {
    const p = this.playerFor(email);
    const plot = this.w.plots.find((x) => x.id === plotId);
    if (!plot || plot.owner !== p.id) return fail('That is not your land.');
    if (plot.business) return fail('There is a business on that land, so it stays yours.');
    if (price === 0) { delete plot.forSale; return ok('Your land is off the market.'); }
    if (!Number.isInteger(price) || price < 100 || price > 1_000_000) return fail('Ask a whole number of coins, from 100 to 1,000,000.');
    plot.forSale = price;
    return ok(`Your plot in ${REALMS[plot.realm].name} is for sale at ${price.toLocaleString('en-US')} coins.`);
  }

  /** Build a business on land you own: a shop with your prices, stocked from what you carry, selling to the people there. */
  build(email: string, plotId: string, rawName?: string): ActionResult {
    const p = this.playerFor(email);
    const road = this.onRoad(p);
    if (road) return road;
    const plot = this.w.plots.find((x) => x.id === plotId);
    if (!plot || plot.owner !== p.id) return fail('Build on land you own.');
    if (plot.business) return fail('You already have a business there.');
    if (this.realmHere(p) !== plot.realm) return fail(`Go to ${REALMS[plot.realm].name} to build there.`);
    if (p.cash < BUILD_COST) return fail(`Building costs ${BUILD_COST.toLocaleString('en-US')} coins.`);
    const owner = this.names.get(p.id) ?? 'A trader';
    const typed = (rawName ?? '').replace(/\s+/g, ' ').trim();
    // a name of your own (2 to 24 letters, spaces, hyphens, apostrophes; the same word filter as player names), or a plain one
    if (typed && (!/^\p{L}[\p{L} '\-]{1,23}$/u.test(typed) || nameProblem(typed.replace(/[^\p{L}]/gu, '').slice(0, 16) || 'xx') !== null)) return fail('Name your business with 2 to 24 letters, spaces, hyphens or apostrophes.');
    const name = typed || `${owner}'s Trading Post`;
    transferCoins(this.w, p, 'town', BUILD_COST);
    const shop = openOwnerStall(this.w, p, plot.market, owner, { id: `biz-${plot.id}`, name });
    plot.business = shop.id;
    this.w.events.push({ hour: this.w.hour, type: 'land', text: `${name} opened in ${REALMS[plot.realm].name}.` });
    this.track(p, { kind: 'build' });
    return ok(`${name} is built. Stock it and set your prices: the people of ${REALMS[plot.realm].name} buy from you.`);
  }

  private landView(p: Player) {
    const here = this.realmHere(p);
    const name = (id: string) => this.w.merchants.find((m) => m.id === id)?.name;
    const view = (x: Plot) => ({
      id: x.id, realm: x.realm, n: x.n, price: x.price, forSale: x.forSale ?? null,
      owner: x.owner ? { name: x.ownerName ?? 'A trader', mine: x.owner === p.id } : null,
      business: x.business ? { id: x.business, name: name(x.business) ?? 'A business' } : null,
    });
    return {
      buildCost: BUILD_COST,
      here: this.w.plots.filter((x) => x.realm === here).map(view),
      mine: this.w.plots.filter((x) => x.owner === p.id).map(view),
      discovered: this.w.discovered[here] ?? null,
    };
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
    transferCoins(this.w, p, 'town', UPGRADE_COST[to]);
    p.vehicle = to;
    this.checkDone(email);
    this.track(p, { kind: 'upgrade' });
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
      // only a source in your realm: one a journey away is not a deal you can make from here
      const src = this.w.sources.find((x) => x.item === item && x.units >= 5 && (x.realm ?? 'town') === this.realmHere(p));
      const cheapStall = offers.filter((x) => x.o.willSell && x.s.id !== best.s.id).sort((a, b) => a.o.sellPrice - b.o.sellPrice)[0];
      let from: (typeof out)[number]['from'] | null = null;
      if (src && (!cheapStall || src.cost <= cheapStall.o.sellPrice)) from = { kind: 'source', id: item, label: src.label, cost: src.cost };
      else if (cheapStall) from = { kind: 'stall', id: cheapStall.s.id, label: cheapStall.s.name, cost: cheapStall.o.sellPrice };
      if (!from) continue;
      const fare = from.kind === 'stall' && stalls.find((s) => s.id === from!.id)!.market !== best.s.market ? unitFare(this.w, item, p.vehicle) : 0;
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
    if (p.journey) {
      const left = Math.max(1, p.journey.arrive - this.w.hour);
      const to = realmOf(p.journey.to);
      return say(`You're on the road to ${REALMS[to].name}: you arrive in ${left} hour${left === 1 ? '' : 's'}.${to === 'saltmere' ? ' The harbour pays well for thread and iron, and sells spice the town pays more for.' : ' June\'s Pantry pays well for spice and salt.'}`);
    }
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
    // The way back from broke comes before anything else once you are stuck.
    const job = this.activeJobs.get(email);
    if (job) {
      const to = this.w.merchants.find((m) => m.id === job.to);
      return say(`Deliver your ${job.units} ${job.item} to ${to?.name ?? 'the merchant'}: they pay you ${job.reward} coins for the job.`, to ? { kind: 'stall', id: to.id } : null);
    }
    if (this.needsHelp(email, p)) {
      return say(this.scavengeWait(email) === 0
        ? 'You are nearly out of coins. Open Deals: search the scrap heap for something to sell, or take an odd job.'
        : 'You are nearly out of coins. Open Deals and take an odd job while the scrap heap refills.');
    }
    // In a frontier there are no merchants: the next step is land, a business, and stocking it, or carrying its good to where it sells.
    const realmNow = this.realmHere(p);
    if (REALMS[realmNow].frontier) {
      const place = REALMS[realmNow].name;
      const plot = this.w.plots.find((x) => x.owner === p.id && x.realm === realmNow);
      const shop = plot?.business ? this.w.merchants.find((m) => m.id === plot.business) : undefined;
      const stockable = shop && (Object.entries(p.inventory) as [Item, number][]).find(([i, n]) => (n ?? 0) > 0 && i in shop.target);
      if (shop && stockable) return say(`Stock your ${stockable[1]} ${stockable[0]} in ${shop.name} (My business): the people of ${place} buy from it.`, { kind: 'stall', id: shop.id });
      if (!plot) {
        const asks = this.w.plots.filter((x) => x.realm === realmNow && (!x.owner || x.forSale !== undefined)).map((x) => (x.owner ? x.forSale! : x.price));
        return asks.length
          ? say(`Nobody runs a shop in ${place} yet that's yours. Buy a plot: from ${Math.min(...asks).toLocaleString('en-US')} coins, dearer by the source. Tap one on the map.`)
          : say(`Every plot in ${place} is taken. Watch for land put up for sale, or try another frontier.`);
      }
      if (!plot.business) return say(`Build a business on your land (${BUILD_COST.toLocaleString('en-US')} coins): tap your plot on the map.`);
      const good = this.w.sources.find((x) => x.realm === realmNow)?.item;
      if (good && (p.inventory[good] ?? 0) > 0) return say(`${good.charAt(0).toUpperCase() + good.slice(1)} is dear in Nims and at Saltmere Harbour. Take the road and sell it there.`);
      return say(`Your business sells ${Object.keys(shop!.target).join(', ')}. Bring them from elsewhere: the people of ${place} pay more for what they lack.`, { kind: 'stall', id: shop!.id });
    }
    const carried = this.carried(p);
    if (carried > 0) {
      const [item, units] = Object.entries(p.inventory).filter(([, n]) => (n ?? 0) > 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0] as [Item, number];
      const options = stalls
        .filter((s) => s.state !== 'closed')
        .flatMap((s) => s.offers.filter((o) => o.item === item && o.willBuy).map((o) => ({ s, o })))
        .map((x) => ({ ...x, net: x.o.buyPrice * units - this.fareTo(p, x.s.market) }))
        .sort((a, b) => b.net - a.net);
      if (options.length) {
        const top = options[0];
        const fare = this.fareTo(p, top.s.market);
        const here = fare === 0 ? '' : fare > p.cash ? ` It’s in another market. The fare (${fare} coins) is more than you have, so it comes out of your sale.` : ` It’s in another market, so the trip costs a fare (${fare} coins).`;
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

  /** The board and the player's own job, shaped for the page. */
  private jobViews(email: string, here: RealmId = 'town') {
    const name = (id: string) => this.w.merchants.find((m) => m.id === id)?.name ?? id;
    const view = (j: Job) => ({ id: j.id, item: j.item, units: j.units, reward: j.reward, from: { id: j.item, name: SOURCE_LABEL[j.item] ?? 'the source' }, to: { id: j.to, name: name(j.to) }, hoursLeft: Math.max(0, j.expires - this.w.hour) });
    const mine = this.activeJobs.get(email);
    const local = (j: Job) => realmOf(this.w.merchants.find((m) => m.id === j.to)?.market ?? 'produce') === here;
    return { board: this.board.filter(local).map(view), active: mine ? view(mine) : null };
  }

  // ---- merchant agents (server/agents/planner.ts) ------------------------------------------

  private today() { return Math.floor(this.w.hour / 24) + 1; }

  /** Open town merchants whose plan was made before today, so the planner asks them next. Player stalls plan for themselves. */
  merchantsToPlan(): string[] {
    const day = this.today();
    return this.w.merchants.filter((m) => !m.owner && m.state !== 'closed' && (m.plan?.day ?? 0) < day).map((m) => m.id);
  }

  /** What a merchant knows when it plans its day: its own books and the town around it. Nothing about any player. */
  planFacts(merchantId: string): PlanFacts | null {
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m || m.owner) return null;
    const c = this.w.council[m.market];
    return {
      id: m.id,
      merchant: m.name,
      personality: m.personality,
      market: MARKETS[m.market].name,
      day: this.today(),
      cash: Math.round(m.cash),
      cashFloor: m.cashFloor,
      items: merchantItems(m).map((item) => {
        const r = recent(m, item, this.w.hour);
        return { item, stock: m.stock[item] ?? 0, usualStock: m.target[item] ?? 0, boughtByPlayers: r.bought, soldByPlayers: r.sold, price: Math.round(quoteFor(this.w, m, item).mid), usualPrice: BASE_PRICE[item] };
      }),
      shocks: this.w.shocks.filter((s) => s.startHour <= this.w.hour && this.w.hour < s.endHour).map((s) => (s.kind === 'festive season' ? 'festive season: everyone wants fabric' : s.kind === 'fuel queue' ? 'a fuel queue makes carrying goods dearer' : 'rain keeps people at home')),
      rent: c.rent,
      payout: c.payout,
    };
  }

  /** A merchant's plan for today. The news hears about it when it changes how the merchant runs its business. */
  applyPlan(merchantId: string, plan: ChosenPlan) {
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m || m.owner) return;
    const next = { day: this.today(), stock: plan.stock, margin: plan.margin, reason: plan.reason };
    const changed = !samePlan(m.plan, next) && !(m.plan === undefined && plan.margin === 'same' && Object.keys(plan.stock).length === 0);
    m.plan = next;
    if (changed) this.w.events.push({ hour: this.w.hour, type: 'plan', merchant: m.id, text: `${m.name}: "${plan.reason}"` });
  }

  /** The facts a merchant's voice is written from: the same quote the tooltip uses. Player stalls speak for themselves, so they return null. */
  voiceFacts(email: string, merchantId: string, item: string): VoiceFacts | null {
    const m = this.w.merchants.find((x) => x.id === merchantId);
    if (!m || m.owner || !(item in BASE_PRICE) || !merchantItems(m).includes(item as Item)) return null;
    const q = quoteFor(this.w, m, item as Item, this.playerFor(email));
    return { id: m.id, merchant: m.name, personality: m.personality, item, pays: q.buyPrice, charges: q.sellPrice, reasons: q.reasons, tooltip: q.tooltip };
  }

  /** The town's most recent events, newest first, for the gazette. World events only: nothing about any one player. */
  gazetteFacts(): GazetteFacts {
    return { events: this.w.events.slice(-8).reverse().map((e) => ({ hour: e.hour, text: e.text })) };
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
          target: targetOf(m, item),
          why: q.tooltip,
        };
      }),
      fund: m.state === 'closed' ? { pool: m.fund.pool, goal: m.fund.goal, contributors: Object.entries(m.fund.contributors).map(([id, put]) => ({ name: this.names.get(id) ?? 'A trader', put })) } : undefined,
      /** Fund contributors who reopened this shop. Shown on its sign. */
      sign: m.sign.map((id) => this.names.get(id) ?? 'A trader'),
      owner: m.owner ? { name: m.ownerName ?? 'A trader', mine: m.owner === p.id } : undefined,
      plan: !m.owner && m.plan ? { day: m.plan.day, reason: m.plan.reason, stock: m.plan.stock, margin: m.plan.margin } : undefined,
      shares: m.owner ? undefined : { price: sharePrice(m), left: publicSharesLeft(m), yours: m.shares[p.id] ?? 0, worth: Math.round(merchantWorth(m)) },
    }));
  }

  /**
   * Public numbers for the sign-in screen and /stats: no names, no emails, nothing about any one player.
   * Activity is in real time; the town's own day count is game time.
   */
  publicStats() {
    const open = this.w.merchants.filter((m) => !m.owner && m.state !== 'closed').length;
    // Only people who have done something: a trade, a share, a stall. Shown by the same first name other players already see.
    const leaders = [...this.humans.values()]
      .map((p) => {
        const shares = this.w.merchants.reduce((n, m) => n + (m.shares[p.id] ?? 0), 0);
        const stall = this.w.merchants.some((m) => m.owner === p.id);
        const traded = Object.values(p.reputation).some((r) => (r ?? 0) > 0);
        return { name: this.names.get(p.id) ?? 'A trader', avatar: this.avatars.get(p.id) ?? null, worth: this.netWorth(p), shares, stall, vehicle: p.vehicle, active: traded || shares > 0 || stall };
      })
      .filter((x) => x.active)
      .sort((a, b) => b.worth - a.worth)
      .slice(0, 10)
      .map(({ active: _, ...x }) => x);
    const decisions = this.w.events
      .filter((e) => e.type === 'council' && e.decision)
      .slice(-5)
      .reverse()
      .map((e) => {
        const d = e.decision!;
        return { day: Math.floor(e.hour / 24) + 1, market: MARKETS[d.market].name, lever: d.lever, to: d.to, passed: d.passed, yes: d.yes, no: d.no, daoId: d.daoId ?? null };
      });
    return {
      ...this.activity.summary(),
      players: this.humans.size,
      day: Math.floor(this.w.hour / 24) + 1,
      shops: { open, total: this.w.merchants.filter((m) => !m.owner).length, playerStalls: this.w.merchants.filter((m) => m.owner).length },
      leaders,
      decisions,
    };
  }

  /**
   * Other signed-in people currently playing, for the map: where they are and a few public stats, so one
   * player can click another's avatar. Only those seen in the last ONLINE_WINDOW_MS, and not mid-journey
   * (there is no road position to show them at). Same privacy rule as the town board: the name shown, never
   * the email.
   */
  private onlinePlayers(me: Player) {
    const since = this.clock() - ONLINE_WINDOW_MS;
    return [...this.humans.values()]
      .filter((x) => x.id !== me.id && !x.journey && (this.lastActive.get(x.id) ?? 0) > since)
      .map((x) => {
        const market = x.at ?? 'produce';
        return {
          id: x.id,
          name: this.names.get(x.id) ?? 'A trader',
          avatar: this.avatars.get(x.id) ?? null,
          market,
          realm: realmOf(market),
          worth: this.netWorth(x),
          vehicle: x.vehicle,
          shares: this.w.merchants.reduce((n, m) => n + (m.shares[x.id] ?? 0), 0),
          stall: this.w.merchants.some((m) => m.owner === x.id),
        };
      });
  }

  /** Everything the UI needs, including each merchant's own reasoning for every price. */
  state(email: string) {
    const w = this.w;
    const p = this.playerFor(email);
    this.activity.seen(p.id);
    this.lastActive.set(p.id, this.clock());
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
    // Deals, the coach and odd jobs look at the realm you are in: anywhere else is a journey away.
    const here = this.realmHere(p);
    const local = raw.filter((s) => realmOf(s.market) === here);
    const deals = this.deals(p, local);
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
        businesses: w.merchants.filter((m) => m.owner === p.id && m.id !== mine?.id).map((b) => ({
          id: b.id,
          name: b.name,
          market: b.market,
          realm: realmOf(b.market),
          till: Math.round(b.cash),
          items: merchantItems(b).map((item) => {
            const pr2 = b.prices?.[item] ?? { buy: Math.round(BASE_PRICE[item] * 0.8), sell: Math.round(BASE_PRICE[item] * 1.2) };
            return { item, base: BASE_PRICE[item], min: Math.round(BASE_PRICE[item] * MIN_MULT), max: Math.round(BASE_PRICE[item] * MAX_MULT), buy: pr2.buy, sell: pr2.sell, stock: b.stock[item] ?? 0, carrying: p.inventory[item] ?? 0 };
          }),
        })),
        stallOffer: mine ? null : { cost: STALL_COST, markets: marketsIn('town').map((id) => ({ id, name: MARKETS[id].name, free: STALL_MARKETS.includes(id) })) },
        notes: p.notes.slice(-12).reverse(),
      },
      council: this.councilView(p),
      goal: pr.kind ? { kind: pr.kind, title: GOALS[pr.kind].title, blurb: GOALS[pr.kind].blurb, progress: gs!.progress, label: gs!.label, done: pr.done } : null,
      goals: (Object.keys(GOALS) as GoalKind[]).map((k) => ({ kind: k, ...GOALS[k] })),
      coach: this.coach(email, p, local, deals),
      realm: this.realmsView(p),
      land: this.landView(p),
      help: { needed: this.needsHelp(email, p), scavengeIn: this.scavengeWait(email), canWork: this.lowOnCoins(p), workIn: this.jobWait(email) },
      jobs: this.jobViews(email, here),
      deals,
      orders: (this.orders.get(email) ?? []).slice().reverse().slice(0, 8),
      hour: w.hour,
      day: Math.floor(w.hour / 24) + 1,
      shocks: w.shocks.filter((s) => w.hour >= s.startHour && w.hour < s.endHour).map((s) => ({ kind: s.kind, hoursLeft: s.endHour - w.hour })),
      /** What it would cost you to walk your current load to each market (0 where you already are). */
      fares: Object.fromEntries((Object.keys(MARKETS) as MarketId[]).map((id) => [id, this.fareTo(p, id)])) as Record<MarketId, number>,
      gatherSpeed: gatherRate(w),
      markets: Object.entries(MARKETS).map(([id, mk]) => ({ id, name: mk.name, items: mk.items })),
      stalls,
      board,
      sources: w.sources.map((s) => ({ item: s.item, label: s.label, units: Math.floor(s.units), cost: s.cost })),
      events: w.events.slice(-12).reverse(),
      quests: questView(this.questsOf(p), this.clock()),
      invite: this.inviteView(p),
      online: this.onlinePlayers(p),
      you: {
        name: this.names.get(p.id) ?? 'Trader',
        avatar: this.avatars.get(p.id) ?? null,
        cash: Math.round(p.cash),
        fareOwed: Math.round(p.fareOwed ?? 0),
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

  /** What each market's council looks like to this player: the rules, any open vote, and what they can do. */
  private councilView(p: Player) {
    const w = this.w;
    return (Object.keys(MARKETS) as MarketId[]).map((market) => {
      const c = w.council[market];
      const seats = seatsOf(w, market, p.id);
      const pr = c.proposal;
      const t = pr ? tally(w, market, pr) : null;
      return {
        market,
        name: MARKETS[market].name,
        rent: c.rent,
        payout: c.payout,
        effects: [EFFECT[c.rent], EFFECT[c.payout]],
        options: { rent: [...LEVELS.rent], payout: [...LEVELS.payout] },
        seats,
        regular: isRegular(w, market, p.id),
        canPropose: seats > 0 && !pr,
        proposal: pr && t ? {
          lever: pr.lever,
          to: pr.to,
          effect: EFFECT[pr.to],
          by: pr.byName,
          yes: t.yes,
          no: t.no,
          merchants: t.merchants,
          closesIn: Math.max(0, pr.closesHour - w.hour),
          yourVote: pr.votes[p.id] ? (pr.votes[p.id].yes ? 'yes' as const : 'no' as const) : null,
        } : null,
      };
    });
  }
}
