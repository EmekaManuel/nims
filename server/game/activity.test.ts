import { describe, it, expect } from 'vitest';
import { Activity } from './activity';
import { displayName, Game } from './game';

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

  it('shows only the first name other players already see: never an email or a surname', () => {
    const g = new Game(5);
    g.state('ada.lovelace@example.com');
    g.gather('ada.lovelace@example.com', 'tomatoes');
    g.sell('ada.lovelace@example.com', 'mira', 'tomatoes', 1);
    const out = JSON.stringify(g.publicStats());
    expect(out).toContain('"name":"Ada"');
    expect(out).not.toMatch(/lovelace|@|example/i);
  });

  it('the name players see is a first name, or only an initial for a username in one piece (it may hold a surname)', () => {
    expect(displayName('emeka.m@example.com')).toBe('Emeka');
    expect(displayName('tunde92@example.com')).toBe('T.');
    expect(displayName('nwosustephen1@gmail.com')).toBe('N.');
    expect(displayName('ada.92@example.com')).toBe('A.'); // a word and a number is still one word
    expect(displayName('ada92.obi@example.com')).toBe('Ada');
    expect(displayName('ada_lovelace@example.com')).toBe('Ada');
    expect(displayName('nwosustephen@example.com')).toBe('N.');
    const g = new Game(5);
    for (const e of ['nwosustephen@example.com', 'emeka.m@example.com', 'tunde92@example.com']) { g.state(e); g.gather(e, 'tomatoes'); g.sell(e, 'mira', 'tomatoes', 1); }
    expect(g.publicStats().leaders.map((l) => l.name).sort()).toEqual(['Emeka', 'N.', 'T.']);
    expect(JSON.stringify(g.publicStats())).not.toMatch(/nwosu|stephen/i);
  });

  it('a save from before the rule gets the safe name everywhere others see it: the name, the stall, the proposal, the news', () => {
    const g = new Game(5);
    const e = 'nwosustephen@example.com';
    g.state(e);
    const p = g.w.players[g.w.players.length - 1];
    p.cash = 50_000;
    expect(g.openStall(e, 'fabric').ok).toBe(true);
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    // what an older save held: the whole username as the name
    snap.names = snap.names.map(([id, n]: [string, string]) => [id, id === p.id ? 'Nwosustephen' : n]);
    for (const m of snap.world.merchants) if (m.owner === p.id) { m.ownerName = 'Nwosustephen'; m.name = "Nwosustephen's stall"; }
    snap.world.events.push({ hour: 1, type: 'state', text: "Nwosustephen's stall opened in the Fabric Market." });
    const back = Game.restore(snap);
    const out = JSON.stringify([back.state(e), back.publicStats(), back.snapshot().world.events, back.snapshot().world.merchants]);
    expect(out).not.toMatch(/nwosu|stephen/i);
    expect(back.state(e).business.stall!.name).toBe("N.'s stall");
  });

  it('ranks the people who have played by net worth, and leaves out anyone who has done nothing yet', () => {
    const g = new Game(5);
    for (const [email, cash] of [['bo.k@x.io', 9_000], ['cy.l@x.io', 6_000], ['di.m@x.io', 0]] as const) {
      g.state(email);
      g.w.players[g.w.players.length - 1].cash = cash || 4_000;
      if (cash) { g.gather(email, 'tomatoes'); g.sell(email, 'mira', 'tomatoes', 1); }
    }
    const names = g.publicStats().leaders.map((l) => l.name);
    expect(names).toEqual(['Bo', 'Cy']);
    expect(g.publicStats().leaders[0]).toMatchObject({ shares: 0, stall: false, vehicle: 'wheelbarrow' });
  });

  it('lists the latest council decisions, newest first', () => {
    const g = new Game(5);
    const me = 'ada@example.com';
    g.state(me);
    g.gather(me, 'tomatoes');
    g.sell(me, 'mira', 'tomatoes', 1);
    g.councilPropose(me, 'produce', 'rent', 'low');
    for (let h = 0; h < 48; h++) g.tickOnce();
    expect(g.publicStats().decisions[0]).toMatchObject({ market: 'Produce Market', lever: 'rent', to: 'low', passed: true });
  });
});
