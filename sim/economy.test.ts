import { describe, it, expect } from 'vitest';
import { Game } from '../server/game';
import { act, newPlayer } from './players';
import { tick } from './engine';
import { DEFAULT_PARAMS, runFastForward } from './fastforward';
import { BASE_PRICE, CARRY_VALUE, createSources, createWorld, Item } from './world';

/**
 * Economy health. These guard the balance work: goods are not free, a first trip is not a fortune, the
 * market doesn't collapse into a glut or blow up into scarcity, and simulated traders act like traders.
 */
describe('goods are not free', () => {
  it('farms and scrap spots charge a wholesale price well under the usual price', () => {
    for (const s of createSources().filter((x) => x.item !== 'cotton')) {
      const rate = s.cost / BASE_PRICE[s.item];
      expect(rate, s.item).toBeGreaterThan(0.3);
      expect(rate, s.item).toBeLessThan(0.8);
    }
  });

  it('carried goods count in net worth at 80% of the usual price, so collecting is not instant profit', () => {
    const g = new Game(3);
    g.state('a@x.io');
    const p = g.w.players.find((x) => x.strategy === 'human')!;
    p.cash = 0;
    p.inventory = { iron: 10 };
    expect(g.state('a@x.io').you.netWorth).toBe(Math.round(10 * BASE_PRICE.iron * CARRY_VALUE));
  });
});

describe('a first trip is worth something, not a fortune', () => {
  it('buying a load at the best source and selling it nearby changes your net worth by a modest amount', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = new Game(seed);
      const me = 'a@x.io';
      g.state(me);
      const start = g.state(me).you.cash;
      // buy the load with the best margin, then sell it in lots of 8 to whoever pays most (as a player would)
      const s = g.state(me);
      const best = s.sources
        .filter((x) => x.item !== 'cotton')
        .map((src) => ({ src, price: Math.max(0, ...s.stalls.flatMap((st) => st.offers.filter((o) => o.item === src.item && o.willBuy).map((o) => o.buyPrice))) }))
        .sort((a, b) => (b.price - b.src.cost) / b.src.cost - (a.price - a.src.cost) / a.src.cost)[0];
      g.gather(me, best.src.item as Item);
      for (let i = 0; i < 4; i++) {
        const now = g.state(me);
        const carry = now.you.inventory[0];
        if (!carry) break;
        const stall = now.stalls.flatMap((st) => st.offers.filter((o) => o.item === carry.item && o.willBuy).map((o) => ({ st, o }))).sort((a, b) => b.o.buyPrice - a.o.buyPrice)[0];
        if (stall) g.sell(me, stall.st.id, carry.item as Item, Math.min(8, carry.units));
      }
      const gain = g.state(me).you.netWorth - start;
      expect(gain, `seed ${seed}`).toBeLessThan(start * 0.5); // the old free-goods economy made +300% on the first trip
      expect(gain, `seed ${seed}`).toBeGreaterThan(-start * 0.3); // and a careless trip can lose some, but not everything
    }
  });
});

describe('the market is healthy on its own', () => {
  it('with no human and no saboteur, every good averages near its usual price over a week', () => {
    for (const seed of [1, 2, 3]) {
      const r = runFastForward({ ...DEFAULT_PARAMS, seed, flooder: false });
      for (const { item, base } of r.items) {
        const v = r.prices[item].slice(24); // skip the first day while things settle
        const avg = v.reduce((a, b) => a + b, 0) / v.length / base;
        expect(avg, `${item} seed ${seed}`).toBeGreaterThan(0.6); // not a permanent glut (a worked good settles near cost plus a margin)
        expect(avg, `${item} seed ${seed}`).toBeLessThan(1.7); // and not permanent scarcity
      }
    }
  });

  it('a flooder still crashes iron even though goods now cost money, because it is bankrolled', () => {
    const r = runFastForward({ ...DEFAULT_PARAMS, seed: 1, flooder: true });
    expect(Math.min(...r.prices.iron) / BASE_PRICE.iron).toBeLessThan(0.6);
  });
});

describe('simulated gatherers act like traders', () => {
  it('stay home when the price is below what the goods cost, instead of dumping a glut', () => {
    const p = newPlayer('gatherer-1', 'gatherer');
    const w = createWorld(7, [p]);
    // Every stall is stuffed with goods, so every price sits on the floor.
    for (const m of w.merchants) for (const item of Object.keys(m.target) as (keyof typeof m.stock)[]) m.stock[item] = (m.target[item] ?? 0) * 6;
    const cash = p.cash;
    for (let h = 0; h < 9; h++) tick(w, act); // while prices are still on the floor (the town slowly works the stock off)
    expect(p.lastGatherHour).toBeUndefined();
    expect(p.cash).toBe(cash);
    expect(Object.values(p.inventory).reduce((a, b) => a + (b ?? 0), 0)).toBe(0);
  });

  it('go back to work once the glut has cleared and the trip pays again', () => {
    const p = newPlayer('gatherer-1', 'gatherer');
    const w = createWorld(7, [p]);
    for (const m of w.merchants) for (const item of Object.keys(m.target) as (keyof typeof m.stock)[]) m.stock[item] = (m.target[item] ?? 0) * 6;
    for (let h = 0; h < 48; h++) tick(w, act);
    expect(p.lastGatherHour).toBeDefined();
  });

  it('do work when the trip pays', () => {
    const p = newPlayer('gatherer-1', 'gatherer');
    const w = createWorld(7, [p]);
    for (let h = 0; h < 24; h++) tick(w, act);
    expect(p.lastGatherHour).toBeDefined();
  });
});
