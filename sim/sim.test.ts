import { describe, it, expect } from 'vitest';
import { act, newPlayer } from './players';
import { contributeToAjo, quoteFor, refreshState, tick } from './engine';
import { runWeek } from './run';
import { createWorld } from './world';

describe('Milestone 1 exit test', () => {
  it('flooding iron makes iron cheap', () => {
    const w = createWorld(7, [newPlayer('flooder', 'flooder')]);
    const start = quoteFor(w, w.merchants.find((m) => m.id === 'wale')!, 'iron').mid;
    for (let h = 0; h < 48; h++) tick(w, act);
    const end = quoteFor(w, w.merchants.find((m) => m.id === 'wale')!, 'iron').mid;
    expect(end).toBeLessThan(start * 0.6);
  });

  it('flooding iron leaves other markets alone', () => {
    const w = createWorld(7, [newPlayer('flooder', 'flooder')]);
    const tomato0 = quoteFor(w, w.merchants.find((m) => m.id === 'kemi')!, 'tomatoes').mid;
    for (let h = 0; h < 48; h++) tick(w, act);
    const tomato1 = quoteFor(w, w.merchants.find((m) => m.id === 'kemi')!, 'tomatoes').mid;
    expect(tomato1).toBeGreaterThan(tomato0 * 0.5);
  });

  it('a merchant can go broke and be revived by an ajo pool', () => {
    const investor = newPlayer('investor', 'investor', 40_000);
    const w = createWorld(3, [investor]);
    const m = w.merchants[0];
    m.cash = 0;
    m.stock = {};
    refreshState(w, m);
    expect(m.state).toBe('closed');
    expect(contributeToAjo(w, investor, m, 6_000)).toBe(true);
    expect(m.state).toBe('closed'); // pool not full yet
    contributeToAjo(w, investor, m, 6_000);
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
