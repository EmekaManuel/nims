import { MARKETS, MarketId, Player, World } from './world';

/**
 * The town council. Each market is run by its shareholders: they vote on two rules that change how the
 * economy behaves, and the change takes effect without anyone editing the game.
 *
 *   rent    what the market's merchants pay each hour. Above normal, the extra goes into the market's
 *           levy, which is paid to shareholders each evening (the merchants carry the cost).
 *   payout  how much of a day's profit a merchant shares out. Leaner keeps cash in the shop.
 *
 * A vote is weighted by your seats in that market: one for being a regular (you have traded there) and one per share you hold
 * in its merchants. The merchants themselves have
 * a seat each (a fixed weight) and always side against anything that costs them money, so shareholders
 * have to organise to push a change through. Proposals close at the end of the in-game day.
 */
export type Lever = 'rent' | 'payout';
export const LEVELS = { rent: ['low', 'normal', 'high'], payout: ['lean', 'normal', 'generous'] } as const;
export type RentLevel = (typeof LEVELS.rent)[number];
export type PayoutLevel = (typeof LEVELS.payout)[number];
export type Level = RentLevel | PayoutLevel;

/** Multiplier on the base hourly rent. Normal is exactly the old fixed rent. */
export const RENT_MULT: Record<RentLevel, number> = { low: 0.5, normal: 1, high: 2 };
/** Share of a day's profit paid out as dividends. Normal is the old fixed rate. */
export const PAYOUT_RATE: Record<PayoutLevel, number> = { lean: 0.2, normal: 0.3, generous: 0.5 };
/** The weight each open merchant's seat carries in a vote. */
export const MERCHANT_SEAT = 8;
/** A proposal stays open at least this many in-game hours, so everyone online gets a say. */
export const MIN_VOTING_HOURS = 6;

export const EFFECT: Record<Level, string> = {
  low: 'Merchants pay half the usual rent, so they keep more cash.',
  normal: 'Usual rent.',
  high: 'Merchants pay double rent. The extra is paid to shareholders each evening.',
  lean: 'Merchants share out a smaller part of their profit (20%) and keep the rest.',
  generous: 'Merchants share out more of their profit (50%), which leaves them less cash.',
};

export interface Proposal {
  lever: Lever;
  to: Level;
  by: string;
  byName: string;
  openedHour: number;
  closesHour: number;
  /** The id of this vote's proposal on the DAO that keeps the public record, once it has been recorded there. */
  daoId?: number;
  /** player id -> their vote, with the weight they held when they cast it. */
  votes: Record<string, { yes: boolean; weight: number }>;
}

export interface Council {
  rent: RentLevel;
  payout: PayoutLevel;
  /** Extra rent collected and not yet paid out to shareholders. */
  levy: number;
  proposal?: Proposal;
}
export type Councils = Record<MarketId, Council>;

export const newCouncils = (): Councils => ({
  produce: { rent: 'normal', payout: 'normal', levy: 0 },
  fabric: { rent: 'normal', payout: 'normal', levy: 0 },
  scrap: { rent: 'normal', payout: 'normal', levy: 0 },
  harbour: { rent: 'normal', payout: 'normal', levy: 0 },
});

const levelIndex = (lever: Lever, v: string) => (LEVELS[lever] as readonly string[]).indexOf(v);

/** Merchants that sit on the council: open, not player-run. */
export const seatedMerchants = (w: World, market: MarketId) => w.merchants.filter((m) => m.market === market && !m.owner && m.state !== 'closed');

/** A regular: someone who has traded with a merchant in this market. */
export function isRegular(w: World, market: MarketId, playerId: string): boolean {
  const p = w.players.find((x) => x.id === playerId);
  return !!p && w.merchants.some((m) => m.market === market && !m.owner && (p.reputation[m.id] ?? 0) > 0);
}

/**
 * Your say in a market: one seat for being a regular there, plus a seat for every share you hold in its merchants.
 * Shares are dear in an old town, so the seat for trading keeps a new player from being locked out of the vote.
 */
export function seatsOf(w: World, market: MarketId, playerId: string): number {
  const shares = w.merchants.filter((m) => m.market === market && !m.owner).reduce((n, m) => n + (m.shares[playerId] ?? 0), 0);
  return shares + (isRegular(w, market, playerId) ? 1 : 0);
}

/** Merchants want lower costs, so they back a cut and oppose anything that raises them. */
export const merchantsBack = (lever: Lever, current: Level, to: Level) => levelIndex(lever, to) < levelIndex(lever, current);

export interface Tally { yes: number; no: number; players: { yes: number; no: number }; merchants: { for: number; against: number } }

export function tally(w: World, market: MarketId, pr: Proposal): Tally {
  const c = w.council[market];
  let py = 0;
  let pn = 0;
  for (const v of Object.values(pr.votes)) v.yes ? (py += v.weight) : (pn += v.weight);
  const n = seatedMerchants(w, market).length;
  const backs = merchantsBack(pr.lever, c[pr.lever], pr.to);
  return {
    yes: py + (backs ? n * MERCHANT_SEAT : 0),
    no: pn + (backs ? 0 : n * MERCHANT_SEAT),
    players: { yes: py, no: pn },
    merchants: { for: backs ? n : 0, against: backs ? 0 : n },
  };
}

/** Next end of day at least MIN_VOTING_HOURS from now. */
export function closingHour(hour: number): number {
  let h = hour + MIN_VOTING_HOURS;
  while (h % 24 !== 23) h++;
  return h;
}

export function propose(w: World, p: Player, name: string, market: MarketId, lever: Lever, to: string): { error: string } | { ok: true } {
  if (!MARKETS[market]) return { error: 'No such market.' };
  if (lever !== 'rent' && lever !== 'payout') return { error: 'You can vote on rent or on payouts.' };
  if (levelIndex(lever, to) < 0) return { error: 'That is not one of the choices.' };
  const c = w.council[market];
  if (c[lever] === to) return { error: `${lever === 'rent' ? 'Rent' : 'Payout'} is already ${to}.` };
  if (c.proposal) return { error: `The ${MARKETS[market].name} council already has a vote open. Cast yours.` };
  const weight = seatsOf(w, market, p.id);
  if (weight < 1) return { error: `Trade in the ${MARKETS[market].name}, or hold a share in one of its merchants, to have a say there.` };
  c.proposal = { lever, to: to as Level, by: p.id, byName: name, openedHour: w.hour, closesHour: closingHour(w.hour), votes: { [p.id]: { yes: true, weight } } };
  return { ok: true };
}

export function vote(w: World, p: Player, market: MarketId, yes: boolean): { error: string } | { ok: true } {
  const c = w.council[market];
  if (!c) return { error: 'No such market.' };
  if (!c.proposal) return { error: 'There is nothing to vote on right now.' };
  const weight = seatsOf(w, market, p.id);
  if (weight < 1) return { error: `Trade in the ${MARKETS[market].name}, or hold a share in one of its merchants, to have a say there.` };
  c.proposal.votes[p.id] = { yes, weight };
  return { ok: true };
}

const label = (lever: Lever, to: string) => (lever === 'rent' ? `stall rent to ${to}` : `the payout to ${to}`);

/** End of day: close every vote that is due, apply the winners, and say what happened. */
export function resolveCouncils(w: World, note: (p: Player, text: string) => void) {
  for (const market of Object.keys(MARKETS) as MarketId[]) {
    const c = w.council[market];
    const pr = c.proposal;
    if (!pr || w.hour < pr.closesHour) continue;
    const t = tally(w, market, pr);
    const passed = t.yes > t.no;
    if (passed) (c as unknown as Record<Lever, Level>)[pr.lever] = pr.to;
    const name = MARKETS[market].name;
    const text = `The ${name} council ${passed ? 'voted to set' : 'turned down setting'} ${label(pr.lever, pr.to)} (${t.yes} for, ${t.no} against${t.merchants.for + t.merchants.against ? `; the merchants were ${t.merchants.for ? 'for' : 'against'}` : ''}).`;
    w.events.push({ hour: w.hour, type: 'council', text, decision: { market, lever: pr.lever, to: pr.to, passed, yes: t.yes, no: t.no, daoId: pr.daoId } });
    for (const id of Object.keys(pr.votes)) {
      const who = w.players.find((x) => x.id === id);
      if (who) note(who, text);
    }
    delete c.proposal;
  }
}
