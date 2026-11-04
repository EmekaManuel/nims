import { describe, it, expect } from 'vitest';
import { quote, merchantState, PERSONALITY_PARAMS, MIN_MULT, MAX_MULT, QuoteInput, playerQuote, clampPlayerPrice } from './pricing';

const base: QuoteInput = {
  itemName: 'iron',
  basePrice: 300,
  stock: 50,
  targetStock: 50,
  cash: 10_000,
  cashFloor: 500,
  recentBuys: 0,
  recentSells: 0,
  window: 24,
  params: PERSONALITY_PARAMS.loyal,
};

describe('pricing', () => {
  it('is pure: same inputs, same output', () => {
    expect(quote(base)).toEqual(quote({ ...base }));
  });

  it('flooding lowers buy prices (stock above target)', () => {
    const calm = quote(base).buyPrice;
    const flooded = quote({ ...base, stock: 140, recentSells: 40 }).buyPrice;
    expect(flooded).toBeLessThan(calm);
  });

  it('scarcity raises prices (stock below target)', () => {
    expect(quote({ ...base, stock: 10 }).sellPrice).toBeGreaterThan(quote(base).sellPrice);
  });

  it('clamps hold at both ends', () => {
    const floor = quote({ ...base, stock: 100_000, recentSells: 10_000 });
    expect(floor.mid).toBe(base.basePrice * MIN_MULT);
    const ceil = quote({ ...base, stock: 1, targetStock: 100_000 });
    expect(ceil.mid).toBe(base.basePrice * MAX_MULT);
  });

  it('cash floor stops buying', () => {
    const q = quote({ ...base, cash: 100 });
    expect(q.willBuy).toBe(false);
    expect(q.maxBuyUnits).toBe(0);
    expect(quote(base).willBuy).toBe(true);
  });

  it('a broke merchant with no stock closes; one with low cash struggles', () => {
    expect(merchantState(0, 500, 0)).toBe('closed');
    expect(merchantState(100, 500, 20)).toBe('struggling');
    expect(merchantState(5000, 500, 20)).toBe('open');
  });

  it('greedy reacts harder to scarcity than cautious (params only)', () => {
    const scarce = { ...base, stock: 10 };
    const g = quote({ ...scarce, params: PERSONALITY_PARAMS.greedy }).mid;
    const c = quote({ ...scarce, params: PERSONALITY_PARAMS.cautious }).mid;
    expect(g).toBeGreaterThan(c);
  });

  it('loyal merchants discount regulars', () => {
    const stranger = quote({ ...base, reputation: 0 });
    const regular = quote({ ...base, reputation: 1 });
    expect(regular.sellPrice).toBeLessThan(stranger.sellPrice);
    expect(regular.buyPrice).toBeGreaterThan(stranger.buyPrice);
  });

  it('explains itself in plain English', () => {
    const q = quote({ ...base, stock: 140, targetStock: 50 });
    expect(q.tooltip).toContain('holding 140 iron');
    expect(q.tooltip).toContain('only want 50');
  });
});

describe('player-set prices', () => {
  const base = { itemName: 'lace', basePrice: 1500, buyPrice: 1200, sellPrice: 1800, stock: 5, cash: 10_000, ownerName: 'Ada' };

  it('uses exactly the prices the player chose, and says who set them', () => {
    const q = playerQuote(base);
    expect([q.buyPrice, q.sellPrice]).toEqual([1200, 1800]);
    expect(q.tooltip).toContain('Ada sets these prices by hand');
    expect(q.willBuy && q.willSell).toBe(true);
  });

  it('keeps absurd prices inside the same band as the merchants', () => {
    expect(clampPlayerPrice(1, 1500)).toBe(1500 * MIN_MULT);
    expect(clampPlayerPrice(10_000_000, 1500)).toBe(1500 * MAX_MULT);
    const q = playerQuote({ ...base, buyPrice: 1, sellPrice: 99_999_999 });
    expect(q.buyPrice).toBe(1500 * MIN_MULT);
    expect(q.sellPrice).toBe(1500 * MAX_MULT);
  });

  it('never sells for less than it buys', () => {
    const q = playerQuote({ ...base, buyPrice: 1600, sellPrice: 1300 });
    expect(q.sellPrice).toBeGreaterThanOrEqual(q.buyPrice);
  });

  it('stops buying when the till is empty and stops selling when the shelf is bare', () => {
    expect(playerQuote({ ...base, cash: 100 }).willBuy).toBe(false);
    expect(playerQuote({ ...base, stock: 0 }).willSell).toBe(false);
    expect(playerQuote({ ...base, cash: 100 }).tooltip).toContain("can't buy lace");
  });

  it('is pure', () => {
    expect(playerQuote(base)).toEqual(playerQuote({ ...base }));
  });
});
