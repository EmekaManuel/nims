/**
 * Turns the sim's item ledger into batches for the items contract.
 *
 * Pure and chain-free so it can be tested without a network. server/chain.ts
 * submits the batches. Gameplay never waits on this: trades are
 * applied to game state instantly and settled a chunk at a time afterwards.
 */
import { LedgerEntry } from '../sim/world';

/** Max transfer legs per `settle` call, to stay well inside gas limits. */
export const MAX_LEGS = 100;

export interface MintCall {
  account: string; // NEAR account id
  tokenId: string;
  amount: number;
}
export interface TransferLeg {
  from: string;
  to: string;
  tokenId: string;
  amount: number;
}
/** One chain submission: mints first (order-free), then transfers in ledger order. */
export interface Batch {
  mints: MintCall[];
  transfers: TransferLeg[];
}

/** Sim id -> NEAR account, e.g. "mira" -> "mira.oja.testnet". */
export const accountFor = (simId: string, parent: string) => `${simId}.${parent}`;

/**
 * Group the ledger into batches of at most `chunkHours` in-game hours and `MAX_LEGS` transfers.
 *
 * Why this is safe: mints in a chunk are applied before its transfers, so nobody is overdrawn
 * by a mint that was recorded later in the same chunk. Transfers are NOT reordered across
 * different (from,to,item) legs, because a later leg can depend on an earlier one.
 * Only runs of identical consecutive legs are merged.
 */
export function buildBatches(ledger: LedgerEntry[], parent: string, chunkHours = 1): Batch[] {
  const batches: Batch[] = [];
  let mints = new Map<string, MintCall>();
  let transfers: TransferLeg[] = [];
  let chunk = -1;

  const flush = () => {
    if (mints.size || transfers.length) batches.push({ mints: [...mints.values()], transfers });
    mints = new Map();
    transfers = [];
  };

  for (const e of ledger) {
    if (e.units <= 0) continue;
    const c = Math.floor(e.hour / chunkHours);
    if (c !== chunk) {
      flush();
      chunk = c;
    }
    if (e.kind === 'mint') {
      const account = accountFor(e.to, parent);
      const key = `${account}|${e.item}`;
      const cur = mints.get(key);
      if (cur) cur.amount += e.units;
      else mints.set(key, { account, tokenId: e.item, amount: e.units });
      continue;
    }
    const leg = { from: accountFor(e.from!, parent), to: accountFor(e.to, parent), tokenId: e.item, amount: e.units };
    const last = transfers[transfers.length - 1];
    if (last && last.from === leg.from && last.to === leg.to && last.tokenId === leg.tokenId) {
      last.amount += leg.amount;
    } else {
      if (transfers.length >= MAX_LEGS) {
        // Close this batch (keeping its mints) and keep going in a transfer-only batch.
        batches.push({ mints: [...mints.values()], transfers });
        mints = new Map();
        transfers = [];
      }
      transfers.push(leg);
    }
  }
  flush();
  return batches;
}

/** Off-chain mirror of the contract's rules. Throws exactly where the contract would revert. */
export type Balances = Map<string, number>; // "account|token" -> amount
export function applyBatch(bal: Balances, b: Batch) {
  const add = (acc: string, tok: string, n: number) => bal.set(`${acc}|${tok}`, (bal.get(`${acc}|${tok}`) ?? 0) + n);
  for (const m of b.mints) add(m.account, m.tokenId, m.amount);
  for (const t of b.transfers) {
    if ((bal.get(`${t.from}|${t.tokenId}`) ?? 0) < t.amount) throw new Error(`Not enough balance: ${t.from} ${t.tokenId}`);
    add(t.from, t.tokenId, -t.amount);
    add(t.to, t.tokenId, t.amount);
  }
}
