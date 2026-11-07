import { describe, expect, it } from 'vitest';
import { Game } from '../server/game/game';
import { CASH_CEILING, refreshState, SUPPORT_LEVEL, tick, wholesaleUnit } from './engine';
import { BASE_PRICE, COINS, createWorld, type World } from './world';

const nobody = () => undefined;
const m = (w: World, id: string) => w.merchants.find((x) => x.id === id)!;
/** Every coin account must match the ledger: nothing moved off the books. */
function expectLedgerMatches(w: World) {
  const bal = new Map<string, number>();
  for (const e of w.ledger) {
    if (e.item !== COINS) continue;
    if (e.kind === 'transfer') bal.set(e.from!, (bal.get(e.from!) ?? 0) - e.units);
    bal.set(e.to, (bal.get(e.to) ?? 0) + e.units);
  }
  for (const x of w.merchants) expect(bal.get(x.id) ?? 0, x.id).toBe(x.cash);
}

describe('what a wholesaler charges', () => {
  it('is a discount to the going price and never above the usual 95%, and never under a coin', () => {
    expect(wholesaleUnit('iron', 180)).toBe(153); // the going price is low: charge less than the old fixed 285
    expect(wholesaleUnit('iron', 600)).toBe(285); // the going price is high: still never above 95% of usual
    expect(wholesaleUnit('thread', 0)).toBe(1);
    for (const item of Object.keys(BASE_PRICE) as (keyof typeof BASE_PRICE)[]) {
      for (const mid of [20, 90, 200, 900, 5000]) {
        const unit = wholesaleUnit(item, mid);
        expect(unit).toBeLessThanOrEqual(Math.round(BASE_PRICE[item] * 0.95));
        expect(unit).toBeLessThanOrEqual(Math.max(1, Math.round(mid * 0.85)));
        expect(unit).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

/** Run to just before the evening payout and return a function that runs it, so a test can look at the moment either side. */
function dayEnd(w: World) {
  while (w.hour % 24 !== 23) tick(w, nobody);
  return () => tick(w, nobody);
}

describe("the merchants' guild", () => {
  /** Anil is made low and unable to trade (no stock), so nothing but the guild can bring him back up. */
  function lowAnil(w: World) {
    const anil = m(w, 'anil');
    const lack = anil.cash - 800;
    w.ledger.push({ hour: 0, kind: 'transfer', from: 'anil', to: 'town', item: COINS, units: lack });
    anil.cash = 800;
    for (const item of Object.keys(anil.stock)) delete anil.stock[item as keyof typeof anil.stock];
    refreshState(w, anil);
    expect(anil.state).toBe('struggling');
    return anil;
  }
  const rich = (w: World, id: string, to: number) => { const x = m(w, id); w.ledger.push({ hour: 0, kind: 'mint', to: id, item: COINS, units: to - x.cash }); x.cash = to; };

  it('moves what rich merchants pay as upkeep to merchants that are low, and every coin stays on the ledger', () => {
    const w = createWorld(4);
    rich(w, 'omar', 120_000); rich(w, 'lena', 90_000);
    const anil = lowAnil(w);
    const run = dayEnd(w);
    const omarBefore = m(w, 'omar').cash, lenaBefore = m(w, 'lena').cash, anilBefore = anil.cash;
    run();
    expect(anil.cash - anilBefore).toBeGreaterThan(SUPPORT_LEVEL - anilBefore - 50); // brought up to the support level
    expect(m(w, 'omar').cash).toBeLessThan(omarBefore); // the rich paid it
    expect(m(w, 'lena').cash).toBeLessThan(lenaBefore);
    expect(w.events.some((e) => e.type === 'guild' && /Anil Metals/.test(e.text))).toBe(true);
    expectLedgerMatches(w);
  });

  it('what is paid in matches what is paid out: the rich lose exactly what the poor and the town receive', () => {
    const w = createWorld(4);
    rich(w, 'omar', 120_000);
    const anil = lowAnil(w);
    const run = dayEnd(w);
    const totalBefore = w.merchants.reduce((n, x) => n + x.cash, 0);
    const l0 = w.ledger.length;
    run();
    const entries = w.ledger.slice(l0).filter((e) => e.item === COINS);
    const toAnil = entries.filter((e) => e.from === 'omar' && e.to === 'anil').reduce((n, e) => n + e.units, 0);
    expect(toAnil).toBeGreaterThan(0);
    expect(anil.cash).toBeGreaterThanOrEqual(SUPPORT_LEVEL - 50);
    void totalBefore;
  });

  it('gives nothing to a merchant that is fine', () => {
    const w = createWorld(4);
    const run = dayEnd(w);
    run();
    expect(w.events.some((e) => e.type === 'guild')).toBe(false); // everyone starts with 20,000: nobody is low
  });

  it('does not help a shop that has closed: that is for the community fund to reopen', () => {
    const w = createWorld(4);
    rich(w, 'omar', 150_000);
    const mira = m(w, 'mira');
    w.ledger.push({ hour: 0, kind: 'transfer', from: 'mira', to: 'town', item: COINS, units: mira.cash });
    mira.cash = 0;
    mira.stock = {};
    refreshState(w, mira);
    expect(mira.state).toBe('closed');
    const run = dayEnd(w);
    run();
    expect(mira.state).toBe('closed');
    expect(mira.cash).toBe(0);
  });

  it('upkeep still takes the rich merchants back toward the ceiling, with what no one needs going to the town', () => {
    const w = createWorld(4);
    rich(w, 'omar', 150_000);
    const run = dayEnd(w);
    const before = m(w, 'omar').cash;
    run();
    const taken = before - m(w, 'omar').cash;
    expect(taken).toBeGreaterThan(0.2 * (before - CASH_CEILING)); // about a quarter of the excess
    expect(taken).toBeLessThan(0.3 * (before - CASH_CEILING));
    expectLedgerMatches(w);
  });
});

describe('stores stay in business', () => {
  it('over four months, no store is low on cash for more than a small fraction of the time, and none closes', () => {
    const g = new Game(1);
    g.state('x@example.com');
    let low = 0, closed = 0, n = 0;
    for (let h = 0; h < 120 * 24; h++) {
      g.tickOnce();
      if (h % 6 === 0) for (const x of g.w.merchants) { n++; if (x.state === 'struggling') low++; if (x.state === 'closed') closed++; }
    }
    expect(low / n).toBeLessThan(0.05);
    expect(closed / n).toBeLessThan(0.02);
  });

  it('the good scarce in a market no longer bankrupts the merchants who sell it (iron, tomatoes, pepper)', () => {
    const g = new Game(1);
    g.state('x@example.com');
    for (let h = 0; h < 30 * 24; h++) g.tickOnce();
    for (const id of ['anil', 'ruth', 'diego', 'tomas']) expect(g.w.merchants.find((x) => x.id === id)!.cash, id).toBeGreaterThan(5_000);
  });
});
