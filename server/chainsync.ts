/**
 * The live settler: streams the running game's goods and coins to the chain in the background.
 *
 * Gameplay never waits on this (CLAUDE.md). The game applies every trade instantly and appends it to its
 * ledger; this loop reads the ledger from a remembered position and settles it in time-chunks, with every
 * account signing its own transfers (the relayer only pays gas). If the chain is slow the chunks grow, so
 * it keeps up instead of falling behind. Progress is saved after every call, so a restart picks up exactly
 * where it stopped.
 *
 * EPOCHS. The chain can only ever be an exact mirror of the game, so if it ever might not be (a crash in the
 * middle of a call, a contract rejection), the settler does not try to patch it. It starts a fresh epoch:
 * a new namespace of accounts, minted from the game's current state, and carries on from there.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { COINS, LedgerEntry } from '../sim/world';
import type { Game } from './game';
import { buildAgentBatches, SignedCall } from './rounds';
import { accountFor, MintCall, TransferLeg } from './settle';

export interface Signer { accountId: string; secretKey: string }

/** What the settler needs from the chain. The real one is server/agent-chain.ts; tests use a fake. */
export interface ChainOps {
  createAccount(accountId: string, publicKey: string, creator?: Signer, fund?: bigint): Promise<void>;
  /** `seq` makes the call idempotent: the contract ignores a number it already applied, so a retry can never mint twice. */
  batchMint(mints: MintCall[], seq: number): Promise<void>;
  /** Same for a signer's transfers: numbered 1, 2, 3 ... per signer. */
  sendMany(signer: Signer, legs: TransferLeg[], seq: number): Promise<void>;
  /** The last mint sequence number the contract has applied. */
  mintSeq(): Promise<number>;
  balanceOf(accountId: string, token: string): Promise<number>;
}

/** A key store for accounts under one namespace. server/wallets.ts WalletStore fits. */
export interface Wallets {
  accountIdOf(id: string): string;
  getOrCreate(id: string): { accountId: string; publicKey: string; onChain: boolean };
  markOnChain(id: string): void;
  secretKeyOf(id: string): string;
}

export interface ChainSyncOptions {
  game: Game;
  ops: ChainOps;
  /** The contract account, e.g. oja-items.testnet. Namespaces live under it. */
  contractId: string;
  /** Keys for the namespace accounts themselves (parent = the contract account). */
  rootWallets: Wallets;
  /** Keys for the accounts inside one namespace. */
  walletsFor: (nsAccount: string) => Wallets;
  stateFile: string;
  log?: (msg: string) => void;
  /** Coins to give a new namespace account so it can create the accounts under it (default 0.3 NEAR). */
  nsFund?: bigint;
  sleep?: (ms: number) => Promise<void>;
}

interface State {
  epoch: number;
  /** e.g. "g3.oja-items.testnet" */
  ns: string;
  /** Ledger entries before this number are on the chain. */
  cursor: number;
  /** 'genesis' until the opening balances are all minted, then 'live'. */
  stage: 'genesis' | 'live';
  /** Calls of the current chunk already done. */
  callsDone: number;
  /** How many ledger entries the current chunk covers, fixed when it starts so a retry plans exactly the same calls. */
  chunk?: number;
  /**
   * Sequence numbers already used: the owner's mints, and each signer's transfers. A call that is retried
   * (after a timeout, or after a restart) reuses its number, and the contract ignores it if it already landed.
   */
  mintSeq: number;
  seqs: Record<string, number>;
}

const TRANSIENT = /429|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|timeout|rate limit|socket hang up|network|ECONNREFUSED/i;
const MINT_CHUNK = 40;
/** A window of this many game-hours is settled together; it grows when the chain is behind. */
const chunkHoursFor = (backlog: number) => (backlog > 1500 ? 24 : backlog > 400 ? 12 : 6);

/** Merge repeated legs into one per (from, to, token), and repeated mints into one per (to, token). Totals are unchanged. */
export function aggregate(entries: LedgerEntry[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  const at = new Map<string, number>();
  for (const e of entries) {
    if (e.units <= 0) continue;
    const key = `${e.kind}|${e.from ?? ''}|${e.to}|${e.item}`;
    const i = at.get(key);
    if (i === undefined) { at.set(key, out.length); out.push({ ...e }); } else out[i].units += e.units;
  }
  return out;
}

type Step = { kind: 'mint'; mints: MintCall[] } | { kind: 'send'; call: SignedCall };

/** The calls that settle these entries, in order. Aggregated if that can be scheduled, otherwise the raw order. */
export function planChunk(entries: LedgerEntry[], ns: string, opening?: Map<string, number>): Step[] {
  const build = (es: LedgerEntry[]) => buildAgentBatches(es, ns, 1e9, opening);
  let batches;
  try {
    batches = build(aggregate(entries));
  } catch {
    batches = build(entries); // a cycle of dependent legs: keep the original order
  }
  const steps: Step[] = [];
  for (const b of batches) {
    for (let i = 0; i < b.mints.length; i += MINT_CHUNK) steps.push({ kind: 'mint', mints: b.mints.slice(i, i + MINT_CHUNK) });
    for (const round of b.rounds) for (const call of round) steps.push({ kind: 'send', call });
  }
  return steps;
}

export class ChainSync {
  private state: State | null = null;
  /** The highest epoch used so far, so a fresh one never revisits a namespace. */
  private lastEpoch = 0;
  private wallets: Wallets | null = null;
  private totalCalls = 0;
  private resets: number[] = [];
  private lastSettledAt: Date | null = null;
  private lastError = '';
  /** A plain description of the call in flight, kept so a rejection can say what it was. */
  private lastCall = '';
  private lastSend: { signer: string; legs: TransferLeg[] } | null = null;
  private paused = false;
  private stopped = false;
  private readonly log: (m: string) => void;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private o: ChainSyncOptions) {
    this.log = o.log ?? (() => {});
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.state = this.load();
    this.lastEpoch = this.state?.epoch ?? this.lastEpoch;
    const g = o.game;
    if (this.state && (this.state.cursor > g.ledgerEnd() || this.state.cursor < g.ledgerBase)) {
      // The saved game and the chain disagree about how much has happened (e.g. the game was restored from an older save).
      this.log('Chain: the saved game does not match the chain position. Starting a fresh epoch.');
      this.state = null;
      rmSync(o.stateFile, { force: true });
    }
    if (this.state) {
      this.wallets = o.walletsFor(this.state.ns);
      o.game.markSettled(this.state.cursor);
    }
  }

  // ---- state file ----------------------------------------------------------------------------

  private load(): State | null {
    if (!existsSync(this.o.stateFile)) return null;
    try {
      const s = JSON.parse(readFileSync(this.o.stateFile, 'utf8')) as State;
      if (s.stage === 'genesis') {
        this.lastEpoch = s.epoch;
        // The opening balances came from the game's state at that moment, which we can no longer reproduce.
        this.log('Chain: the last run stopped while minting opening balances. Starting a fresh epoch.');
        return null;
      }
      // A call that was in flight is just retried: its sequence number makes that safe.
      return { ...s, seqs: s.seqs ?? {}, mintSeq: s.mintSeq ?? 0 };
    } catch {
      return null;
    }
  }

  private save() {
    if (!this.state) return;
    mkdirSync(dirname(this.o.stateFile), { recursive: true });
    const tmp = `${this.o.stateFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 });
    renameSync(tmp, this.o.stateFile);
  }

  // ---- epochs --------------------------------------------------------------------------------

  /** Everything the game holds right now, as opening balances. Computed in one go so it matches `cursor` exactly. */
  private openingBalances(ns: string, includeZero = false): MintCall[] {
    const g = this.o.game.w;
    const mints: MintCall[] = [];
    const add = (id: string, tokenId: string, amount: number) => { if (amount > 0 || includeZero) mints.push({ account: accountFor(id, ns), tokenId, amount }); };
    for (const m of g.merchants) {
      add(m.id, COINS, m.cash);
      // every good this merchant trades, even at zero, so a stray balance on the chain would show up
      for (const item of new Set([...Object.keys(m.target), ...Object.keys(m.stock)])) add(m.id, item, m.stock[item as keyof typeof m.stock] ?? 0);
      add(`fund-${m.id}`, COINS, m.fund.pool);
    }
    for (const p of g.players) {
      add(p.id, COINS, p.cash);
      for (const [item, n] of Object.entries(p.inventory)) add(p.id, item, n ?? 0);
    }
    return mints;
  }

  /**
   * What the chain holds when `cursor` entries are settled: the game's holdings now, with every unsettled entry undone.
   * Exact because replaying the ledger reproduces every balance (see coins.test.ts).
   */
  private chainBalancesAt(cursor: number): Map<string, number> {
    const ns = this.state!.ns;
    const bal = new Map<string, number>();
    const k = (a: string, t: string) => `${a}|${t}`;
    for (const m of this.openingBalances(ns)) bal.set(k(m.account, m.tokenId), m.amount);
    const add = (a: string, t: string, n: number) => bal.set(k(a, t), (bal.get(k(a, t)) ?? 0) + n);
    for (const e of this.o.game.ledgerFrom(cursor)) {
      if (e.kind === 'transfer') add(accountFor(e.from!, ns), e.item, e.units);
      add(accountFor(e.to, ns), e.item, -e.units);
    }
    return bal;
  }

  private async startEpoch(): Promise<void> {
    const last = this.lastEpoch;
    const now = Date.now();
    this.resets = this.resets.filter((t) => now - t < 10 * 60_000);
    this.resets.push(now);
    if (this.resets.length > 3) {
      this.paused = true;
      this.lastError = 'Too many restarts in ten minutes. Settlement is paused until the server restarts.';
      this.log(`Chain: ${this.lastError}`);
      return;
    }
    for (let epoch = last + 1; epoch < last + 50; epoch++) {
      const nsName = `g${epoch}`;
      const nsAccount = `${nsName}.${this.o.contractId}`;
      const root = this.o.rootWallets.getOrCreate(nsName);
      try {
        await this.o.ops.createAccount(root.accountId, root.publicKey, undefined, this.o.nsFund ?? 300_000_000_000_000_000_000_000n);
      } catch (e) {
        if (/already exists|AccountAlreadyExists/i.test(String(e))) continue; // that namespace is taken: try the next
        throw e;
      }
      this.o.rootWallets.markOnChain(nsName);
      // Capture the position and the opening balances together, with no await between them.
      const cursor = this.o.game.ledgerEnd();
      const mints = this.openingBalances(nsAccount);
      this.lastEpoch = epoch;
      this.state = { epoch, ns: nsAccount, cursor, stage: 'genesis', callsDone: 0, mintSeq: await this.o.ops.mintSeq(), seqs: {} };
      this.wallets = this.o.walletsFor(nsAccount);
      this.save();
      this.log(`Chain: epoch ${epoch} (${nsAccount}). Minting ${mints.length} opening balances.`);
      for (let i = 0; i < mints.length; i += MINT_CHUNK) {
        const seq = this.state.mintSeq + 1;
        await this.o.ops.batchMint(mints.slice(i, i + MINT_CHUNK), seq);
        this.totalCalls++;
        this.state.mintSeq = seq;
        this.save();
      }
      this.state.stage = 'live';
      this.save();
      this.o.game.markSettled(cursor);
      this.lastError = '';
      return;
    }
    throw new Error('Could not find a free namespace');
  }

  // ---- settling ------------------------------------------------------------------------------

  /** Make sure `accountId` exists on chain and return a signer for it. */
  private async signerFor(accountId: string): Promise<Signer> {
    const st = this.state!;
    const id = accountId.slice(0, accountId.length - st.ns.length - 1);
    const w = this.wallets!.getOrCreate(id);
    if (!w.onChain) {
      const nsName = st.ns.slice(0, st.ns.length - this.o.contractId.length - 1);
      await this.o.ops.createAccount(w.accountId, w.publicKey, { accountId: st.ns, secretKey: this.o.rootWallets.secretKeyOf(nsName) });
      this.wallets!.markOnChain(id);
    }
    return { accountId: w.accountId, secretKey: this.wallets!.secretKeyOf(id) };
  }

  /** Settle one chunk. Returns what happened, so a caller can decide how long to wait. */
  async step(): Promise<'idle' | 'settled' | 'waiting' | 'retry' | 'reset' | 'paused'> {
    if (this.paused) return 'paused';
    try {
      if (!this.state) { await this.startEpoch(); return this.paused ? 'paused' : 'reset'; }
      const g = this.o.game;
      const st = this.state;
      const end = g.ledgerEnd();
      if (st.cursor >= end) return 'idle';

      const backlog = end - st.cursor;
      const hours = chunkHoursFor(backlog);
      const first = g.ledgerFrom(st.cursor, 1)[0];
      // Wait until the window is over, so repeated moves can be merged. (A big backlog never waits.)
      if (backlog < 400 && first.hour + hours > g.w.hour) return 'waiting';
      // A chunk is pinned the first time it is planned. The game keeps adding entries while we work (and the usual
      // window size changes with the backlog), so a retry must not re-plan a different chunk from the same position.
      if (st.chunk === undefined) {
        st.chunk = g.ledgerFrom(st.cursor, 20_000).filter((e) => e.hour < first.hour + hours).length;
        this.save();
      }
      const entries = g.ledgerFrom(st.cursor, st.chunk);

      const steps = planChunk(entries, st.ns, this.chainBalancesAt(st.cursor));
      for (let i = st.callsDone; i < steps.length; i++) {
        const s = steps[i];
        if (s.kind === 'mint') {
          const seq = st.mintSeq + 1;
          this.lastCall = `mint #${seq} of ${s.mints.length} balances (call ${i + 1}/${steps.length}, entries ${st.cursor}..${st.cursor + entries.length})`;
          await this.o.ops.batchMint(s.mints, seq);
          st.mintSeq = seq;
        } else {
          const signer = await this.signerFor(s.call.signer);
          const seq = (st.seqs[signer.accountId] ?? 0) + 1;
          this.lastSend = { signer: signer.accountId, legs: s.call.legs };
          this.lastCall = `send #${seq} by ${signer.accountId} (call ${i + 1}/${steps.length}, entries ${st.cursor}..${st.cursor + entries.length}): ${JSON.stringify(s.call.legs)}`;
          await this.o.ops.sendMany(signer, s.call.legs, seq);
          st.seqs[signer.accountId] = seq;
        }
        this.totalCalls++;
        st.callsDone = i + 1;
        this.save();
      }
      st.cursor += entries.length;
      st.callsDone = 0;
      st.chunk = undefined;
      this.save();
      g.markSettled(st.cursor);
      this.lastSettledAt = new Date();
      this.lastError = '';
      return 'settled';
    } catch (e) {
      const msg = String((e as Error)?.message ?? e) + JSON.stringify((e as { cause?: unknown })?.cause ?? '');
      this.lastError = msg.slice(0, 300);
      if (TRANSIENT.test(msg)) {
        // Safe to retry whatever happened: the call keeps its sequence number, so if it did land the retry is a no-op.
        this.log(`Chain: slow or busy, will retry (${this.lastError.slice(0, 120)})`);
        return 'retry';
      }
      if (/lacks balance|LackBalanceForState|NotEnoughBalance/i.test(msg)) {
        // Not a problem with the game or the chain state: the paying account ran dry. A new epoch would only spend more.
        this.paused = true;
        this.lastError = 'The settlement account is out of testnet NEAR. Top it up (testnet faucet) and restart the server. Gameplay is unaffected.';
        this.log(`Chain: ${this.lastError}`);
        return 'paused';
      }
      this.log(`Chain: a call was rejected (${this.lastError.slice(0, 200)}). Starting a fresh epoch from the game's current state.`);
      if (this.lastCall) this.log(`Chain: the rejected call was ${this.lastCall}`);
      if (this.lastSend) {
        try {
          const held: string[] = [];
          for (const t of new Set(this.lastSend.legs.map((l) => l.tokenId))) held.push(`${t}=${await this.o.ops.balanceOf(this.lastSend.signer, t)}`);
          this.log(`Chain: that sender actually holds ${held.join(', ')}`);
        } catch { /* best effort */ }
      }
      this.state = null;
      rmSync(this.o.stateFile, { force: true }); // a restart must not resume an epoch we no longer trust
      return 'reset';
    }
  }

  /** Run until stop(). Settles whenever there is something to settle, and waits politely otherwise. */
  async run(): Promise<void> {
    let delay = 1000;
    while (!this.stopped) {
      const r = await this.step();
      delay = r === 'settled' ? 250 : r === 'retry' ? Math.min(30_000, delay * 2) : r === 'paused' ? 60_000 : r === 'reset' ? 2000 : 4000;
      if (r !== 'retry' && r !== 'settled') delay = Math.max(delay, 2000);
      await this.sleep(delay);
    }
  }

  stop() { this.stopped = true; }

  // ---- reporting -----------------------------------------------------------------------------

  /** How far behind the chain is. Safe to call any time. */
  status() {
    const g = this.o.game;
    return {
      enabled: true as const,
      epoch: this.state?.epoch ?? null,
      namespace: this.state?.ns ?? null,
      contract: this.o.contractId,
      /** Ledger entries not yet on the chain. */
      behind: this.state ? g.ledgerEnd() - this.state.cursor : null,
      calls: this.totalCalls,
      lastSettledAt: this.lastSettledAt?.toISOString() ?? null,
      paused: this.paused,
      error: this.lastError || null,
    };
  }

  /** What a curious player can look up on a block explorer: their own account, and how far settlement has got. */
  proof(simId: string): { account: string; explorer: string; behind: number } | null {
    const account = this.accountOf(simId);
    if (!account || !this.state) return null;
    return { account, explorer: `https://explorer.testnet.near.org/accounts/${account}`, behind: this.o.game.ledgerEnd() - this.state.cursor };
  }

  /** Where to look on a block explorer for one player's goods and coins. */
  accountOf(simId: string): string | null {
    return this.state ? accountFor(simId, this.state.ns) : null;
  }

  /**
   * Compare the chain with the game, account by account. Only meaningful when fully caught up (the game
   * can't be mid-chunk). Returns the differences; an empty list means the chain is an exact mirror.
   */
  async verify(): Promise<{ checked: number; mismatches: string[] }> {
    const st = this.state;
    if (!st) return { checked: 0, mismatches: ['No epoch yet'] };
    const g = this.o.game;
    if (st.cursor < g.ledgerEnd()) return { checked: 0, mismatches: [`Not caught up: ${g.ledgerEnd() - st.cursor} entries behind`] };
    // Expected balances, computed at once so a tick during the reads cannot confuse the comparison.
    const expected = new Map<string, number>();
    for (const m of this.openingBalances(st.ns, true)) expected.set(`${m.account}|${m.tokenId}`, m.amount);
    const mismatches: string[] = [];
    let checked = 0;
    for (const [key, want] of expected) {
      const [account, token] = key.split('|');
      const have = await this.o.ops.balanceOf(account, token);
      checked++;
      if (have !== want) mismatches.push(`${account} ${token}: chain ${have}, game ${want}`);
    }
    return { checked, mismatches };
  }
}
