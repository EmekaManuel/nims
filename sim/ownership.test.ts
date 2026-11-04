import { describe, it, expect } from 'vitest';
import { act, newPlayer } from './players';
import {
  buyShares, contributeToFund, merchantWorth, openOwnerStall, ownerStallOf, publicSharesLeft, quoteFor,
  refreshState, sellShares, sharePrice, sharesHeld, tick,
} from './engine';
import { createWorld, MAX_PUBLIC_SHARES, Merchant, Player, World } from './world';

function setup(cash = 50_000): { w: World; p: Player; m: Merchant } {
  const p = newPlayer('ada', 'human', cash);
  const w = createWorld(4, [p]);
  return { w, p, m: w.merchants.find((x) => x.id === 'anil')! };
}
const close = (w: World, m: Merchant) => { m.cash = 0; m.stock = {}; refreshState(w, m); };

describe('shares', () => {
  it('a share is 1% of what the merchant is worth, and the money goes into their till', () => {
    const { w, p, m } = setup();
    const price = sharePrice(m);
    expect(price).toBe(Math.round(merchantWorth(m) / 100));
    const tillBefore = m.cash;
    const r = buyShares(w, p, m, 10);
    expect(r).toEqual({ cost: price * 10 });
    expect(p.cash).toBe(50_000 - price * 10);
    expect(m.cash).toBe(tillBefore + price * 10);
    expect(m.shares.ada).toBe(10);
  });

  it('caps what players can hold at 49%, so a merchant is never taken over', () => {
    const { w, p, m } = setup(10_000_000);
    expect('error' in buyShares(w, p, m, MAX_PUBLIC_SHARES + 1)).toBe(true);
    expect('cost' in buyShares(w, p, m, MAX_PUBLIC_SHARES)).toBe(true);
    expect(publicSharesLeft(m)).toBe(0);
    expect(buyShares(w, newPlayer('bo', 'human', 1e9), m, 1)).toMatchObject({ error: expect.stringContaining('No shares left') });
  });

  it('refuses closed shops, bad amounts, and shares you cannot afford', () => {
    const { w, p, m } = setup(100);
    expect('error' in buyShares(w, p, m, 5)).toBe(true); // too dear for 100 coins
    expect('error' in buyShares(w, p, m, 0)).toBe(true);
    expect('error' in buyShares(w, p, m, 1.5)).toBe(true);
    close(w, m);
    expect(buyShares(w, p, m, 1)).toMatchObject({ error: expect.stringContaining('closed') });
  });

  it('selling back pays the current price and needs the merchant to afford it', () => {
    const { w, p, m } = setup();
    buyShares(w, p, m, 10);
    const cash = p.cash;
    expect('proceeds' in sellShares(w, p, m, 4)).toBe(true);
    expect(p.cash).toBeGreaterThan(cash);
    expect(m.shares.ada).toBe(6);
    expect('error' in sellShares(w, p, m, 7)).toBe(true); // only holds 6
    m.cash = 0;
    expect(sellShares(w, p, m, 6)).toMatchObject({ error: expect.stringContaining("can't afford") });
  });
});

describe('dividends', () => {
  /** Jump to the last hour of a day and tick, which pays out. */
  const endOfDay = (w: World) => { w.hour = 23; tick(w, act); };

  it('pays shareholders a cut of the day’s profit', () => {
    const { w, p, m } = setup();
    m.shares.ada = 20;
    m.cash = 30_000;
    m.dayStartWorth = merchantWorth(m) - 5_000; // a 5,000 coins day
    const before = p.cash;
    endOfDay(w);
    const got = p.cash - before;
    expect(got).toBeGreaterThan(0);
    expect(got).toBeLessThanOrEqual(Math.ceil(5_500 * 0.3 * 0.2)); // 30% of profit, 20% of it to this holder
    expect(p.notes.some((n) => n.text.includes('dividends'))).toBe(true);
    expect(w.events.some((e) => e.type === 'dividend')).toBe(true);
  });

  it('pays nothing on a losing day', () => {
    const { w, p, m } = setup();
    m.shares.ada = 20;
    m.dayStartWorth = merchantWorth(m) + 50_000;
    const before = p.cash;
    endOfDay(w);
    expect(p.cash).toBe(before);
  });

  it('never pays out below the safety cushion, even on a big day', () => {
    const { w, p, m } = setup();
    m.shares.ada = 40;
    m.dayStartWorth = merchantWorth(m) - 100_000;
    m.cash = m.cashFloor; // right at the floor: nothing spare
    const before = p.cash;
    endOfDay(w);
    expect(p.cash).toBe(before);
    expect(m.cash).toBeGreaterThanOrEqual(0);
  });

  it('does not treat your own investment as profit', () => {
    const { w, p, m } = setup(1_000_000);
    m.dayStartWorth = merchantWorth(m); // start of day
    buyShares(w, p, m, 40);
    const invested = p.cash;
    endOfDay(w);
    // any dividend would be tiny next to the ~25,000 coins just invested
    expect(p.cash - invested).toBeLessThan(500);
  });
});

describe('fund', () => {
  it('reopens a closed shop, puts contributors on its sign, and makes them shareholders', () => {
    const a = newPlayer('ada', 'human', 20_000);
    const b = newPlayer('bo', 'human', 20_000);
    const w = createWorld(5, [a, b]);
    const m = w.merchants.find((x) => x.id === 'mira')!;
    close(w, m);
    expect(m.state).toBe('closed');

    expect(contributeToFund(w, a, m, 8_000)).toBe(true);
    expect(m.state).toBe('closed'); // pool not full yet
    expect(contributeToFund(w, b, m, 4_000)).toBe(true);

    expect(m.state).toBe('open');
    expect(m.cash).toBeGreaterThan(0);
    expect(m.sign.sort()).toEqual(['ada', 'bo']);
    expect(m.shares.ada).toBe(Math.floor((MAX_PUBLIC_SHARES * 8_000) / 12_000)); // 32
    expect(m.shares.bo).toBe(Math.floor((MAX_PUBLIC_SHARES * 4_000) / 12_000)); // 16
    expect(sharesHeld(m)).toBeLessThanOrEqual(MAX_PUBLIC_SHARES);
    expect(a.notes.some((n) => n.text.includes('fund'))).toBe(true);
    expect(a.cash).toBe(12_000);
  });

  it('only closed shops take fund money', () => {
    const { w, p, m } = setup();
    expect(contributeToFund(w, p, m, 1_000)).toBe(false);
  });
});

describe('player-owned stall', () => {
  it('uses the owner’s own prices, says so in the tooltip, and never closes', () => {
    const { w, p } = setup();
    const s = openOwnerStall(w, p, 'fabric', 'Ada');
    s.prices!.lace = { buy: 1100, sell: 1900 };
    const q = quoteFor(w, s, 'lace');
    expect([q.buyPrice, q.sellPrice]).toEqual([1100, 1900]);
    expect(q.tooltip).toContain('Ada sets these prices by hand');
    refreshState(w, s);
    expect(s.state).toBe('open'); // no cash, no stock, still open
    expect(ownerStallOf(w, p)).toBe(s);
  });

  it('agent merchants sell their surplus to a stall that pays well', () => {
    const { w, p } = setup();
    const s = openOwnerStall(w, p, 'fabric', 'Ada');
    s.cash = 20_000;
    s.prices!.cotton = { buy: 900, sell: 1500 };
    for (const id of ['lena', 'omar']) w.merchants.find((m) => m.id === id)!.stock.cotton = 80; // well over target
    tick(w, act);
    expect(s.stock.cotton ?? 0).toBeGreaterThan(0);
    expect(s.cash).toBeLessThan(20_000);
    expect(w.ledger.some((e) => e.kind === 'transfer' && e.to === s.id)).toBe(true);
    expect(p.notes.some((n) => n.text.includes('sold') && n.text.includes('cotton'))).toBe(true);
  });

  it('agent merchants buy from a stall that undercuts them', () => {
    const { w, p } = setup();
    const s = openOwnerStall(w, p, 'fabric', 'Ada');
    s.stock.thread = 40;
    s.prices!.thread = { buy: 30, sell: 40 }; // far below the ~100 coins market
    const nk = w.merchants.find((m) => m.id === 'lena')!;
    nk.stock.thread = 20; // room on the shelf
    const cash = s.cash;
    tick(w, act);
    expect(s.cash).toBeGreaterThan(cash);
    expect(p.notes.some((n) => n.text.includes('bought'))).toBe(true);
  });

  it('merchants only trade with stalls in their own market', () => {
    const { w, p } = setup();
    const s = openOwnerStall(w, p, 'produce', 'Ada');
    s.cash = 20_000;
    s.prices!.flour = { buy: 900, sell: 1500 };
    for (const id of ['tomas', 'june']) w.merchants.find((m) => m.id === id)!.stock.flour = 500; // produce merchants, big surplus
    // give a merchant elsewhere the same temptation: it must be ignored
    const outsider = w.merchants.find((m) => m.id === 'omar')!;
    outsider.target.flour = 10;
    outsider.stock.flour = 500;
    tick(w, act);
    const from = w.ledger.filter((e) => e.kind === 'transfer' && e.to === s.id).map((e) => e.from);
    expect(from.length).toBeGreaterThan(0); // the produce merchants did trade
    expect(from.every((f) => ['tomas', 'june'].includes(f!))).toBe(true); // and only they
  });
});


describe('a fast-forwarded week with an investor', () => {
  it('the investor takes a stake in every market and is paid dividends for it', async () => {
    const { runWeek } = await import('./run');
    const w = runWeek(1);
    const inv = w.players.find((p) => p.id === 'investor')!;
    const stakes = w.merchants.filter((m) => !m.owner && (m.shares.investor ?? 0) > 0);
    expect(new Set(stakes.map((m) => m.market)).size).toBe(3);
    expect(w.events.some((e) => e.type === 'dividend')).toBe(true);
    expect(inv.notes.some((n) => n.text.includes('dividends'))).toBe(true);
    for (const m of w.merchants) expect(sharesHeld(m)).toBeLessThanOrEqual(MAX_PUBLIC_SHARES);
  });
});
