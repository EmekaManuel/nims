import { describe, it, expect } from 'vitest';
import { Game } from '../server/game';
import { refreshState, transferCoins } from './engine';
import { runWeek } from './run';
import { COINS, LedgerEntry, World } from './world';

/** Replay a ledger from the start. Returns every balance, and throws if anyone (but the town) ever goes negative. */
function replay(ledger: LedgerEntry[], token: string) {
  const bal = new Map<string, number>();
  const add = (id: string, n: number, i: number) => {
    const v = (bal.get(id) ?? 0) + n;
    if (v < 0 && id !== 'town') throw new Error(`${id} went negative (${v}) at ledger entry ${i}`);
    bal.set(id, v);
  };
  ledger.forEach((e, i) => {
    if (e.item !== token) return;
    if (e.kind === 'transfer') add(e.from!, -e.units, i);
    add(e.to, e.units, i);
  });
  return bal;
}

/** Every merchant's and player's cash must equal what the ledger says they hold. This catches any cash change that bypasses the ledger. */
function expectCoinsMatch(w: World) {
  const bal = replay(w.ledger, COINS);
  for (const m of w.merchants) expect(bal.get(m.id) ?? 0, `${m.id} cash`).toBe(m.cash);
  for (const p of w.players) expect(bal.get(p.id) ?? 0, `${p.id} cash`).toBe(p.cash);
  for (const m of w.merchants) expect(bal.get(`fund-${m.id}`) ?? 0, `fund-${m.id} escrow`).toBe(m.fund.pool);
}

describe('every coin is in the ledger', () => {
  it('a simulated week with every kind of trader: the ledger reproduces every balance', () => {
    expectCoinsMatch(runWeek(11));
    expectCoinsMatch(runWeek(3));
  });

  it('a full feature tour through the Game API, with exact balances at the end', () => {
    const g = new Game(8);
    const me = 'ada@example.com';
    g.state(me);
    const p = g.w.players.find((x) => x.strategy === 'human')!;
    // Give the player extra money the honest way: the town pays them (a mint), not a silent cash edit.
    const gift = 40_000;
    p.cash += gift;
    g.w.ledger.push({ hour: g.w.hour, kind: 'mint', to: p.id, item: COINS, units: gift });

    g.gather(me, 'iron');
    g.sell(me, 'anil', 'iron', 20, true); // travels, haggles
    g.gather(me, 'tomatoes');
    g.sell(me, 'mira', 'tomatoes', 20);
    g.buyShares(me, 'ruth', 5);
    g.sellShares(me, 'ruth', 2);
    g.upgrade(me, 'pickup');
    g.openStall(me, 'fabric');
    g.stallCash(me, 'deposit', 3_000);
    g.stallCash(me, 'withdraw', 500);
    // a shop closes and is revived through the community fund
    const m = g.w.merchants.find((x) => x.id === 'tomas')!;
    transferCoins(g.w, m, 'town', m.cash); // the shop's money leaves the way real money does, through the ledger
    m.stock = {};
    refreshState(g.w, m);
    g.contribute(me, 'tomas', 5_000);
    g.contribute(me, 'tomas', 7_000);
    // time passes: customers, rent, restocking, dividends at the end of each day, agent merchants trading with the stall
    for (let i = 0; i < 72; i++) g.tickOnce();
    expectCoinsMatch(g.w);
  });

  it('the starting cash of a late joiner is recorded too', () => {
    const g = new Game(2);
    for (let i = 0; i < 10; i++) g.tickOnce();
    g.state('late@example.com');
    expectCoinsMatch(g.w);
  });
});
