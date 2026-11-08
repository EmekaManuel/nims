/**
 * Quests and daily rewards: what a player is asked to do next, and what they get for it.
 *
 * The game tells this module what a player just did (a QuestEvent: collected goods, sold, haggled, bought a share,
 * voted, travelled ...). Each quest has objectives that count those events; when every objective is met the quest
 * can be claimed, and claiming pays its reward. The coins are paid by the game through the ledger (town -> player),
 * so every coin a quest pays is on the books like any other.
 *
 * Quests come in chains: the starter chain teaches the game one step at a time, and later chains (realms) send
 * players further afield. A chain shows one quest at a time; the next unlocks when the previous is claimed.
 *
 * Daily rewards are in real days (UTC), not game days: come back on consecutive days and the reward grows, up to a
 * cap. Missing a day starts the streak again.
 */
import type { Item, MarketId } from '../../sim/world';

export type QuestEvent =
  | { kind: 'collect'; item: Item; units: number }
  | { kind: 'sell'; item: Item; units: number; market: MarketId; haggled: boolean }
  | { kind: 'buy'; item: Item; units: number; market: MarketId }
  | { kind: 'shares'; n: number }
  | { kind: 'vote' }
  | { kind: 'upgrade' }
  | { kind: 'job' }
  | { kind: 'order' }
  | { kind: 'travel'; to: MarketId; realm: string };

export interface Objective {
  /** What counts. */
  on: QuestEvent['kind'];
  /** How many: units of goods for collect/sell/buy, otherwise times. With `distinct: 'market'`, how many different markets. */
  target: number;
  label: string;
  item?: Item;
  market?: MarketId;
  realm?: string;
  haggled?: boolean;
  distinct?: 'market';
}

export interface QuestDef {
  id: string;
  chain: 'starter' | 'realm';
  title: string;
  /** One or two sentences: why the town is asking. */
  story: string;
  objectives: Objective[];
  /** Coins paid on claim. */
  reward: number;
  /** The quest in the same chain that must be claimed first. */
  after?: string;
}

/** The starter chain: the game's first ten minutes, one step at a time. Small rewards, so the 10,000-coin goal is still earned. */
export const QUESTS: QuestDef[] = [
  { id: 'first-haul', chain: 'starter', title: 'Your first haul', story: 'Every fortune in Nims starts with a load. Pick up goods at a farm, a scrap spot or the wholesaler.',
    objectives: [{ on: 'collect', target: 1, label: 'Collect goods at a source' }], reward: 100 },
  { id: 'first-sale', chain: 'starter', title: 'Make a sale', story: 'Merchants pay most for what they are short of. Sell five units to any stall.',
    objectives: [{ on: 'sell', target: 5, label: 'Sell 5 units' }], reward: 150, after: 'first-haul' },
  { id: 'strike-bargain', chain: 'starter', title: 'Strike a bargain', story: 'Every merchant will haggle once an hour. Tick Haggle before you sell.',
    objectives: [{ on: 'sell', target: 1, haggled: true, label: 'Sell with a haggle' }], reward: 200, after: 'first-sale' },
  { id: 'two-markets', chain: 'starter', title: 'Know the town', story: 'A good costs different amounts in different markets. Sell in two of them.',
    objectives: [{ on: 'sell', target: 2, distinct: 'market', label: 'Sell in 2 different markets' }], reward: 250, after: 'strike-bargain' },
  { id: 'a-stake', chain: 'starter', title: 'A piece of the town', story: 'Shareholders are paid every evening. Buy a share in any merchant.',
    objectives: [{ on: 'shares', target: 1, label: 'Buy a share' }], reward: 250, after: 'two-markets' },
  { id: 'your-say', chain: 'starter', title: 'Have your say', story: 'Each market is run by a council. Trade there and you have a seat: propose a change or vote.',
    objectives: [{ on: 'vote', target: 1, label: 'Propose or vote in a town council' }], reward: 300, after: 'a-stake' },

  // The road to Saltmere: opens once a player knows the town. Each step takes them further, and pays for the trip.
  { id: 'beyond-the-hills', chain: 'realm', title: 'Beyond the hills', story: 'There is a harbour past the hills where ships bring spice. Take the road out of town to Saltmere.',
    objectives: [{ on: 'travel', target: 1, realm: 'saltmere', label: 'Travel to Saltmere Harbour' }], reward: 300, after: 'two-markets' },
  { id: 'ships-need-thread', chain: 'realm', title: 'What the ships need', story: 'The harbour pays well for thread and iron from town: the ships go through it fast. Sell to Marlow Chandlery.',
    objectives: [{ on: 'sell', target: 10, market: 'harbour', label: 'Sell 10 units at Saltmere Harbour' }], reward: 400, after: 'beyond-the-hills' },
  { id: 'spice-road', chain: 'realm', title: 'The spice road', story: 'The town has no spice of its own. Buy it at the harbour, carry it home, and sell it in the Produce Market.',
    objectives: [{ on: 'sell', target: 5, item: 'spice', market: 'produce', label: 'Sell 5 spice in the Produce Market' }], reward: 500, after: 'ships-need-thread' },
];

/** Daily reward by streak day (1-based); day 7 and after pay the last amount. */
export const DAILY = [100, 150, 200, 300, 400, 500, 700];

export interface QuestState {
  /** quest id -> count per objective. */
  progress: Record<string, number[]>;
  /** quest id -> objective index -> markets seen (for distinct objectives). */
  seen: Record<string, Record<number, string[]>>;
  claimed: string[];
  /** Daily rewards: the last real day (YYYY-MM-DD, UTC) one was claimed, and the streak it was part of. */
  daily: { lastDay: string | null; streak: number };
}

export const newQuestState = (): QuestState => ({ progress: {}, seen: {}, claimed: [], daily: { lastDay: null, streak: 0 } });

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const prevDay = (day: string) => dayOf(Date.parse(`${day}T00:00:00Z`) - 86_400_000);

/** The quests a player is on now: in each chain, the first one not yet claimed whose predecessor is claimed. */
export function activeQuests(s: QuestState, defs = QUESTS): QuestDef[] {
  const out: QuestDef[] = [];
  for (const chain of new Set(defs.map((d) => d.chain))) {
    const next = defs.find((d) => d.chain === chain && !s.claimed.includes(d.id) && (!d.after || s.claimed.includes(d.after)));
    if (next) out.push(next);
  }
  return out;
}

const matches = (o: Objective, e: QuestEvent): boolean => {
  if (o.on !== e.kind) return false;
  if (o.item && 'item' in e && e.item !== o.item) return false;
  if (o.market && 'market' in e && e.market !== o.market) return false;
  if (o.market && e.kind === 'travel' && e.to !== o.market) return false;
  if (o.realm && e.kind === 'travel' && e.realm !== o.realm) return false;
  if (o.haggled && !(e.kind === 'sell' && e.haggled)) return false;
  return true;
};

/** Count an event towards every active quest. Returns the quests that this event completed. */
export function record(s: QuestState, e: QuestEvent, defs = QUESTS): QuestDef[] {
  const done: QuestDef[] = [];
  for (const q of activeQuests(s, defs)) {
    const before = isComplete(s, q);
    const counts = (s.progress[q.id] ??= q.objectives.map(() => 0));
    q.objectives.forEach((o, i) => {
      if (!matches(o, e)) return;
      if (o.distinct === 'market') {
        const where = e.kind === 'travel' ? e.to : 'market' in e ? e.market : null;
        if (!where) return;
        const seen = ((s.seen[q.id] ??= {})[i] ??= []);
        if (!seen.includes(where)) seen.push(where);
        counts[i] = Math.min(o.target, seen.length);
      } else {
        const add = (e.kind === 'collect' || e.kind === 'sell' || e.kind === 'buy') && !o.haggled ? e.units : 1;
        counts[i] = Math.min(o.target, counts[i] + add);
      }
    });
    if (!before && isComplete(s, q)) done.push(q);
  }
  return done;
}

export const isComplete = (s: QuestState, q: QuestDef) => q.objectives.every((o, i) => (s.progress[q.id]?.[i] ?? 0) >= o.target);

/** Claim a finished quest. Returns its reward, or an error. The caller pays it. */
export function claim(s: QuestState, id: string, defs = QUESTS): { reward: number; quest: QuestDef } | { error: string } {
  const q = activeQuests(s, defs).find((d) => d.id === id);
  if (!q) return { error: s.claimed.includes(id) ? 'You already claimed that.' : 'That quest is not open.' };
  if (!isComplete(s, q)) return { error: 'Finish the quest first.' };
  s.claimed.push(q.id);
  return { reward: q.reward, quest: q };
}

/** Today's daily reward, if not yet claimed today: the streak it would make and what it pays. */
export function dailyOffer(s: QuestState, now: number): { day: number; reward: number; ready: boolean } {
  const today = dayOf(now);
  if (s.daily.lastDay === today) return { day: s.daily.streak, reward: DAILY[Math.min(s.daily.streak, DAILY.length) - 1], ready: false };
  const streak = s.daily.lastDay === prevDay(today) ? s.daily.streak + 1 : 1;
  return { day: streak, reward: DAILY[Math.min(streak, DAILY.length) - 1], ready: true };
}

/** Claim today's daily reward. Returns what it pays, or an error. The caller pays it. */
export function claimDaily(s: QuestState, now: number): { reward: number; day: number } | { error: string } {
  const offer = dailyOffer(s, now);
  if (!offer.ready) return { error: 'You have had today\'s reward. Come back tomorrow.' };
  s.daily = { lastDay: dayOf(now), streak: offer.day };
  return { reward: offer.reward, day: offer.day };
}

/** What the page shows: active quests with their progress, and the daily reward. */
export function questView(s: QuestState, now: number, defs = QUESTS) {
  const starter = defs.filter((d) => d.chain === 'starter');
  return {
    active: activeQuests(s, defs).map((q) => ({
      id: q.id, chain: q.chain, title: q.title, story: q.story, reward: q.reward,
      objectives: q.objectives.map((o, i) => ({ label: o.label, done: s.progress[q.id]?.[i] ?? 0, target: o.target })),
      complete: isComplete(s, q),
    })),
    starter: { done: starter.filter((d) => s.claimed.includes(d.id)).length, total: starter.length },
    daily: dailyOffer(s, now),
  };
}
