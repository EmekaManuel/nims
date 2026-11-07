import { describe, expect, it } from 'vitest';
import { Game } from '../server/game/game';
import { buyShares, sharePrice, CASH_CEILING } from './engine';
import { COINS } from './world';

const days = (g: Game, n: number) => { while (g.w.hour < n * 24) g.tickOnce(); };
const me = 'ada@example.com';

describe('a share stays affordable as the town ages', () => {
  it('after four months a share costs about what it did in the first weeks, not ten times more', () => {
    const g = new Game(1);
    g.state(me);
    const omar = g.w.merchants.find((m) => m.id === 'omar')!;
    const start = sharePrice(omar);
    days(g, 30);
    const month = sharePrice(omar);
    days(g, 120);
    const end = sharePrice(omar);
    expect(end).toBeLessThan(start * 2.5);
    expect(Math.abs(end - month) / month).toBeLessThan(0.25); // settled, not still climbing
    for (const m of g.w.merchants) expect(sharePrice(m)).toBeLessThan(2_000);
  });

  it('merchants do not pile up cash without limit', () => {
    const g = new Game(1);
    g.state(me);
    days(g, 120);
    for (const m of g.w.merchants) expect(m.cash).toBeLessThan(CASH_CEILING * 3);
  });

  it('shareholders are still paid dividends the whole time', () => {
    const g = new Game(1);
    g.state(me);
    const p = g.w.players[g.w.players.length - 1];
    p.cash = 100_000;
    const lena = g.w.merchants.find((m) => m.id === 'lena')!;
    buyShares(g.w, p, lena, 10);
    days(g, 90);
    const paid = p.notes.filter((n) => /dividends/.test(n.text));
    expect(paid.length).toBeGreaterThan(10); // most evenings over three months
    const lateOnes = paid.filter((n) => n.hour > 60 * 24);
    expect(lateOnes.length).toBeGreaterThan(3); // not just at the start: the upkeep leaves the profit alone
  });

  it('upkeep takes a quarter of the cash above the ceiling at day end, and every coin stays on the ledger', () => {
    const g = new Game(1);
    g.state(me);
    const omar = g.w.merchants.find((m) => m.id === 'omar')!;
    omar.cash += 80_000; // a merchant far above the ceiling
    g.w.ledger.push({ hour: 0, kind: 'mint', to: 'omar', item: COINS, units: 80_000 }); // so the books still explain it
    days(g, 1); // a short run: the game trims old ledger history later, so only a short replay can be checked
    // 20,000 + 80,000 is 60,000 over the ceiling, so 15,000 goes: about 90,000 even after a day's trading (without upkeep it would be 100,000 or more)
    expect(omar.cash).toBeLessThan(95_000);
    expect(omar.cash).toBeGreaterThan(CASH_CEILING); // but one day does not take it all
    const bal = new Map<string, number>();
    for (const e of g.w.ledger) {
      if (e.item !== COINS) continue;
      if (e.kind === 'transfer') bal.set(e.from!, (bal.get(e.from!) ?? 0) - e.units);
      bal.set(e.to, (bal.get(e.to) ?? 0) + e.units);
    }
    for (const m of g.w.merchants) expect(bal.get(m.id) ?? 0, m.id).toBe(m.cash);
  });
});
