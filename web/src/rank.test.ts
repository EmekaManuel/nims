import { describe, it, expect } from 'vitest';
import { rankOf, RANKS } from './rank';

describe('rank', () => {
  it('starts as a street vendor and climbs with net worth', () => {
    expect(rankOf(0)).toMatchObject({ level: 1, title: 'Street vendor', progress: 0 });
    expect(rankOf(1_500).progress).toBeCloseTo(0.5, 2);
    expect(rankOf(3_000)).toMatchObject({ level: 2, title: 'Stall keeper' });
    expect(rankOf(14_999).title).toBe('Trader');
    expect(rankOf(15_000).title).toBe('Merchant');
  });
  it('tops out at tycoon with a full ring and no next rank', () => {
    const top = rankOf(1_000_000);
    expect(top).toMatchObject({ level: RANKS.length, title: 'Tycoon', progress: 1 });
    expect(top.next).toBeUndefined();
  });
  it('names what is next and how far away it is', () => {
    expect(rankOf(4_000).next).toEqual({ title: 'Trader', at: 7_000 });
  });
  it('never goes backwards or out of range for odd input', () => {
    expect(rankOf(-500)).toMatchObject({ level: 1, progress: 0 });
    for (const w of [0, 1, 2_999, 3_000, 6_999, 7_000, 34_999, 35_000]) {
      const r = rankOf(w);
      expect(r.progress).toBeGreaterThanOrEqual(0);
      expect(r.progress).toBeLessThanOrEqual(1);
    }
    const levels = RANKS.map((r) => rankOf(r.min).level);
    expect(levels).toEqual([1, 2, 3, 4, 5]);
  });
});
