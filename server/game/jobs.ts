/**
 * The odd jobs board: how a player who is nearly broke earns their way back.
 *
 * A job comes from the market itself. Merchants almost always run a little short of the goods they like to hold,
 * and the town's farms, scrap spots and wholesaler have goods to spare. So a short merchant will pay a courier to
 * fetch some: the courier collects the goods from the source for nothing up front (no capital needed), carries them
 * to the merchant, and the MERCHANT pays on delivery, both what the goods cost at the source and a reward for the
 * trouble. Nothing is printed: the merchant's own cash pays for all of it, and the job restocks a real shortage.
 *
 * Pure planning only: this decides which jobs exist. Moving goods and coins is done by Game, through the same
 * ledger-recording helpers as every other trade, so settlement to the chain needs nothing new.
 */
import { BASE_PRICE, type Item, type Merchant, type Source, type World } from '../../sim/world';

export interface Job {
  id: number;
  /** The merchant who wants the goods. */
  to: string;
  /** The goods, and where they are collected from (the source for that item). */
  item: Item;
  units: number;
  /** Coins the merchant pays you on delivery, on top of the goods' cost. */
  reward: number;
  /** What the goods cost at the source, per unit. The merchant pays this to the town on delivery. */
  unitCost: number;
  posted: number;
  /** In-game hour after which the job lapses and any cargo goes back. */
  expires: number;
}

export const JOB_TTL_HOURS = 48;
export const MAX_BOARD = 6;
export const MAX_UNITS = 5;

/** What a delivery pays: a small share of the goods' usual price per unit, plus a flat fee for the trouble. */
export const rewardFor = (item: Item, units: number) => units * Math.round(BASE_PRICE[item] * 0.1) + 30;

/** What the merchant must be able to pay on delivery, with a cushion so a job never leaves them broke. */
export const totalDue = (j: Pick<Job, 'units' | 'unitCost' | 'reward'>) => j.units * j.unitCost + j.reward;
const CUSHION = 200;

const open = (m: Merchant) => !m.owner && m.state !== 'closed';
/** How many units short of its target stock a merchant is. */
const shortfall = (m: Merchant, item: Item) => (m.target[item] ?? 0) * 0.95 - (m.stock[item] ?? 0);
const sourceOf = (w: World, item: Item): Source | undefined => w.sources.find((s) => s.item === item && s.cost > 0);

/** Can this job still be carried out right now? */
export function stillValid(w: World, j: Job): boolean {
  const m = w.merchants.find((x) => x.id === j.to);
  const src = sourceOf(w, j.item);
  if (!m || !src || !open(m) || w.hour >= j.expires) return false;
  return src.units >= j.units && m.cash >= totalDue(j) + CUSHION && shortfall(m, j.item) > 0;
}

/**
 * The board after this hour: jobs that are still valid stay, and new ones are added up to MAX_BOARD.
 * `nextId` hands out job numbers. Deterministic: the same world gives the same board.
 */
export function planBoard(w: World, current: Job[], nextId: () => number): Job[] {
  const board = current.filter((j) => stillValid(w, j));
  if (board.length >= MAX_BOARD) return board;
  const wants: { m: Merchant; item: Item; short: number }[] = [];
  for (const m of w.merchants) {
    if (!open(m)) continue;
    for (const item of Object.keys(m.target) as Item[]) {
      if (sourceOf(w, item) && shortfall(m, item) >= 2) wants.push({ m, item, short: shortfall(m, item) });
    }
  }
  wants.sort((a, b) => b.short - a.short || (a.m.id + a.item).localeCompare(b.m.id + b.item));
  for (const { m, item, short } of wants) {
    if (board.length >= MAX_BOARD) break;
    if (board.some((j) => j.to === m.id && j.item === item)) continue;
    const src = sourceOf(w, item)!;
    const units = Math.min(MAX_UNITS, Math.floor(short), Math.floor(src.units));
    if (units < 2) continue;
    const job: Job = { id: 0, to: m.id, item, units, reward: rewardFor(item, units), unitCost: src.cost, posted: w.hour, expires: w.hour + JOB_TTL_HOURS };
    if (m.cash < totalDue(job) + CUSHION) continue;
    board.push({ ...job, id: nextId() });
  }
  return board;
}
