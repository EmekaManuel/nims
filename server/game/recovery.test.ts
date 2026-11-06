import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../accounts/accounts';
import { createApp } from '../http/api';
import { Auth } from '../http/auth';
import { randomHex } from '../accounts/crypto';
import { Game } from './game';
import { rewardFor, planBoard, stillValid, totalDue, MAX_BOARD, JOB_TTL_HOURS } from './jobs';
import { transferCoins } from '../../sim/engine';
import { COINS, type LedgerEntry, type Item, type World } from '../../sim/world';

const me = 'ada@example.com';

/** Replay the whole ledger for one token. Throws if anyone but the town ever goes negative. */
function replay(ledger: LedgerEntry[], token: string) {
  const bal = new Map<string, number>();
  const add = (id: string, n: number, i: number) => {
    const v = (bal.get(id) ?? 0) + n;
    if (v < 0 && id !== 'town') throw new Error(`${id} went negative (${v}) at entry ${i}`);
    bal.set(id, v);
  };
  ledger.forEach((e, i) => { if (e.item !== token) return; if (e.kind === 'transfer') add(e.from!, -e.units, i); add(e.to, e.units, i); });
  return bal;
}
/** Everyone's cash and goods must equal what the ledger says: nothing changed hands off the books. */
function expectBooksBalance(w: World) {
  const coins = replay(w.ledger, COINS);
  for (const m of w.merchants) expect(coins.get(m.id) ?? 0, `${m.id} cash`).toBe(m.cash);
  for (const p of w.players) expect(coins.get(p.id) ?? 0, `${p.id} cash`).toBe(p.cash);
  const items = new Set<Item>();
  for (const e of w.ledger) if (e.item !== COINS) items.add(e.item as Item);
  for (const item of items) {
    const bal = replay(w.ledger, item);
    for (const m of w.merchants) expect(bal.get(m.id) ?? 0, `${m.id} ${item}`).toBe(m.stock[item] ?? 0);
    for (const p of w.players) expect(bal.get(p.id) ?? 0, `${p.id} ${item}`).toBe(p.inventory[item] ?? 0);
  }
}

/** Leave the player with `cash` coins and nothing carried, moving the difference through the ledger like any other payment. */
const broke = (g: Game, cash = 10) => {
  const p = g.playerFor(me);
  if (p.cash > cash) transferCoins(g.w, p, 'town', p.cash - cash);
  else if (p.cash < cash) transferCoins(g.w, 'town', p, cash - p.cash);
  for (const [item, n] of Object.entries(p.inventory)) if (n) g.w.ledger.push({ hour: g.w.hour, kind: 'transfer', from: p.id, to: 'town', item: item as Item, units: n });
  p.inventory = {};
  return p;
};

/** Set a merchant's stock of a good, recording the difference in the ledger like a real movement of goods. */
function setStock(g: Game, id: string, item: Item, units: number) {
  const m = g.w.merchants.find((x) => x.id === id)!;
  const now = m.stock[item] ?? 0;
  if (units > now) g.w.ledger.push({ hour: g.w.hour, kind: 'mint', to: m.id, item, units: units - now });
  else if (units < now) g.w.ledger.push({ hour: g.w.hour, kind: 'transfer', from: m.id, to: 'town', item, units: now - units });
  m.stock[item] = units;
}

/** Set a player's coins, through the ledger. */
const setCash = (g: Game, cash: number) => {
  const p = g.playerFor(me);
  if (p.cash > cash) transferCoins(g.w, p, 'town', p.cash - cash);
  else if (p.cash < cash) transferCoins(g.w, 'town', p, cash - p.cash);
};

/** Mira is badly short of tomatoes, so a job to restock her appears on the board. */
function withJob(cash = 10) {
  const g = new Game(3);
  g.state(me);
  setStock(g, 'mira', 'tomatoes', 5);
  g.tickOnce();
  broke(g, cash);
  const view = g.state(me).jobs.board.find((j) => j.item === 'tomatoes' && j.to.id === 'mira')!;
  const mira = g.w.merchants.find((m) => m.id === 'mira')!;
  const farm = g.w.sources.find((x) => x.item === 'tomatoes')!;
  return { g, view, mira, farm };
}

describe('knowing when a player needs a hand', () => {
  it('a fresh player does not; one with almost no coins and nothing to sell does', () => {
    const g = new Game(3);
    g.chooseGoal(me, 'fortune');
    expect(g.state(me).help.needed).toBe(false);
    broke(g);
    const s = g.state(me);
    expect(s.help.needed).toBe(true);
    expect(s.coach.text).toMatch(/nearly out of coins/);
  });
  it('carrying goods, or having enough coins, means you are not stuck', () => {
    const g = new Game(3);
    const p = broke(g);
    p.inventory = { iron: 1 };
    g.w.ledger.push({ hour: g.w.hour, kind: 'mint', to: p.id, item: 'iron', units: 1 });
    expect(g.state(me).help.needed).toBe(false);
    broke(g, 5_000);
    expect(g.state(me).help.needed).toBe(false);
  });
});

describe('searching the scrap heap', () => {
  it('gives one piece of iron to someone who is nearly broke, through the ledger', () => {
    const g = new Game(3);
    const p = broke(g);
    g.state(me);
    expect(g.scavenge(me).ok).toBe(true);
    expect(p.inventory.iron).toBe(1);
    expectBooksBalance(g.w);
  });
  it('refuses someone who is not short, and refuses a second search straight away', () => {
    const g = new Game(3);
    g.state(me);
    expect(g.scavenge(me).ok).toBe(false); // 4,000 coins: not short
    broke(g);
    expect(g.scavenge(me).ok).toBe(true);
    broke(g); // pretend they sold it and spent the coins
    const again = g.scavenge(me);
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/Try again in \d+ hour/);
    for (let i = 0; i < 3; i++) g.tickOnce();
    broke(g);
    expect(g.scavenge(me).ok).toBe(true);
  });
  it('cannot be farmed: once you hold the iron you are no longer eligible', () => {
    const g = new Game(3);
    broke(g); g.state(me);
    g.scavenge(me);
    for (let i = 0; i < 6; i++) g.tickOnce();
    expect(g.scavenge(me).ok).toBe(false);
  });
});

describe('the odd jobs board', () => {
  it('posts jobs for merchants that are short of a good the town can supply, with the cost and reward worked out', () => {
    const { g, view, mira, farm } = withJob();
    expect(view).toBeTruthy();
    expect(view.units).toBeGreaterThanOrEqual(2);
    expect(view.reward).toBe(rewardFor('tomatoes', view.units));
    const board = g.state(me).jobs.board;
    expect(board.length).toBeGreaterThan(0);
    expect(board.length).toBeLessThanOrEqual(MAX_BOARD);
    expect(mira.cash).toBeGreaterThan(view.units * farm.cost + view.reward + 200);
  });

  it('take, carry and deliver: the merchant pays for the goods and the reward, and the books balance', () => {
    const { g, view, mira, farm } = withJob();
    const poolBefore = farm.units, stockBefore = mira.stock.tomatoes ?? 0, miraCash = mira.cash, myCash = g.playerFor(me).cash;
    expect(g.takeJob(me, view.id).ok).toBe(true);
    expect(g.playerFor(me).inventory.tomatoes).toBe(view.units);
    expect(farm.units).toBe(poolBefore - view.units);
    expect(g.playerFor(me).cash).toBe(myCash); // nothing paid up front
    expect(g.state(me).jobs.active?.id).toBe(view.id);
    expect(g.state(me).jobs.board.some((j) => j.id === view.id)).toBe(false);
    expectBooksBalance(g.w);

    expect(g.deliverJob(me).ok).toBe(true);
    expect(g.playerFor(me).inventory.tomatoes ?? 0).toBe(0);
    expect(mira.stock.tomatoes).toBe(stockBefore + view.units);
    expect(mira.cash).toBe(miraCash - view.units * farm.cost - view.reward);
    expect(g.playerFor(me).cash).toBe(myCash + view.reward);
    expect(g.state(me).jobs.active).toBeNull();
    expectBooksBalance(g.w);
  });

  it('the goods are reserved: they cannot be sold or shelved elsewhere while the job is open', () => {
    const { g, view } = withJob();
    g.takeJob(me, view.id);
    const sale = g.sell(me, 'tomas', 'tomatoes', view.units);
    expect(sale.ok).toBe(false);
    expect(sale.message).toMatch(/reserved for your job/);
    expect(g.playerFor(me).inventory.tomatoes).toBe(view.units);
    // tomatoes of your own are still yours to sell
    g.playerFor(me).inventory.tomatoes = view.units + 2;
    g.w.ledger.push({ hour: g.w.hour, kind: 'mint', to: g.playerFor(me).id, item: 'tomatoes', units: 2 });
    expect(g.sell(me, 'tomas', 'tomatoes', 99).ok).toBe(true);
    expect(g.playerFor(me).inventory.tomatoes).toBe(view.units);
  });

  it('one job at a time, and a job needs room to carry', () => {
    const { g, view } = withJob();
    const other = g.state(me).jobs.board.find((j) => j.id !== view.id)!;
    expect(g.takeJob(me, view.id).ok).toBe(true);
    expect(g.takeJob(me, other.id).ok).toBe(false);
    const w2 = withJob();
    const p = w2.g.playerFor(me);
    p.inventory = { iron: 20 }; // a full wheelbarrow
    w2.g.w.ledger.push({ hour: w2.g.w.hour, kind: 'mint', to: p.id, item: 'iron', units: 20 });
    const r = w2.g.takeJob(me, w2.view.id);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/room/);
  });

  it('giving a job back, or letting it run out, returns the goods to the source and the books balance', () => {
    const a = withJob();
    const pool = a.farm.units;
    a.g.takeJob(me, a.view.id);
    expect(a.g.dropJob(me).ok).toBe(true);
    expect(a.farm.units).toBe(pool);
    expect(a.g.playerFor(me).inventory.tomatoes ?? 0).toBe(0);
    expectBooksBalance(a.g.w);

    const b = withJob();
    b.g.takeJob(me, b.view.id);
    b.g.w.hour += JOB_TTL_HOURS + 1;
    b.g.tickOnce();
    expect(b.g.state(me).jobs.active).toBeNull();
    expect(b.g.playerFor(me).inventory.tomatoes ?? 0).toBe(0);
    expect(b.g.playerFor(me).notes.some((n) => /ran out of time|given back/.test(n.text))).toBe(true);
    expectBooksBalance(b.g.w);
  });

  it('refuses delivery when the merchant cannot pay, without losing the goods or the job', () => {
    const { g, view, mira } = withJob();
    g.takeJob(me, view.id);
    transferCoins(g.w, mira, 'town', mira.cash - 5);
    const r = g.deliverJob(me);
    expect(r.ok).toBe(false);
    expect(g.playerFor(me).inventory.tomatoes).toBe(view.units);
    expect(g.state(me).jobs.active).not.toBeNull();
  });

  it('a job leaves the board once the merchant is no longer short', () => {
    const { g, view, mira } = withJob();
    expect(stillValid(g.w, { id: view.id, to: 'mira', item: 'tomatoes', units: view.units, reward: view.reward, unitCost: g.w.sources.find((x) => x.item === 'tomatoes')!.cost, posted: 0, expires: g.w.hour + 5 })).toBe(true);
    setStock(g, 'mira', 'tomatoes', Math.ceil((mira.target.tomatoes ?? 80) * 1.2));
    g.tickOnce();
    expect(g.state(me).jobs.board.some((j) => j.id === view.id)).toBe(false);
  });

  it('is only for people short of coins, and only one job every few hours', () => {
    const rich = withJob(5_000);
    const refused = rich.g.takeJob(me, rich.view.id);
    expect(refused.ok).toBe(false);
    expect(refused.message).toMatch(/short of coins/);
    expect(rich.g.state(me).help.canWork).toBe(false);

    const { g, view } = withJob();
    expect(g.state(me).help.canWork).toBe(true);
    g.takeJob(me, view.id);
    g.deliverJob(me);
    broke(g);
    const next = g.state(me).jobs.board[0];
    const soon = g.takeJob(me, next.id);
    expect(soon.ok).toBe(false);
    expect(soon.message).toMatch(/next one is on offer in \d+ hour/);
    expect(g.state(me).help.workIn).toBeGreaterThan(0);
    for (let i = 0; i < 9; i++) g.tickOnce();
    broke(g);
    expect(g.takeJob(me, g.state(me).jobs.board[0].id).ok).toBe(true);
  });

  it('survives a save and restart, including the job you hold and the cooldown', () => {
    const { g, view } = withJob();
    g.takeJob(me, view.id);
    const g2 = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.state(me).jobs.active?.id).toBe(view.id);
    expect(g2.deliverJob(me).ok).toBe(true);
    expect(Game.restore(JSON.parse(JSON.stringify(g2.snapshot()))).state(me).help.workIn).toBeGreaterThan(0);
  });

  it('planBoard is deterministic, never exceeds the cap, and never asks a merchant for more than they can pay', () => {
    const g = new Game(3);
    setStock(g, 'mira', 'tomatoes', 5);
    let id = 1;
    const a = planBoard(g.w, [], () => id++);
    id = 1;
    expect(planBoard(g.w, [], () => id++)).toEqual(a);
    expect(a.length).toBeLessThanOrEqual(MAX_BOARD);
    for (const j of a) expect(g.w.merchants.find((m) => m.id === j.to)!.cash).toBeGreaterThanOrEqual(totalDue(j));
  });

  it('cannot be farmed: a player who keeps taking jobs the moment they are allowed stays far below the economy', () => {
    const g = new Game(5);
    g.state(me);
    for (let i = 0; i < 40; i++) g.tickOnce();
    broke(g, 5);
    let earned = 0;
    for (let t = 0; t < 180; t++) { // half an hour of play at 10 s a tick
      g.tickOnce();
      const before = g.playerFor(me).cash;
      if (g.state(me).jobs.active) g.deliverJob(me);
      const board = g.state(me).jobs.board;
      if (!g.state(me).jobs.active && board.length) g.takeJob(me, board[0].id);
      earned += Math.max(0, g.playerFor(me).cash - before);
      if (g.playerFor(me).cash >= 600) break; // out of the hole: jobs close to them
    }
    expect(g.playerFor(me).cash).toBeLessThan(1_500);
    expect(earned).toBeLessThan(1_500);
    expectBooksBalance(g.w);
  });
});

describe('recovery routes', () => {
  it('scavenge, take, deliver and drop work over HTTP, need a login, and report plain refusals', async () => {
    const { g, view } = withJob();
    const links: string[] = [];
    const app = createApp({
      auth: new Auth(randomHex(32)),
      store: new AccountStore(join(mkdtempSync(join(tmpdir(), 'nims-rec-')), 'a.json'), 'oja.testnet', randomHex(32)),
      chain: { createPlayerAccount: async () => {}, transferItem: async () => {}, itemBalance: async () => 0 },
      mailer: { sendLoginLink: async (_e, l) => void links.push(l) },
      baseUrl: 'http://localhost:0',
      merchantParent: 'run.oja.testnet',
      game: g,
      devLinks: true,
    });
    const server = await app.listen(0);
    const base = `http://localhost:${(server.address() as { port: number }).port}`;
    const r = await (await fetch(base + '/auth/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: me }) })).json();
    const cookie = (await fetch(r.devLink.replace('http://localhost:0', base))).headers.get('set-cookie')!.split(';')[0];
    const post = (path: string, body: unknown = {}, c = cookie) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie: c }, body: JSON.stringify(body) });

    expect((await post('/game/scavenge', {}, '')).status).toBe(401);
    const s1 = await (await post('/game/scavenge')).json();
    expect(s1.ok).toBe(true);
    expect(s1.state.you.inventory).toEqual([{ item: 'iron', units: 1 }]);
    expect((await post('/game/scavenge')).status).toBe(400); // not eligible while holding the iron

    broke(g); // sold it and spent the coins
    expect((await post('/game/job/take', { id: 9999 })).status).toBe(400);
    const took = await (await post('/game/job/take', { id: view.id })).json();
    expect(took.ok).toBe(true);
    expect(took.state.jobs.active.id).toBe(view.id);
    expect((await post('/game/job/drop')).status).toBe(200);
    expect((await post('/game/job/deliver')).status).toBe(400); // nothing to deliver any more
    server.close();
  });
});

describe('the new state shows no wallet vocabulary', () => {
  it('help, jobs and coach read like a game, not a chain', () => {
    const { g } = withJob();
    expect(JSON.stringify([g.state(me).help, g.state(me).jobs, g.state(me).coach])).not.toMatch(/seed|mnemonic|private|secret|wallet|gas|ed25519|yocto|\.testnet|signature/i);
  });
});
