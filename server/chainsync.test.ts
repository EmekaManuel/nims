import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Game } from './game';
import { transferCoins } from '../sim/engine';
import { aggregate, ChainOps, ChainSync, planChunk, Signer, Wallets } from './chainsync';
import type { MintCall, TransferLeg } from './settle';
import type { LedgerEntry } from '../sim/world';

/** A stand-in for the contract and the NEAR network, with the same rules: atomic send_many, sequence numbers, accounts. */
class FakeChain implements ChainOps {
  bal = new Map<string, number>();
  accounts = new Set<string>();
  mintSeqNow = 0;
  sendSeqNow = new Map<string, number>();
  calls = 0;
  duplicatesIgnored = 0;
  /** One-shot faults. `afterApply` means the call lands and THEN fails (a timeout waiting for confirmation). */
  faults: { op: 'mint' | 'send'; nth: number; error: Error; afterApply?: boolean }[] = [];
  private seen = { mint: 0, send: 0 };

  private fault(op: 'mint' | 'send') {
    const n = ++this.seen[op];
    const i = this.faults.findIndex((f) => f.op === op && f.nth === n);
    return i >= 0 ? this.faults.splice(i, 1)[0] : null;
  }
  get = (a: string, t: string) => this.bal.get(`${a}|${t}`) ?? 0;

  async createAccount(accountId: string) {
    if (this.accounts.has(accountId)) throw new Error('AccountAlreadyExists');
    this.accounts.add(accountId);
  }
  async mintSeq() { return this.mintSeqNow; }

  async batchMint(mints: MintCall[], seq: number) {
    const f = this.fault('mint');
    if (f && !f.afterApply) throw f.error;
    this.calls++;
    if (seq <= this.mintSeqNow) this.duplicatesIgnored++;
    else {
      if (seq !== this.mintSeqNow + 1) throw new Error('Out-of-order sequence number');
      for (const m of mints) this.bal.set(`${m.account}|${m.tokenId}`, this.get(m.account, m.tokenId) + m.amount);
      this.mintSeqNow = seq;
    }
    if (f?.afterApply) throw f.error;
  }

  async sendMany(signer: Signer, legs: TransferLeg[], seq: number) {
    const f = this.fault('send');
    if (f && !f.afterApply) throw f.error;
    if (!this.accounts.has(signer.accountId)) throw new Error(`Account ${signer.accountId} does not exist`);
    this.calls++;
    const last = this.sendSeqNow.get(signer.accountId) ?? 0;
    if (seq <= last) this.duplicatesIgnored++;
    else {
      if (seq !== last + 1) throw new Error('Out-of-order sequence number');
      const next = new Map(this.bal); // atomic: all legs or none
      for (const l of legs) {
        const k = `${signer.accountId}|${l.tokenId}`;
        if ((next.get(k) ?? 0) < l.amount) throw new Error('Not enough balance');
        next.set(k, (next.get(k) ?? 0) - l.amount);
        next.set(`${l.to}|${l.tokenId}`, (next.get(`${l.to}|${l.tokenId}`) ?? 0) + l.amount);
      }
      this.bal = next;
      this.sendSeqNow.set(signer.accountId, seq);
    }
    if (f?.afterApply) throw f.error;
  }

  async balanceOf(a: string, t: string) { return this.get(a, t); }
}

class FakeWallets implements Wallets {
  private data = new Map<string, { accountId: string; publicKey: string; onChain: boolean }>();
  constructor(private parent: string) {}
  accountIdOf = (id: string) => `${id}.${this.parent}`;
  getOrCreate(id: string) {
    if (!this.data.has(id)) this.data.set(id, { accountId: this.accountIdOf(id), publicKey: `ed25519:pub-${id}`, onChain: false });
    return this.data.get(id)!;
  }
  markOnChain(id: string) { this.getOrCreate(id).onChain = true; }
  secretKeyOf(id: string) { return `ed25519:sec-${id}`; }
}

const CONTRACT = 'oja-items.testnet';
const me = 'ada@example.com';

function setup(opts: { game?: Game; chain?: FakeChain; stateFile?: string; wallets?: Map<string, FakeWallets> } = {}) {
  const game = opts.game ?? new Game(4);
  const chain = opts.chain ?? new FakeChain();
  const stateFile = opts.stateFile ?? join(mkdtempSync(join(tmpdir(), 'nims-sync-')), 'chain-state.json');
  const wallets = opts.wallets ?? new Map<string, FakeWallets>();
  const logs: string[] = [];
  const sync = new ChainSync({
    game, ops: chain, contractId: CONTRACT, stateFile, log: (m) => logs.push(m), sleep: async () => {},
    rootWallets: wallets.get('root') ?? (wallets.set('root', new FakeWallets(CONTRACT)), wallets.get('root')!),
    walletsFor: (ns) => wallets.get(ns) ?? (wallets.set(ns, new FakeWallets(ns)), wallets.get(ns)!),
  });
  return { game, chain, sync, stateFile, wallets, logs };
}

/** Play a little: the human trades, the town moves. */
function play(g: Game, hours: number) {
  g.state(me);
  for (let h = 0; h < hours; h++) {
    if (h % 3 === 0) { g.gather(me, 'iron'); g.sell(me, 'anil', 'iron', 20); }
    if (h % 5 === 0) { g.gather(me, 'tomatoes'); g.sell(me, 'mira', 'tomatoes', 20, true); }
    g.tickOnce();
  }
}

/** Let every window finish (jump the clock), then settle until nothing is left. */
async function drain(game: Game, sync: ChainSync) {
  game.w.hour += 200;
  for (let i = 0; i < 400; i++) {
    const r = await sync.step();
    if (r === 'idle') return;
    if (r === 'paused' || r === 'waiting') throw new Error(`stuck: ${r}`);
  }
  throw new Error('did not finish');
}

describe('ChainSync', () => {
  it('starts an epoch from the game’s current state, as an exact mirror of goods and coins', async () => {
    const { game, chain, sync } = setup();
    play(game, 20);
    expect(await sync.step()).toBe('reset'); // starting the epoch
    const v = await sync.verify();
    expect(v.mismatches).toEqual([]);
    expect(v.checked).toBeGreaterThan(30);
    expect(sync.status()).toMatchObject({ enabled: true, epoch: 1, namespace: `g1.${CONTRACT}`, behind: 0, paused: false });
    expect(chain.calls).toBeGreaterThan(0);
  });

  it('streams new activity and stays an exact mirror', async () => {
    const { game, sync } = setup();
    play(game, 10);
    await sync.step();
    play(game, 40); // a lot more happens: trades, customers, rent, restocks, dividends
    await drain(game, sync);
    expect((await sync.verify()).mismatches).toEqual([]);
    expect(sync.status().behind).toBe(0);
  });

  it('settles a player who joins later, creating their account the first time they send something', async () => {
    const { game, chain, sync } = setup();
    play(game, 8);
    await sync.step();
    game.state('late@example.com');
    const late = game.w.players.find((p) => p.id !== game.w.players.find((x) => x.strategy === 'human' && x.id === sync.accountOf('')?.split('.')[0])?.id && p.strategy === 'human' && p.cash === 4000 && p !== game.w.players.find((x) => x.strategy === 'human'))!;
    expect(late).toBeTruthy();
    game.w.shocks = [];
    game.gather('late@example.com', 'iron');
    game.sell('late@example.com', 'anil', 'iron', 20);
    play(game, 12);
    await drain(game, sync);
    expect((await sync.verify()).mismatches).toEqual([]);
    expect([...chain.accounts].some((a) => a.startsWith(`${late.id}.`))).toBe(true);
  });

  it('waits for a window to finish before settling it, so repeated moves can be merged', async () => {
    const { game, sync } = setup();
    game.state(me);
    await sync.step(); // epoch
    game.gather(me, 'iron');
    game.sell(me, 'anil', 'iron', 10); // ledger entries at the current hour
    expect(await sync.step()).toBe('waiting');
    game.w.hour += 7; // the window is over
    const r = await sync.step();
    expect(r).toBe('settled');
  });

  it('never skips or repeats an entry: the cursor moves by exactly what was settled', async () => {
    const { game, sync, stateFile } = setup();
    play(game, 6);
    await sync.step();
    const before = JSON.parse(readFileSync(stateFile, 'utf8')).cursor;
    expect(before).toBe(game.ledgerEnd()); // the epoch starts at the end of what had happened
    play(game, 15);
    const end = game.ledgerEnd();
    await drain(game, sync);
    expect(JSON.parse(readFileSync(stateFile, 'utf8')).cursor).toBe(end + (game.ledgerEnd() - end));
    expect(sync.status().behind).toBe(0);
  });

  it('lets the game drop only what is settled', async () => {
    const { game, sync } = setup();
    play(game, 6);
    await sync.step();
    play(game, 10);
    const unsettledFrom = JSON.parse(readFileSync(sync['o'].stateFile, 'utf8')).cursor;
    expect(game.ledgerBase).toBeLessThanOrEqual(unsettledFrom); // nothing unsettled has been dropped
    const kept = game.ledgerEnd() - unsettledFrom;
    expect(game.ledgerFrom(unsettledFrom).length).toBe(kept);
    await drain(game, sync);
    expect(game.w.ledger.length).toBe(0); // everything settled, so everything can go
    expect(game.ledgerBase).toBe(game.ledgerEnd());
  });

  it('survives a call that LANDED but reported a timeout: the retry is a harmless no-op, nothing is applied twice', async () => {
    const { game, chain, sync } = setup();
    play(game, 6);
    await sync.step();
    play(game, 20);
    chain.faults.push({ op: 'send', nth: 2, error: new Error('ETIMEDOUT waiting for the transaction'), afterApply: true });
    chain.faults.push({ op: 'mint', nth: 1, error: new Error('fetch failed'), afterApply: true });
    game.w.hour += 200;
    let retries = 0;
    for (let i = 0; i < 400; i++) {
      const r = await sync.step();
      if (r === 'retry') retries++;
      if (r === 'idle') break;
    }
    expect(retries).toBeGreaterThanOrEqual(1);
    expect(chain.duplicatesIgnored).toBeGreaterThanOrEqual(1); // the contract recognised the repeat
    expect((await sync.verify()).mismatches).toEqual([]); // and the totals are exactly right
  });

  it('retries a call that never reached the chain (rate limited) without any harm', async () => {
    const { game, chain, sync } = setup();
    play(game, 6);
    await sync.step();
    play(game, 20);
    chain.faults.push({ op: 'send', nth: 1, error: new Error('429 Rate limits exceeded') });
    chain.faults.push({ op: 'send', nth: 3, error: new Error('429 Rate limits exceeded') });
    game.w.hour += 200;
    for (let i = 0; i < 400; i++) if ((await sync.step()) === 'idle') break;
    expect((await sync.verify()).mismatches).toEqual([]);
    expect(sync.status().epoch).toBe(1); // no epoch was burned for a rate limit
  });

  it('resumes after a restart in the middle of a chunk, exactly where it stopped', async () => {
    const first = setup();
    play(first.game, 6);
    await first.sync.step();
    play(first.game, 25);
    first.game.w.hour += 200;
    first.chain.faults.push({ op: 'send', nth: 2, error: new Error('ECONNRESET') }); // the process "dies" here
    expect(await first.sync.step()).toBe('retry'); // gets partway into the first chunk
    const saved = JSON.parse(readFileSync(first.stateFile, 'utf8'));
    expect(saved.cursor).toBeLessThan(first.game.ledgerEnd()); // stopped before the end

    // A brand new settler (a server restart) on the same game, chain, state file and keys.
    const second = setup({ game: first.game, chain: first.chain, stateFile: first.stateFile, wallets: first.wallets });
    expect(second.sync.status().epoch).toBe(1); // it picked up the same epoch, it did not start over
    for (let i = 0; i < 400; i++) if ((await second.sync.step()) === 'idle') break;
    expect((await second.sync.verify()).mismatches).toEqual([]);
  });

  it('starts a fresh epoch from the game’s state when the chain rejects a call, and the new epoch is exact', async () => {
    const { game, chain, sync } = setup();
    play(game, 6);
    await sync.step();
    play(game, 20);
    chain.faults.push({ op: 'send', nth: 2, error: new Error('Smart contract panicked: Not enough balance') });
    game.w.hour += 200;
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const r = await sync.step();
      seen.add(r);
      if (r === 'idle') break;
    }
    expect(seen.has('reset')).toBe(true);
    expect(sync.status().epoch).toBe(2);
    expect(sync.status().namespace).toBe(`g2.${CONTRACT}`);
    expect((await sync.verify()).mismatches).toEqual([]);
  });

  it('pauses, without starting new epochs, when the paying account runs out of NEAR', async () => {
    const { game, chain, sync } = setup();
    play(game, 6);
    await sync.step();
    play(game, 10);
    game.w.hour += 200;
    chain.faults.push({ op: 'send', nth: 1, error: new Error('Account oja-items.testnet lacks balance 5064698309107200000003 yoctoNear for state') });
    expect(await sync.step()).toBe('paused');
    expect(sync.status().epoch).toBe(1);
    expect(sync.status().error).toMatch(/out of testnet NEAR/);
  });

  it('pauses instead of burning accounts if it keeps failing', async () => {
    const { game, chain, sync, logs } = setup();
    play(game, 6);
    await sync.step();
    for (let n = 1; n <= 12; n++) chain.faults.push({ op: 'send', nth: n, error: new Error('Smart contract panicked: Not enough balance') });
    game.w.hour += 200;
    let last = '';
    for (let i = 0; i < 100; i++) {
      play(game, 4);
      game.w.hour += 100;
      last = await sync.step();
      if (last === 'paused') break;
    }
    expect(sync.status().paused).toBe(true);
    expect(sync.status().error).toMatch(/Too many restarts/);
    expect(logs.some((l) => l.includes('Too many restarts'))).toBe(true);
  });

  it('starts a new epoch rather than guess if the process died while minting opening balances', async () => {
    const a = setup();
    play(a.game, 6);
    await a.sync.step(); // epoch 1 is live
    // Pretend the process was killed half way through minting epoch 1's opening balances.
    const saved = JSON.parse(readFileSync(a.stateFile, 'utf8'));
    writeFileSync(a.stateFile, JSON.stringify({ ...saved, stage: 'genesis' }));
    const b = setup({ game: a.game, chain: a.chain, stateFile: a.stateFile, wallets: a.wallets });
    expect(b.sync.status().epoch).toBeNull(); // it won't trust the half-minted epoch
    await b.sync.step();
    expect(b.sync.status().epoch).toBe(2);
    expect((await b.sync.verify()).mismatches).toEqual([]);
  });

  it('forgets a rejected epoch on disk, so a restart cannot resume it', async () => {
    const { game, chain, sync, stateFile } = setup();
    play(game, 6);
    await sync.step();
    play(game, 10);
    chain.faults.push({ op: 'send', nth: 1, error: new Error('Smart contract panicked: nope') });
    game.w.hour += 200;
    expect(await sync.step()).toBe('reset');
    expect(existsSync(stateFile)).toBe(false);
  });

  it('starts a fresh epoch if the game was restored from an older save than the chain position', async () => {
    const a = setup();
    play(a.game, 6);
    await a.sync.step();
    play(a.game, 10);
    await drain(a.game, a.sync);
    const older = new Game(4); // a game that has seen far less than the chain has
    const b = setup({ game: older, chain: a.chain, stateFile: a.stateFile, wallets: a.wallets });
    expect(b.sync.status().epoch).toBeNull();
    await b.sync.step();
    expect(b.sync.status().epoch).toBe(2);
    expect((await b.sync.verify()).mismatches).toEqual([]);
  });

  it('skips a namespace that already exists on the chain', async () => {
    const chain = new FakeChain();
    chain.accounts.add(`g1.${CONTRACT}`);
    chain.accounts.add(`g2.${CONTRACT}`);
    const { game, sync } = setup({ chain });
    game.state(me);
    await sync.step();
    expect(sync.status().epoch).toBe(3);
  });

  it('reports a mismatch if the chain and the game ever differ', async () => {
    const { game, chain, sync } = setup();
    play(game, 6);
    await sync.step();
    chain.bal.set(`${sync.accountOf(game.w.merchants[0].id)}|coins`, 1); // someone tampered
    const v = await sync.verify();
    expect(v.mismatches.length).toBeGreaterThan(0);
    expect(v.mismatches[0]).toMatch(/coins: chain 1, game/);
  });

  it('says it is not caught up instead of comparing while entries are pending', async () => {
    const { game, sync } = setup();
    play(game, 4);
    await sync.step();
    play(game, 4);
    expect((await sync.verify()).mismatches[0]).toMatch(/Not caught up/);
  });

  it('never touches the state file when there is no chain (it just is not created)', () => {
    const { stateFile } = setup();
    expect(existsSync(stateFile)).toBe(false);
  });
});

describe('ChainSync on the server’s own seed', () => {
  it.each([1, 2, 3])('a fresh game with seed %i, run for a while with no human at all', async (seed) => {
    const { game, sync, logs } = setup({ game: new Game(seed) });
    await sync.step();
    for (let h = 0; h < 200; h++) { game.tickOnce(); if (h % 5 === 4) await sync.step(); }
    await drain(game, sync);
    expect(logs.filter((l) => /rejected/.test(l))).toEqual([]);
    expect((await sync.verify()).mismatches).toEqual([]);
  });
});

describe('ChainSync while the game keeps moving', () => {
  it('a retried chunk is the same chunk, even if the backlog grows enough to change the usual window size', async () => {
    const { game, chain, sync, logs, stateFile } = setup();
    play(game, 4);
    await sync.step(); // epoch
    const behind = () => game.ledgerEnd() - JSON.parse(readFileSync(stateFile, 'utf8')).cursor;
    while (behind() < 330) play(game, 1); // just under the point where windows get wider
    game.w.hour += 10; // the first window has closed
    chain.faults.push({ op: 'send', nth: 2, error: new Error('429 Rate limits exceeded') });
    expect(await sync.step()).toBe('retry'); // partway into the chunk
    while (behind() < 700) play(game, 1); // meanwhile the game carries on; windows are now wider
    for (let i = 0; i < 400; i++) if ((await sync.step()) === 'idle') break;
    await drain(game, sync);
    expect(logs.filter((l) => /rejected/.test(l))).toEqual([]);
    expect(sync.status().epoch).toBe(1);
    expect((await sync.verify()).mismatches).toEqual([]);
  });
});

describe('ChainSync under every kind of play', () => {
  it('stays an exact mirror while several players do everything, with settling interleaved', async () => {
    const { game, chain, sync, logs } = setup();
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    const who = ['a@x.io', 'b@x.io', 'c@x.io'];
    const items = ['iron', 'copper wire', 'tomatoes', 'pepper', 'flour', 'cotton', 'lace', 'thread'] as never[];
    const merchants = () => game.w.merchants.map((m) => m.id);
    who.forEach((e) => game.state(e));
    await sync.step();
    const seen = new Set<string>();
    const ok = new Map<string, number>();
    const tally = (k: string, r: { ok: boolean }) => ok.set(k, (ok.get(k) ?? 0) + (r.ok ? 1 : 0));
    for (let h = 0; h < 160; h++) {
      for (const e of who) {
        if (h % 4 === 0) transferCoins(game.w, 'town', game.playerFor(e), 3000); // a steady income, so every kind of action gets exercised
        const r = rnd();
        const m = pick(merchants());
        const it = pick(items);
        if (r < 0.25) tally('gather', game.gather(e, it));
        else if (r < 0.45) tally('sell', game.sell(e, m, it, 1 + Math.floor(rnd() * 20), rnd() < 0.3));
        else if (r < 0.55) tally('buy', game.buy(e, m, it, 1 + Math.floor(rnd() * 10), rnd() < 0.3));
        else if (r < 0.62) tally('buyShares', game.buyShares(e, m, 1 + Math.floor(rnd() * 3)));
        else if (r < 0.66) tally('sellShares', game.sellShares(e, m, 1));
        else if (r < 0.72) tally('contribute', game.contribute(e, m, 100 + Math.floor(rnd() * 500)));
        else if (r < 0.75) tally('openStall', game.openStall(e, pick(['produce', 'fabric', 'scrap'])));
        else if (r < 0.80) tally('stallStock', game.stallStock(e, it, 1 + Math.floor(rnd() * 8)));
        else if (r < 0.83) tally('stallTake', game.stallTake(e, it, 1 + Math.floor(rnd() * 4)));
        else if (r < 0.86) tally('stallCash', game.stallCash(e, rnd() < 0.5 ? 'deposit' : 'withdraw', 50 + Math.floor(rnd() * 300)));
        else if (r < 0.88) game.stallPrice(e, it, 40, 400);
        else if (r < 0.9) tally('upgrade', game.upgrade(e, 'pickup'));
      }
      game.tickOnce();
      if (h % 7 === 6) { game.w.hour += rnd() < 0.3 ? 30 : 0; seen.add(await sync.step()); }
    }
    await drain(game, sync);
    expect(logs.filter((l) => /rejected/.test(l))).toEqual([]);
    expect(sync.status().epoch).toBe(1);
    expect((await sync.verify()).mismatches).toEqual([]);
    expect(chain.calls).toBeGreaterThan(20);
    // the test is only meaningful if the play really exercised these things
    for (const k of ['gather', 'sell', 'buyShares']) expect(ok.get(k) ?? 0, k).toBeGreaterThan(3);
    console.log('actions that worked:', Object.fromEntries(ok));
  });
});

describe('planning a chunk', () => {
  const e = (kind: 'mint' | 'transfer', to: string, item: string, units: number, from?: string): LedgerEntry => ({ hour: 0, kind, to, item: item as LedgerEntry['item'], units, ...(from ? { from } : {}) });

  it('merges repeated moves into one without changing any total, keeping first-seen order', () => {
    const out = aggregate([e('transfer', 'b', 'iron', 3, 'a'), e('mint', 'c', 'coins', 5), e('transfer', 'b', 'iron', 4, 'a'), e('transfer', 'a', 'iron', 1, 'b'), e('mint', 'c', 'coins', 7), e('transfer', 'b', 'iron', 0, 'a')]);
    expect(out.map((x) => `${x.kind}:${x.from ?? ''}>${x.to}:${x.item}=${x.units}`)).toEqual(['transfer:a>b:iron=7', 'mint:>c:coins=12', 'transfer:b>a:iron=1']);
  });

  it('plans mints first, then each signer’s own transfers', () => {
    const steps = planChunk([e('mint', 'a', 'iron', 10), e('transfer', 'b', 'iron', 4, 'a')], 'ns.x');
    expect(steps[0]).toMatchObject({ kind: 'mint' });
    expect(steps[1]).toMatchObject({ kind: 'send', call: { signer: 'a.ns.x' } });
  });
});
