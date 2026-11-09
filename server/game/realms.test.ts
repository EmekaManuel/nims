import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { COINS, REALMS, type Item, type LedgerEntry, type World } from '../../sim/world';

const me = 'ada.obi@example.com';
const player = (g: Game) => g.w.players.find((p) => p.strategy === 'human')!;
/** Walk the clock until the player arrives (or `max` hours pass). */
const waitForArrival = (g: Game, max = 20) => { for (let i = 0; i < max && player(g).journey; i++) g.tickOnce(); };

/** Everyone's cash and goods equal what the ledger says. */
function expectBooksBalance(w: World) {
  const bal = (token: string) => {
    const b = new Map<string, number>();
    for (const e of w.ledger as LedgerEntry[]) {
      if (e.item !== token) continue;
      if (e.kind === 'transfer') b.set(e.from!, (b.get(e.from!) ?? 0) - e.units);
      b.set(e.to, (b.get(e.to) ?? 0) + e.units);
    }
    return b;
  };
  const coins = bal(COINS);
  for (const m of w.merchants) expect(coins.get(m.id) ?? 0, `${m.id} cash`).toBe(m.cash);
  for (const item of ['fish', 'salt', 'spice'] as Item[]) {
    const b = bal(item);
    for (const m of w.merchants) expect(b.get(m.id) ?? 0, `${m.id} ${item}`).toBe(m.stock[item] ?? 0);
  }
}

describe('the journey to Saltmere Harbour', () => {
  it('a new player is in town; setting off costs the passage, takes hours, and blocks trading until arrival', () => {
    const g = new Game(5);
    g.state(me);
    expect(g.state(me).realm).toMatchObject({ here: 'town', journey: null });
    expect(g.state(me).realm.roads[0]).toMatchObject({ realm: 'saltmere', name: 'Saltmere Harbour', passage: REALMS.saltmere.passage, freight: 0 });
    const before = player(g).cash;
    expect(g.travel(me, 'saltmere')).toMatchObject({ ok: true });
    expect(player(g).cash).toBe(before - REALMS.saltmere.passage);
    expect(g.state(me).realm.journey).toMatchObject({ to: 'saltmere', hoursLeft: REALMS.saltmere.journeyHours });
    expect(g.gather(me, 'tomatoes')).toMatchObject({ ok: false, message: expect.stringMatching(/on the road to Saltmere/) });
    expect(g.state(me).coach).toMatchObject({ focus: null, text: expect.stringMatching(/on the road to Saltmere Harbour/) });
    expect(g.travel(me, 'town')).toMatchObject({ ok: false });
    waitForArrival(g);
    expect(g.state(me).realm).toMatchObject({ here: 'saltmere', journey: null });
    expect(player(g).notes.at(-1)!.text).toMatch(/arrived in Saltmere Harbour/);
  });

  it('freight is charged on what you carry, and you need the coins up front', () => {
    const g = new Game(5);
    g.state(me);
    g.gather(me, 'iron');
    const road = g.state(me).realm.roads[0];
    expect(road.freight).toBeGreaterThan(0);
    player(g).cash = road.passage + road.freight - 1;
    expect(g.travel(me, 'saltmere')).toMatchObject({ ok: false, message: expect.stringMatching(/The journey costs/) });
    player(g).cash = road.passage + road.freight;
    expect(g.travel(me, 'saltmere')).toMatchObject({ ok: true });
    expect(player(g).cash).toBe(0);
  });

  it('you cannot trade or collect in a realm you are not in: it says it is a journey away', () => {
    const g = new Game(5);
    g.state(me);
    g.gather(me, 'iron');
    expect(g.sell(me, 'marlow', 'iron', 1)).toMatchObject({ ok: false, message: expect.stringMatching(/journey away/) });
    expect(g.gather(me, 'fish')).toMatchObject({ ok: false, message: expect.stringMatching(/journey away/) });
    expect(g.travel(me, 'town')).toMatchObject({ ok: false, message: expect.stringMatching(/already in Nims/) });
    expect(g.travel(me, 'atlantis')).toMatchObject({ ok: false });
  });

  it('deals and odd jobs only point at the realm you are in', () => {
    const g = new Game(5);
    g.state(me);
    for (let i = 0; i < 30; i++) g.tickOnce();
    const harbourIds = ['pike', 'marlow', 'zara'];
    const town = g.state(me);
    expect(town.deals.every((d) => !harbourIds.includes(d.to.id))).toBe(true);
    expect(town.deals.every((d) => d.from.id !== 'fish' && d.from.id !== 'salt')).toBe(true); // nor from the harbour's pier and salt pans
    expect(town.coach.text).not.toMatch(/salt pans|fishing pier/);
    expect(town.jobs.board.every((j) => !harbourIds.includes(j.to.id))).toBe(true);
    g.travel(me, 'saltmere');
    waitForArrival(g);
    const away = g.state(me);
    expect(away.deals.every((d) => harbourIds.includes(d.to.id))).toBe(true);
    expect(away.jobs.board.every((j) => harbourIds.includes(j.to.id))).toBe(true);
  });

  it('the trade route pays both ways: the harbour pays more for iron, the town pays more for spice', () => {
    const g = new Game(5);
    g.state(me);
    const pays = (id: string, item: string) => g.state(me).stalls.find((s) => s.id === id)!.offers.find((o) => o.item === item)!.buyPrice;
    expect(pays('marlow', 'iron')).toBeGreaterThan(pays('anil', 'iron'));
    const zaraSells = g.state(me).stalls.find((s) => s.id === 'zara')!.offers.find((o) => o.item === 'spice')!.sellPrice;
    expect(pays('june', 'spice')).toBeGreaterThan(zaraSells);
  });
});

describe('the realm quests', () => {
  it('open once you know the town, and the journey completes the first one', () => {
    const g = new Game(5);
    g.state(me);
    const q = () => g.state(me).quests.active.map((a) => a.id);
    expect(q()).not.toContain('beyond-the-hills');
    // finish the starter chain up to "Know the town"
    g.gather(me, 'tomatoes'); g.claimQuest(me, 'first-haul');
    g.sell(me, 'mira', 'tomatoes', 5); g.claimQuest(me, 'first-sale');
    g.gather(me, 'tomatoes'); g.sell(me, 'tomas', 'tomatoes', 1, true); g.claimQuest(me, 'strike-bargain');
    g.gather(me, 'iron'); g.sell(me, 'anil', 'iron', 1); g.sell(me, 'mira', 'tomatoes', 1); // a second market since the quest opened
    expect(g.claimQuest(me, 'two-markets')).toMatchObject({ ok: true });
    expect(q()).toContain('beyond-the-hills');
    g.travel(me, 'saltmere');
    waitForArrival(g);
    expect(g.state(me).quests.active.find((a) => a.id === 'beyond-the-hills')).toMatchObject({ complete: true, reward: 300 });
    expect(g.claimQuest(me, 'beyond-the-hills')).toMatchObject({ ok: true });
    expect(q()).toContain('ships-need-thread');
  });
});

describe('an existing town gets the harbour', () => {
  it('a save from before the harbour gains its merchants, sources and council when it loads, with the books still balanced', () => {
    const g = new Game(5);
    g.state(me);
    for (let i = 0; i < 10; i++) g.tickOnce();
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    // what an older save held: no harbour at all, and June without spice or salt
    snap.world.merchants = snap.world.merchants.filter((m: { market: string }) => m.market !== 'harbour');
    snap.world.sources = snap.world.sources.filter((s: { realm?: string }) => !s.realm);
    delete snap.world.council.harbour;
    const june = snap.world.merchants.find((m: { id: string }) => m.id === 'june');
    delete june.target.spice; delete june.target.salt; delete june.stock.spice; delete june.stock.salt;
    snap.world.ledger = snap.world.ledger.filter((e: { to: string; from?: string; item: string }) => !['pike', 'marlow', 'zara'].includes(e.to) && !['pike', 'marlow', 'zara'].includes(e.from ?? '') && !(e.to === 'june' && ['spice', 'salt'].includes(e.item)) && !(e.from === 'june' && ['spice', 'salt'].includes(e.item)));
    const back = Game.restore(snap);
    expect(back.w.merchants.filter((m) => m.market === 'harbour').map((m) => m.id)).toEqual(['pike', 'marlow', 'zara']);
    expect(back.w.sources.map((s) => s.item)).toEqual(expect.arrayContaining(['fish', 'salt']));
    expect(back.w.council.harbour).toMatchObject({ rent: 'normal', payout: 'normal' });
    expect(back.w.merchants.find((m) => m.id === 'june')!.target).toMatchObject({ spice: 15, salt: 30 });
    expectBooksBalance(back.w);
    for (let i = 0; i < 24; i++) back.tickOnce(); // and the economy carries on from there
    expectBooksBalance(back.w);
  });
});
