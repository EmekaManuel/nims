import { describe, it, expect } from 'vitest';
import { quote, merchantState, PERSONALITY_PARAMS, MIN_MULT, MAX_MULT, QuoteInput } from './pricing';

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
