import { describe, expect, it } from 'vitest';
import { Game } from '../server/game/game';
import { COINS, REALMS, LedgerEntry, World, realmOf } from './world';
import { transferCoins } from './engine';

/**
 * Everything the chain mirrors must be in the ledger. The settler plans each batch from the ledger and the game's balances, so a
 * coin or a good that moves without a ledger entry makes a later settlement fail ("Not enough balance") and forces a fresh epoch.
 * This plays many players doing every kind of action at random, and after every game hour checks that replaying the ledger from the start
 * gives exactly what the game holds, for coins and for every good.
 */
function replayAll(ledger: LedgerEntry[]) {
  const bal = new Map<string, number>(); // `${id}|${item}`
  for (const e of ledger) {
    if (e.kind === 'transfer') bal.set(`${e.from}|${e.item}`, (bal.get(`${e.from}|${e.item}`) ?? 0) - e.units);
    bal.set(`${e.to}|${e.item}`, (bal.get(`${e.to}|${e.item}`) ?? 0) + e.units);
  }
  return bal;
}

function mismatches(w: World): string[] {
  const bal = replayAll(w.ledger);
  const out: string[] = [];
  const check = (id: string, item: string, have: number) => {
    const want = bal.get(`${id}|${item}`) ?? 0;
    if (want !== have) out.push(`${id} ${item}: game ${have}, ledger ${want}`);
  };
  for (const m of w.merchants) {
    check(m.id, COINS, m.cash);
    check(`fund-${m.id}`, COINS, m.fund.pool);
    for (const [item, n] of Object.entries(m.stock)) check(m.id, item, n ?? 0);
  }
  for (const p of w.players) {
    check(p.id, COINS, p.cash);
    for (const [item, n] of Object.entries(p.inventory)) check(p.id, item, n ?? 0);
  }
  return out;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('the ledger reproduces every coin and every good, through every kind of action', () => {
  for (const seed of [1, 2, 3]) {
    it(`random play by five players for three game days (seed ${seed})`, () => {
      const r = rng(seed);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
      const g = new Game(seed);
      const who = ['a', 'b', 'c', 'd', 'e'].map((n) => `${n}@fuzz.test`);
      for (const e of who) g.state(e);
      for (const p of g.w.players) if (p.id.startsWith('h-')) { g.w.ledger.push({ hour: g.w.hour, kind: 'mint', to: p.id, item: COINS, units: 30_000 }); p.cash += 30_000; } // a grant, recorded like any other
      const items = ['tomatoes', 'pepper', 'iron', 'copper wire', 'cotton', 'lace', 'thread', 'flour', 'fish', 'salt', 'timber', 'gems', 'wine', 'spice'] as const;
      const merchants = g.w.merchants.map((m) => m.id);
      const plots = g.w.plots.map((p) => p.id);
      const realms = Object.keys(REALMS);
      const markets = ['produce', 'fabric', 'scrap'];
      const log: string[] = [];
      const okCount: Record<string, number> = {}, tryCount: Record<string, number> = {};
      const st = (e: string) => g.state(e) as any;
      const here = (e: string) => (st(e).stalls as any[]).filter((x) => realmOf(x.market) === st(e).realm || realmOf(x.market) === 'town');
      const acts: ((e: string) => unknown)[] = [
        (e) => { const src = pick((st(e).sources as any[]).filter((x) => x.units > 0)); return src ? g.gather(e, src.item) : undefined; },
        (e) => { const inv = pick(st(e).you.inventory as any[]); if (!inv) return; const m = pick(here(e).filter((x) => x.state !== 'closed' && x.offers.some((o: any) => o.item === inv.item && o.willBuy))); return m ? g.sell(e, m.id, inv.item, 1 + Math.floor(r() * inv.units), r() < 0.3) : undefined; },
        (e) => { const m = pick(here(e).filter((x) => x.state !== 'closed')); const o = m && pick(m.offers.filter((o: any) => o.willSell)); return o ? g.buy(e, m.id, o.item, 1 + Math.floor(r() * 15), r() < 0.3) : undefined; },
        (e) => g.buyShares(e, pick(merchants), 1 + Math.floor(r() * 5)), (e) => g.sellShares(e, pick(merchants), 1 + Math.floor(r() * 3)),
        (e) => { const m = pick(g.w.merchants.filter((x) => x.state === 'closed')); return m ? g.contribute(e, m.id, 200 + Math.floor(r() * 3000)) : undefined; },
        (e) => g.openStall(e, pick(markets)),
        (e) => { const inv = pick(st(e).you.inventory as any[]); return inv ? g.stallStock(e, inv.item, 1 + Math.floor(r() * inv.units)) : undefined; },
        (e) => g.stallTake(e, pick(items), 1 + Math.floor(r() * 10)), (e) => g.stallCash(e, r() < 0.5 ? 'deposit' : 'withdraw', 100 + Math.floor(r() * 3000)),
        (e) => g.stallPrice(e, pick(items), 20 + Math.floor(r() * 200), 30 + Math.floor(r() * 300)),
        (e) => { const inv = pick(st(e).you.inventory as any[]); const m = pick(here(e)); return inv && m ? g.placeOrder(e, m.id, inv.item, 1 + Math.floor(r() * inv.units), 1) : undefined; },
        (e) => g.travel(e, pick(realms)),
        (e) => { const l = st(e).land; const p = pick([...(l.here as any[]), ...plots.map((id) => ({ id }))]); return g.buyLand(e, p.id); },
        (e) => { const l = st(e).land; const p = pick(l.mine as any[]); return p ? g.listLand(e, p.id, 1000 + Math.floor(r() * 5000)) : undefined; },
        (e) => { const l = st(e).land; const p = pick(l.mine as any[]); return p ? g.build(e, p.id, 'Fuzz Stall') : undefined; },
        (e) => g.upgrade(e, pick(['pickup', 'van'])), (e) => g.scavenge(e),
        (e) => { const j = pick(st(e).jobs.board as any[]); return j ? g.takeJob(e, j.id) : undefined; }, (e) => g.deliverJob(e),
        (e) => g.claimDailyReward(e), (e) => g.claimQuest(e, pick(['first-haul', 'first-sale', 'a-haggle', 'two-markets', 'a-stake', 'beyond-the-hills'])),
        (e) => g.councilPropose(e, pick(markets), pick(['rent', 'payout']), pick(['low', 'high'])), (e) => g.councilVote(e, pick(markets), r() < 0.5),
        (e) => g.redeemInvite(e, g.inviteCode(g.w.players.find((p) => p.id.startsWith('h-') && p.id !== (st(e), g.w.players.find((q) => q.id.startsWith('h-'))!.id)) ?? g.w.players[0])),
        // go broke, so scavenging and jobs open up: the coins leave through the ledger
        (e) => { const p = g.w.players.find((x) => x.id === 'h-' + ''); void p; return undefined; },
      ];
      const names = ['gather', 'sell', 'buy', 'buyShares', 'sellShares', 'contribute', 'openStall', 'stallStock', 'stallTake', 'stallCash', 'stallPrice', 'placeOrder', 'travel', 'buyLand', 'listLand', 'build', 'upgrade', 'scavenge', 'takeJob', 'deliverJob', 'daily', 'quest', 'propose', 'vote', 'invite', 'noop'];
      for (let h = 0; h < 72; h++) {
        for (let k = 0; k < 14; k++) {
          const i = Math.floor(r() * acts.length), e = pick(who);
          try { const res = acts[i](e) as { ok?: boolean } | undefined; okCount[names[i]] = (okCount[names[i]] ?? 0) + (res?.ok ? 1 : 0); tryCount[names[i]] = (tryCount[names[i]] ?? 0) + 1; } catch (err) { throw new Error(`action ${names[i]} threw: ${(err as Error).message}`); }
          log.push(`${names[i]}(${e[0]})`);
          const bad = mismatches(g.w);
          if (bad.length) throw new Error(`after ${names[i]} by ${e[0]} (hour ${h}):\n${bad.slice(0, 6).join('\n')}\nlast actions: ${log.slice(-6).join(', ')}`);
        }
        if (h % 9 === 4) { // a merchant is drained and closes, so funds and reopening get exercised
          const m = pick(g.w.merchants.filter((x) => !x.owner && x.state !== 'closed'));
          transferCoins(g.w, m, 'town', m.cash);
          for (const [item, n] of Object.entries(m.stock)) if (n) { g.w.ledger.push({ hour: g.w.hour, kind: 'transfer', from: m.id, to: 'town', item: item as any, units: n }); m.stock[item as keyof typeof m.stock] = 0; }
        }
        // a player spends it all (the coins go to the town through the ledger), so odd jobs and scavenging open up
        { const hp = g.w.players.filter((x) => x.id.startsWith('h-')); const p = pick(hp); if (r() < 0.25 && p.cash > 0) transferCoins(g.w, p, 'town', p.cash - 20); }
        g.tickOnce();
        const bad = mismatches(g.w);
        if (bad.length) throw new Error(`after the hour ${h} tick:\n${bad.slice(0, 6).join('\n')}\nlast actions: ${log.slice(-6).join(', ')}`);
      }
      expect(mismatches(g.w)).toEqual([]);
      if (process.env.FUZZ_COVERAGE) console.log(`seed ${seed} ledger ${g.w.ledger.length} ok/tried: ` + Object.keys(tryCount).map((k) => `${k} ${okCount[k]}/${tryCount[k]}`).join(', '));
    });
  }
});
