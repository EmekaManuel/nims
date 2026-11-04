import { describe, it, expect } from 'vitest';
import { DEFAULT_PARAMS, runFastForward, sanitize } from './fastforward';

describe('sanitize', () => {
  it('uses safe defaults for missing or hostile input', () => {
    expect(sanitize(undefined)).toEqual(DEFAULT_PARAMS);
    expect(sanitize('nope')).toEqual(DEFAULT_PARAMS);
    expect(sanitize({ days: 'x', seed: null, gatherers: {}, flooder: 'yes' })).toEqual(DEFAULT_PARAMS);
  });
  it('clamps numbers into range and keeps whole numbers', () => {
    const p = sanitize({ days: 9999, seed: -5, gatherers: 99, arbitrageur: false });
    expect(p).toMatchObject({ days: 14, seed: 0, gatherers: 6, arbitrageur: false });
    expect(sanitize({ days: 0 }).days).toBe(1);
    expect(sanitize({ days: 3.9 }).days).toBe(3);
  });
});

describe('fast-forward run', () => {
  const run = (over = {}) => runFastForward({ ...DEFAULT_PARAMS, ...over });

  it('returns a full week for every item and every merchant', () => {
    const r = run();
    expect(r.hours).toBe(168);
    expect(r.items).toHaveLength(8);
    for (const { item } of r.items) expect(r.prices[item]).toHaveLength(168);
    expect(r.merchants).toHaveLength(8);
    for (const m of r.merchants) expect(r.cash[m.id]).toHaveLength(168);
    for (const p of r.players) expect(p.worth).toHaveLength(168);
  });

  it('is deterministic for a seed, and a different seed gives a different town', () => {
    const a = JSON.stringify(run({ seed: 4 }));
    expect(JSON.stringify(run({ seed: 4 }))).toBe(a);
    expect(JSON.stringify(run({ seed: 5 }))).not.toBe(a);
  });

  it('runs the strategies you ask for, and only those', () => {
    const r = run({ gatherers: 1, arbitrageur: false, investor: false, flooder: true });
    expect(r.players.map((p) => p.label)).toEqual(['Gatherer 1', 'Market flooder']);
    expect(run({ gatherers: 0, arbitrageur: false, investor: false, flooder: false }).players).toHaveLength(0);
  });

  it('flooding iron crashes its price; without the flooder it does not', () => {
    const lowest = (r: ReturnType<typeof run>) => Math.min(...r.prices.iron) / 300;
    const flooded = run({ flooder: true });
    const calm = run({ flooder: false });
    expect(lowest(flooded)).toBeLessThan(0.6);
    expect(lowest(calm)).toBeGreaterThan(lowest(flooded));
    expect(flooded.highlights.join(' ')).toMatch(/Iron fell to \d+%/);
  });

  it('records shocks, closures, revivals and dividends as structured events', () => {
    const r = run({ seed: 1 });
    expect(r.shocks.length).toBeGreaterThan(0);
    for (const s of r.shocks) {
      expect(['rain', 'fuel queue', 'festive season']).toContain(s.kind);
      expect(s.start).toBeGreaterThanOrEqual(0);
      expect(s.end).toBeLessThanOrEqual(r.hours);
    }
    const ids = new Set(r.merchants.map((m) => m.id));
    for (const e of [...r.closures, ...r.revivals, ...r.dividends]) expect(ids.has(e.merchant)).toBe(true);
    expect(r.dividends.length).toBeGreaterThan(0); // the investor holds a stake in every market
    expect(r.highlights.length).toBeGreaterThan(0);
  });

  it('is fast enough to run on request', () => {
    const t = Date.now();
    run({ days: 14 });
    expect(Date.now() - t).toBeLessThan(5_000);
  });
});
