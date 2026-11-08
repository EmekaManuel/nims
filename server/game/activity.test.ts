import { describe, it, expect } from 'vitest';
import { Activity } from './activity';
import { Game } from './game';

const HOUR = 3_600_000;

describe('activity counts (real time)', () => {
  it('counts a person once however often they act, and keeps only the last 24 real hours', () => {
    let t = 100 * HOUR;
    const a = new Activity(() => t);
    a.trade('p1'); a.trade('p1'); a.seen('p2'); a.vote('p2');
    expect(a.summary().last24h).toEqual({ players: 2, trades: 2, votes: 1 });
    t += 25 * HOUR;
    a.seen('p3');
    expect(a.summary().last24h).toEqual({ players: 1, trades: 0, votes: 0 });
    expect(a.summary().total).toMatchObject({ trades: 2, votes: 1 });
  });

  it('survives a save, and a save from before it existed starts counting from now', () => {
    const t = 50 * HOUR;
    const a = new Activity(() => t);
    a.trade('p1'); a.decision(true); a.decision(false);
    const back = Activity.from(JSON.parse(JSON.stringify(a.toJSON())), () => t);
    expect(back.summary()).toEqual(a.summary());
    expect(Activity.from(undefined, () => t).summary().total).toEqual({ trades: 0, votes: 0, decisions: 0, passed: 0 });
  });
});

describe('the game counts what people do', () => {
  it('trades, shares and council votes by signed-in people, and how council votes end', () => {
    const g = new Game(5);
    const me = 'ada@example.com';
    g.state(me);
    expect(g.gather(me, 'tomatoes').ok).toBe(true);
    expect(g.sell(me, 'mira', 'tomatoes', 1).ok).toBe(true);
    expect(g.councilPropose(me, 'produce', 'rent', 'low').ok).toBe(true);
    const s = g.publicStats();
    expect(s.last24h).toEqual({ players: 1, trades: 1, votes: 1 });
    expect(s.players).toBe(1);
    expect(s.shops.total).toBe(8);
    for (let h = 0; h < 48; h++) g.tickOnce(); // the vote closes at the end of the game day
    expect(g.publicStats().total).toMatchObject({ decisions: 1, passed: 1 });
  });

  it('carries the counts through a save and restore', () => {
    const g = new Game(5);
    const me = 'ada@example.com';
    g.state(me);
    g.gather(me, 'tomatoes');
    g.sell(me, 'mira', 'tomatoes', 1);
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.publicStats().total.trades).toBe(1);
  });

  it('never names anyone', () => {
    const g = new Game(5);
    g.state('ada.lovelace@example.com');
    g.gather('ada.lovelace@example.com', 'tomatoes');
    g.sell('ada.lovelace@example.com', 'mira', 'tomatoes', 1);
    expect(JSON.stringify(g.publicStats())).not.toMatch(/ada|lovelace|@/i);
  });
});
