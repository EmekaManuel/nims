import { describe, it, expect } from 'vitest';
import { PERSONALITY_PARAMS } from '../merchants/pricing';
import { quoteFor } from './engine';
import { describePlan, MARGIN_MAX, MARGIN_MIN, paramsOf, samePlan, targetOf } from './plan';
import { createWorld } from './world';

const merchant = (id: string) => { const w = createWorld(1); return { w, m: w.merchants.find((x) => x.id === id)! }; };

describe('a merchant plan steers within bounds', () => {
  it('no plan: exactly the usual target and personality', () => {
    const { m } = merchant('lena');
    expect(targetOf(m, 'cotton')).toBe(m.target.cotton);
    expect(paramsOf(m)).toBe(PERSONALITY_PARAMS[m.personality]);
  });

  it('more or less stock moves the target by a fixed step, and only for that good', () => {
    const { m } = merchant('lena');
    m.plan = { day: 1, stock: { cotton: 'more', thread: 'less' }, margin: 'same', reason: '' };
    expect(targetOf(m, 'cotton')).toBe(Math.round(m.target.cotton! * 1.3));
    expect(targetOf(m, 'thread')).toBe(Math.round(m.target.thread! * 0.75));
  });

  it('a margin choice moves the margin a little and never past its bounds', () => {
    const { m } = merchant('omar'); // cautious: 15%
    m.plan = { day: 1, stock: {}, margin: 'wider', reason: '' };
    expect(paramsOf(m).margin).toBeCloseTo(0.18);
    m.plan.margin = 'narrower';
    expect(paramsOf(m).margin).toBeCloseTo(0.12);
    for (const p of Object.values(PERSONALITY_PARAMS)) {
      expect(Math.min(MARGIN_MAX, p.margin + 0.03)).toBeLessThanOrEqual(MARGIN_MAX);
      expect(Math.max(MARGIN_MIN, p.margin - 0.03)).toBeGreaterThanOrEqual(MARGIN_MIN);
    }
  });

  it('wanting more of a good it is short of makes the merchant pay more for it; a wider margin widens the spread', () => {
    const { w, m } = merchant('lena');
    m.stock.cotton = 20;
    const before = quoteFor(w, m, 'cotton');
    m.plan = { day: 1, stock: { cotton: 'more' }, margin: 'same', reason: '' };
    expect(quoteFor(w, m, 'cotton').buyPrice).toBeGreaterThan(before.buyPrice);
    m.plan = { day: 1, stock: {}, margin: 'wider', reason: '' };
    const q = quoteFor(w, m, 'cotton');
    expect(q.sellPrice - q.buyPrice).toBeGreaterThan(before.sellPrice - before.buyPrice);
  });

  it('describes a plan plainly, and tells when two plans steer the same way', () => {
    expect(describePlan({ cotton: 'more' }, 'wider')).toBe("Today I'm holding more cotton, pricing with a wider margin.");
    expect(describePlan({}, 'same')).toBe('Keeping to my usual stock and prices today.');
    const a = { day: 1, stock: { cotton: 'more' as const }, margin: 'same' as const, reason: 'x' };
    expect(samePlan(a, { ...a, day: 2, reason: 'y' })).toBe(true);
    expect(samePlan(a, { ...a, stock: {} })).toBe(false);
    expect(samePlan(undefined, a)).toBe(false);
  });
});
