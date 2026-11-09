import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { BUILD_COST, COINS, PLOT_PRICES, REALMS, type LedgerEntry, type World } from '../../sim/world';
import { transferCoins } from '../../sim/engine';

const ada = 'ada.obi@example.com';
const bo = 'bo.k@example.com';
const human = (g: Game, email: string) => { g.state(email); return g.w.players.find((p) => p.id === g.playerFor(email).id)!; };
/** Send a player to a realm and wait for them to arrive. */
function goTo(g: Game, email: string, realm: string) {
  const p = human(g, email);
  if (p.cash < 50_000) transferCoins(g.w, 'town', p, 50_000 - p.cash); // through the ledger, so the books still balance
  expect(g.travel(email, realm)).toMatchObject({ ok: true });
  for (let i = 0; i < 20 && p.journey; i++) g.tickOnce();
  expect(g.state(email).realm.here).toBe(realm);
  return p;
}
function coinsBalance(w: World) {
  const b = new Map<string, number>();
  for (const e of w.ledger as LedgerEntry[]) {
    if (e.item !== COINS) continue;
    if (e.kind === 'transfer') b.set(e.from!, (b.get(e.from!) ?? 0) - e.units);
    b.set(e.to, (b.get(e.to) ?? 0) + e.units);
  }
  for (const m of w.merchants) expect(b.get(m.id) ?? 0, `${m.id} cash`).toBe(m.cash);
  for (const p of w.players) expect(b.get(p.id) ?? 0, `${p.id} cash`).toBe(p.cash);
}

describe('the frontiers', () => {
  it('three unexplored places, each with plots and a source of its own, and no shops', () => {
    const g = new Game(5);
    const frontiers = (Object.keys(REALMS) as (keyof typeof REALMS)[]).filter((r) => REALMS[r].frontier);
    expect(frontiers).toEqual(['timberfell', 'gemhollow', 'sunvale']);
    for (const r of frontiers) {
      expect(g.w.plots.filter((x) => x.realm === r)).toHaveLength(8);
      expect(g.w.sources.some((s) => s.realm === r)).toBe(true);
      expect(g.w.merchants.some((m) => (g.w.plots.find((x) => x.realm === r)!.market === m.market))).toBe(false);
    }
    expect(REALMS.gemhollow.travel).toBe('plane');
  });

  it('the first to arrive is named in the news; the second is not', () => {
    const g = new Game(5);
    goTo(g, ada, 'gemhollow');
    goTo(g, bo, 'gemhollow');
    const found = g.w.events.filter((e) => e.type === 'discovery');
    expect(found.map((e) => e.text)).toEqual(['Ada was the first to reach Gem Hollow.']);
    expect(g.state(bo).land.discovered).toMatchObject({ by: 'Ada' });
  });
});

describe('land', () => {
  it('you buy land where you are, at its price, and only one plot in each place', () => {
    const g = new Game(5);
    human(g, ada);
    expect(g.buyLand(ada, 'timberfell-1')).toMatchObject({ ok: false, message: expect.stringMatching(/Go there/) });
    const p = goTo(g, ada, 'timberfell');
    const before = p.cash;
    expect(g.buyLand(ada, 'timberfell-1')).toMatchObject({ ok: true });
    expect(p.cash).toBe(before - PLOT_PRICES[0]);
    expect(g.buyLand(ada, 'timberfell-2')).toMatchObject({ ok: false, message: expect.stringMatching(/one plot per place/) });
    expect(g.state(ada).land.mine.map((x) => x.id)).toEqual(['timberfell-1']);
    expect(g.state(ada).land.here.find((x) => x.id === 'timberfell-1')!.owner).toEqual({ name: 'Ada', mine: true });
  });

  it('an owner can put empty land up for sale, and another player buys it from them', () => {
    const g = new Game(5);
    const a = goTo(g, ada, 'sunvale');
    g.buyLand(ada, 'sunvale-3');
    const b = goTo(g, bo, 'sunvale');
    expect(g.buyLand(bo, 'sunvale-3')).toMatchObject({ ok: false, message: expect.stringMatching(/not selling/) });
    expect(g.listLand(ada, 'sunvale-3', 5_000)).toMatchObject({ ok: true });
    const aBefore = a.cash, bBefore = b.cash;
    expect(g.buyLand(bo, 'sunvale-3')).toMatchObject({ ok: true });
    expect(a.cash).toBe(aBefore + 5_000);
    expect(b.cash).toBe(bBefore - 5_000);
    expect(g.w.plots.find((x) => x.id === 'sunvale-3')).toMatchObject({ owner: b.id, ownerName: 'Bo' });
    expect(g.w.plots.find((x) => x.id === 'sunvale-3')!.forSale).toBeUndefined();
    expect(a.notes.at(-1)!.text).toMatch(/Bo bought your plot in Sunvale for 5,000 coins/);
    coinsBalance(g.w);
  });
});

describe('a business on your land', () => {
  it('costs the build price, opens as your shop, and the people there buy from it', () => {
    const g = new Game(5);
    const p = goTo(g, ada, 'timberfell');
    g.buyLand(ada, 'timberfell-2');
    const before = p.cash;
    expect(g.build(ada, 'timberfell-2', 'Ada Timber')).toMatchObject({ ok: true });
    expect(p.cash).toBe(before - BUILD_COST);
    expect(g.build(ada, 'timberfell-2')).toMatchObject({ ok: false });
    const biz = g.state(ada).business.businesses[0];
    expect(biz).toMatchObject({ id: 'biz-timberfell-2', name: 'Ada Timber', realm: 'timberfell' });
    expect(biz.items.map((i) => i.item)).toEqual(['timber', 'flour', 'iron', 'salt']);
    // stock it with timber from the lumber camp, and let the town's customers come
    expect(g.gather(ada, 'timber')).toMatchObject({ ok: true });
    expect(g.stallStock(ada, 'timber', 10, biz.id)).toMatchObject({ ok: true });
    for (let i = 0; i < 24; i++) g.tickOnce();
    const after = g.state(ada).business.businesses[0];
    expect(after.items.find((i) => i.item === 'timber')!.stock).toBeLessThan(10);
    expect(after.till).toBeGreaterThan(0);
    expect(g.state(ada).business.stall).toBeNull(); // the town stall is separate
    coinsBalance(g.w);
  });

  it('refuses a bad business name, and you stock a business by going there', () => {
    const g = new Game(5);
    goTo(g, ada, 'timberfell');
    g.buyLand(ada, 'timberfell-1');
    expect(g.build(ada, 'timberfell-1', 'x')).toMatchObject({ ok: false });
    expect(g.build(ada, 'timberfell-1', 'Shitty Logs')).toMatchObject({ ok: false });
    g.build(ada, 'timberfell-1');
    expect(g.state(ada).business.businesses[0].name).toBe("Ada's Trading Post");
    g.gather(ada, 'timber');
    goTo(g, ada, 'town');
    expect(g.stallStock(ada, 'timber', 1, 'biz-timberfell-1')).toMatchObject({ ok: false, message: expect.stringMatching(/journey away/) });
    expect(g.listLand(ada, 'timberfell-1', 9_000)).toMatchObject({ ok: false, message: expect.stringMatching(/business on that land/) });
  });

  it('in a frontier the coach points at land, then building, then stocking your business', () => {
    const g = new Game(5);
    goTo(g, ada, 'timberfell');
    g.chooseGoal(ada, 'reach');
    expect(g.state(ada).coach.text).toMatch(/Buy a plot: from 1,800 coins/);
    g.buyLand(ada, 'timberfell-3');
    expect(g.state(ada).coach.text).toMatch(/Build a business on your land/);
    g.build(ada, 'timberfell-3');
    g.gather(ada, 'timber');
    expect(g.state(ada).coach).toMatchObject({ text: expect.stringMatching(/Stock your \d+ timber in Ada's Trading Post/), focus: { kind: 'stall', id: 'biz-timberfell-3' } });
  });

  it('the explorer quests: reach a frontier, buy land, build', () => {
    const g = new Game(5);
    human(g, ada);
    const s = (g as unknown as { questsOf: (p: unknown) => { claimed: string[] } }).questsOf(g.playerFor(ada));
    s.claimed.push('first-haul', 'first-sale', 'strike-bargain', 'two-markets', 'beyond-the-hills');
    goTo(g, ada, 'gemhollow');
    expect(g.claimQuest(ada, 'into-the-unknown')).toMatchObject({ ok: true });
    g.buyLand(ada, 'gemhollow-5');
    expect(g.claimQuest(ada, 'stake-a-claim')).toMatchObject({ ok: true });
    g.build(ada, 'gemhollow-5');
    expect(g.claimQuest(ada, 'open-for-business')).toMatchObject({ ok: true });
  });
});

describe('an existing town gets the frontiers', () => {
  it('a save from before them gains the plots, sources and merchants\' new goods when it loads', () => {
    const g = new Game(5);
    g.state(ada);
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    delete snap.world.plots;
    delete snap.world.discovered;
    snap.world.sources = snap.world.sources.filter((x: { item: string }) => !['timber', 'gems', 'wine'].includes(x.item));
    for (const m of snap.world.merchants) for (const item of ['timber', 'gems', 'wine']) { delete m.target[item]; delete m.stock[item]; }
    snap.world.ledger = snap.world.ledger.filter((e: { item: string }) => !['timber', 'gems', 'wine'].includes(e.item));
    const back = Game.restore(snap);
    expect(back.w.plots).toHaveLength(24);
    expect(back.w.sources.map((x) => x.item)).toEqual(expect.arrayContaining(['timber', 'gems', 'wine']));
    expect(back.w.merchants.find((m) => m.id === 'diego')!.target.timber).toBe(40);
    coinsBalance(back.w);
    for (let i = 0; i < 24; i++) back.tickOnce();
    coinsBalance(back.w);
  });
});
