/**
 * "Fast-forward a week" (DESIGN.md §5): run the headless economy and return everything a dashboard
 * needs to replay it. This calls the same engine, and so the same merchants/pricing.ts, as the live
 * game. There is no second copy of the economy.
 */
import { act, newPlayer } from './players';
import { playerWorth, tick } from './engine';
import { BASE_PRICE, createWorld, Item, MARKETS, MarketId } from './world';

export interface FastForwardParams {
  days: number;
  seed: number;
  gatherers: number;
  arbitrageur: boolean;
  investor: boolean;
  flooder: boolean;
}

export const DEFAULT_PARAMS: FastForwardParams = { days: 7, seed: 1, gatherers: 3, arbitrageur: true, investor: true, flooder: true };

/** Clean up whatever came over the wire. Unknown or out-of-range values fall back to safe ones. */
export function sanitize(input: unknown): FastForwardParams {
  const b = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  // Only real numbers or numeric strings count; null, '', booleans and objects fall back to the default.
  const isNum = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v));
  const int = (v: unknown, lo: number, hi: number, d: number) => (isNum(v) ? Math.min(hi, Math.max(lo, Math.floor(Number(v)))) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    days: int(b.days, 1, 14, DEFAULT_PARAMS.days),
    seed: int(b.seed, 0, 999_999, DEFAULT_PARAMS.seed),
    gatherers: int(b.gatherers, 0, 6, DEFAULT_PARAMS.gatherers),
    arbitrageur: bool(b.arbitrageur, DEFAULT_PARAMS.arbitrageur),
    investor: bool(b.investor, DEFAULT_PARAMS.investor),
    flooder: bool(b.flooder, DEFAULT_PARAMS.flooder),
  };
}

const LABEL: Record<string, string> = { arbitrageur: 'Arbitrageur', investor: 'Investor', flooder: 'Market flooder' };

export function runFastForward(params: FastForwardParams) {
  const players = [
    ...Array.from({ length: params.gatherers }, (_, i) => newPlayer(`gatherer-${i + 1}`, 'gatherer')),
    ...(params.arbitrageur ? [newPlayer('arbitrageur', 'arbitrageur', 8_000)] : []),
    ...(params.investor ? [newPlayer('investor', 'investor', 40_000)] : []),
    // The flooder is a bankrolled saboteur: it dumps goods whatever they cost, so it needs deep pockets.
    ...(params.flooder ? [newPlayer('flooder', 'flooder', 60_000)] : []),
  ];
  const w = createWorld(params.seed, players);
  const hours = params.days * 24;
  const start = Object.fromEntries(players.map((p) => [p.id, playerWorth(w, p)]));
  const worth: Record<string, number[]> = Object.fromEntries(players.map((p) => [p.id, []]));
  for (let h = 0; h < hours; h++) {
    tick(w, act);
    for (const p of players) worth[p.id].push(playerWorth(w, p));
  }

  // Prices as a share of the usual price (100 = usual), so 120 coins tomatoes and 1,500 coins lace share one axis.
  const items = (Object.keys(MARKETS) as MarketId[]).flatMap((market) => MARKETS[market].items.map((item) => ({ item, market, base: BASE_PRICE[item] })));
  const prices: Record<string, number[]> = {};
  for (const { item, market } of items) {
    let last = BASE_PRICE[item];
    prices[item] = w.history.map((snap) => (last = snap.prices[`${market}:${item}`] ?? last));
  }
  const cash: Record<string, number[]> = Object.fromEntries(w.merchants.map((m) => [m.id, w.history.map((s) => s.cash[m.id] ?? 0)]));

  const shocks = w.events.filter((e) => e.type === 'shock').map((e) => ({ kind: e.shock!, start: e.hour, end: Math.min(hours, e.hour + (e.length ?? 0)) }));
  const closures = w.events.filter((e) => e.type === 'state' && e.to === 'closed').map((e) => ({ hour: e.hour, merchant: e.merchant!, text: e.text }));
  const revivals = w.events.filter((e) => e.type === 'revived').map((e) => ({ hour: e.hour, merchant: e.merchant!, text: e.text }));
  const dividends = w.events.filter((e) => e.type === 'dividend').map((e) => ({ hour: e.hour, merchant: e.merchant!, amount: e.amount ?? 0 }));

  // A few plain sentences about what stood out.
  const highlights: string[] = [];
  const low = items
    .map(({ item, base }) => {
      const series = prices[item];
      const i = series.reduce((best, v, k) => (v < series[best] ? k : best), 0);
      return { item, pct: Math.round((series[i] / base) * 100), hour: i };
    })
    .sort((a, b) => a.pct - b.pct)[0];
  if (low && low.pct < 85) highlights.push(`${cap(low.item)} fell to ${low.pct}% of its usual price on day ${Math.floor(low.hour / 24) + 1}.`);
  if (closures.length) highlights.push(`${closures.length === 1 ? 'A shop' : `${closures.length} shops`} ran out of cash and closed${revivals.length ? `; ${revivals.length} reopened thanks to community funds` : ''}.`);
  else highlights.push('Every shop stayed open all week.');
  const paid = dividends.reduce((a, d) => a + d.amount, 0);
  if (paid > 0) highlights.push(`Shareholders were paid ${paid.toLocaleString('en-US')} coins in dividends.`);
  if (shocks.length) highlights.push(`${shocks.length} shocks hit the district: ${[...new Set(shocks.map((s) => s.kind))].join(', ')}.`);

  return {
    params,
    hours,
    items,
    prices,
    merchants: w.merchants.map((m) => ({ id: m.id, name: m.name, market: m.market })),
    cash,
    shocks,
    closures,
    revivals,
    dividends,
    players: players.map((p) => ({
      id: p.id,
      label: p.strategy === 'gatherer' ? `Gatherer ${p.id.split('-')[1]}` : LABEL[p.strategy],
      strategy: p.strategy,
      start: start[p.id],
      worth: worth[p.id],
    })),
    highlights,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export type FastForwardResult = ReturnType<typeof runFastForward>;
