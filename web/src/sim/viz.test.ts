import { describe, it, expect } from 'vitest';
import { clock, compactCoins, dayOf, itemColor, linear, linePath, niceTicks, SERIES, STATUS, when } from './viz';

describe('viz helpers', () => {
  it('picks round ticks that cover the range', () => {
    expect(niceTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
    const t = niceTicks(38, 212);
    expect(t[0]).toBeGreaterThanOrEqual(38);
    expect(t[t.length - 1]).toBeLessThanOrEqual(212);
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(niceTicks(0, 0)).toBeTruthy();
  });

  it('maps values linearly, including reversed ranges for y axes', () => {
    const y = linear(0, 200, 100, 0);
    expect(y(0)).toBe(100);
    expect(y(200)).toBe(0);
    expect(y(100)).toBe(50);
    expect(linear(5, 5, 0, 10)(5)).toBe(0); // flat data does not divide by zero
  });

  it('draws a line only up to the playback point', () => {
    const d = linePath([10, 20, 30, 40], (i) => i * 10, (v) => 100 - v, 2);
    expect(d).toBe('M0.0 90.0L10.0 80.0L20.0 70.0');
    expect(linePath([], (i) => i, (v) => v)).toBe('');
  });

  it('formats time and coins', () => {
    expect(dayOf(0)).toBe(1);
    expect(dayOf(47)).toBe(2);
    expect(clock(26)).toBe('02:00');
    expect(when(50)).toBe('Day 3, 02:00');
    expect(compactCoins(9_999)).toBe('9,999');
    expect(compactCoins(12_000)).toBe('12K');
    expect(compactCoins(158_227)).toBe('158K');
  });

  it('gives every good a fixed, distinct colour and keeps status colours out of the series', () => {
    const items = ['tomatoes', 'pepper', 'flour', 'cotton', 'lace', 'thread', 'iron', 'copper wire'] as const;
    const colours = items.map(itemColor);
    expect(new Set(colours).size).toBe(8);
    expect(colours).toEqual([...SERIES]); // slots in the validated order, never cycled
    for (const s of Object.values(STATUS)) expect(colours).not.toContain(s);
  });
});
