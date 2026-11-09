import { describe, it, expect } from 'vitest';
import { act, newPlayer } from './players';
import { contributeToFund, quoteFor, refreshState, sellToMerchant, tick, WARY_WINDOW } from './engine';
import { runWeek } from './run';
import { createWorld } from './world';

describe('Milestone 1 exit test', () => {
  it('flooding iron makes iron cheap', () => {
    const w = createWorld(7, [newPlayer('flooder', 'flooder', 60_000)]);
    const start = quoteFor(w, w.merchants.find((m) => m.id === 'ruth')!, 'iron').mid;
    for (let h = 0; h < 48; h++) tick(w, act);
    const end = quoteFor(w, w.merchants.find((m) => m.id === 'ruth')!, 'iron').mid;
    expect(end).toBeLessThan(start * 0.6);
  });

  it('flooding iron leaves other markets alone', () => {
    const w = createWorld(7, [newPlayer('flooder', 'flooder', 60_000)]);
    const tomato0 = quoteFor(w, w.merchants.find((m) => m.id === 'tomas')!, 'tomatoes').mid;
    for (let h = 0; h < 48; h++) tick(w, act);
    const tomato1 = quoteFor(w, w.merchants.find((m) => m.id === 'tomas')!, 'tomatoes').mid;
    expect(tomato1).toBeGreaterThan(tomato0 * 0.5);
  });

  it('a merchant can go broke and be revived by a community fund', () => {
    const investor = newPlayer('investor', 'investor', 40_000);
    const w = createWorld(3, [investor]);
    const m = w.merchants[0];
    m.cash = 0;
    m.stock = {};
    refreshState(w, m);
    expect(m.state).toBe('closed');
    expect(contributeToFund(w, investor, m, 6_000)).toBe(true);
    expect(m.state).toBe('closed'); // pool not full yet
    contributeToFund(w, investor, m, 6_000);
    expect(m.state).toBe('open');
    expect(m.cash).toBeGreaterThan(0);
    expect(w.events.some((e) => e.type === 'revived')).toBe(true);
  });

  it('a week is deterministic for a seed and runs fast', () => {
    const t = Date.now();
    const a = runWeek(5);
    const b = runWeek(5);
    expect(Date.now() - t).toBeLessThan(30_000);
    expect(a.history.length).toBe(168);
    expect(a.history[167].prices).toEqual(b.history[167].prices);
  });
});

describe('merchants notice being played off each other', () => {
  // anil, ruth and diego (Scrap & Hardware) all carry iron, so a shopper can play any two off against the third.
  const scrapTrio = (w: ReturnType<typeof createWorld>) => w.merchants.filter((m) => m.market === 'scrap' && !m.owner);

  it('selling the same good to two of them shows up as a worse price at a third', () => {
    const p = newPlayer('shopper', 'human', 10_000);
    const w = createWorld(4, [p]);
    const [a, b, c] = scrapTrio(w);
    p.inventory.iron = 10;
    const before = quoteFor(w, c, 'iron', p).buyPrice;
    sellToMerchant(w, p, a, 'iron', 1);
    sellToMerchant(w, p, b, 'iron', 1);
    const after = quoteFor(w, c, 'iron', p).buyPrice;
    expect(after).toBeLessThan(before);
  });

  it('selling to only one other merchant is half as wary as selling to two', () => {
    const p = newPlayer('shopper', 'human', 10_000);
    const w = createWorld(4, [p]);
    const [a, b, c] = scrapTrio(w);
    p.inventory.iron = 10;
    const none = quoteFor(w, c, 'iron', p).buyPrice;
    sellToMerchant(w, p, a, 'iron', 1);
    const one = quoteFor(w, c, 'iron', p).buyPrice;
    sellToMerchant(w, p, b, 'iron', 1);
    const two = quoteFor(w, c, 'iron', p).buyPrice;
    expect(one).toBeLessThan(none);
    expect(two).toBeLessThan(one);
  });

  it('never touches a different player or a different good', () => {
    const p = newPlayer('shopper', 'human', 10_000);
    const innocent = newPlayer('bystander', 'human', 10_000);
    const w = createWorld(4, [p, innocent]);
    const [a, b, c] = scrapTrio(w);
    p.inventory.iron = 10;
    p.inventory.timber = 10;
    const baseline = quoteFor(w, c, 'iron', innocent).buyPrice;
    const otherGood = quoteFor(w, c, 'timber', p).buyPrice;
    sellToMerchant(w, p, a, 'iron', 1);
    sellToMerchant(w, p, b, 'iron', 1);
    expect(quoteFor(w, c, 'iron', innocent).buyPrice).toBe(baseline); // the bystander isn't tarred by it
    expect(quoteFor(w, c, 'timber', p).buyPrice).toBe(otherGood); // nor is a good the shopper never moved around
  });

  it('fades once the shopping-around is outside the window', () => {
    const p = newPlayer('shopper', 'human', 10_000);
    const w = createWorld(4, [p]);
    const [a, b, c] = scrapTrio(w);
    p.inventory.iron = 10;
    const before = quoteFor(w, c, 'iron', p).buyPrice;
    sellToMerchant(w, p, a, 'iron', 1);
    sellToMerchant(w, p, b, 'iron', 1);
    expect(quoteFor(w, c, 'iron', p).buyPrice).toBeLessThan(before);
    w.hour += WARY_WINDOW;
    expect(quoteFor(w, c, 'iron', p).buyPrice).toBe(before);
  });
});
