import { describe, it, expect } from 'vitest';
import { rankOf, RANKS } from './rank';

describe('rank', () => {
  it('starts as a street vendor and climbs with net worth', () => {
    expect(rankOf(0)).toMatchObject({ level: 1, title: 'Street vendor', progress: 0 });
    expect(rankOf(3_000).progress).toBeCloseTo(0.5, 2);
    expect(rankOf(6_000)).toMatchObject({ level: 2, title: 'Stall keeper' });
    expect(rankOf(29_999).title).toBe('Trader');
    expect(rankOf(30_000).title).toBe('Merchant');
  });
  it('tops out at tycoon with a full ring and no next rank', () => {
    const top = rankOf(1_000_000);
    expect(top).toMatchObject({ level: RANKS.length, title: 'Tycoon', progress: 1 });
    expect(top.next).toBeUndefined();
  });
  it('names what is next and how far away it is', () => {
    expect(rankOf(7_000).next).toEqual({ title: 'Trader', at: 14_000 });
  });
  it('never goes backwards or out of range for odd input', () => {
    expect(rankOf(-500)).toMatchObject({ level: 1, progress: 0 });
    for (const w of [0, 1, 5_999, 6_000, 13_999, 14_000, 69_999, 70_000]) {
      const r = rankOf(w);
      expect(r.progress).toBeGreaterThanOrEqual(0);
      expect(r.progress).toBeLessThanOrEqual(1);
    }
    const levels = [0, 6_000, 14_000, 30_000, 70_000].map((w) => rankOf(w).level);
    expect(levels).toEqual([1, 2, 3, 4, 5]);
  });
});
