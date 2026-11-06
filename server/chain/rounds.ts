/**
 * Round scheduler for self-signed settlement (Milestone 4).
 *
 * Every account (merchant or player) now signs its OWN outgoing transfers, so there is no single
 * ordered `settle` call any more. A leg can only run once its sender holds the items, and those
 * items may be on their way from another signer's leg ("Ruth's Salvage sells on iron he just bought").
 *
 * Fix: split each time-chunk into ROUNDS. In a round every signer submits the legs it can already
 * afford; within a round the signers are independent, so they may be submitted in any order or in
 * parallel. Items received during a round are spendable from the NEXT round.
 *
 * Why this is safe and always finishes: a leg only ever reduces its own sender's balance, so
 *  - legs of one sender keep their ledger order (per token), and running one early never hurts a later one;
 *  - the earliest unfinished leg always has its funds (everything before it already ran).
 */
import { LedgerEntry } from '../../sim/world';
import { accountFor, applyBatch, Balances, MAX_LEGS, MintCall, TransferLeg } from './settle';

/** One signed call: `signer` sends these legs (their `from` is always the signer). */
export interface SignedCall {
  signer: string;
  legs: TransferLeg[];
}
export type Round = SignedCall[];
export interface AgentBatch {
  /** Items entering the world (gathers, restocks). Minted by the owner before the rounds. */
  mints: MintCall[];
  rounds: Round[];
}

const key = (acct: string, token: string) => `${acct}|${token}`;

/** Plan rounds for ordered legs, given balances at the start (mints already applied). Mutates `bal` to the end state. */
export function planRounds(legs: TransferLeg[], bal: Balances): Round[] {
  const rounds: Round[] = [];
  let remaining = legs.filter((l) => l.amount > 0);
  while (remaining.length) {
    const roundBal = new Map(bal); // what each signer can spend THIS round
    const blocked = new Set<string>(); // sender|token pairs that skipped a leg: keep their order
    const bySigner = new Map<string, TransferLeg[]>();
    const left: TransferLeg[] = [];

    for (const l of remaining) {
      const k = key(l.from, l.tokenId);
      if (!blocked.has(k) && (roundBal.get(k) ?? 0) >= l.amount) {
        roundBal.set(k, (roundBal.get(k) ?? 0) - l.amount);
        const mine = bySigner.get(l.from) ?? [];
        const last = mine[mine.length - 1];
        if (last && last.to === l.to && last.tokenId === l.tokenId) last.amount += l.amount;
        else mine.push({ ...l });
        bySigner.set(l.from, mine);
      } else {
        blocked.add(k);
        left.push(l);
      }
    }
    if (!bySigner.size) throw new Error(`Cannot schedule: ${left[0].from} lacks ${left[0].amount} ${left[0].tokenId}`);

    const round: Round = [];
    for (const [signer, sl] of bySigner) {
      for (let i = 0; i < sl.length; i += MAX_LEGS) round.push({ signer, legs: sl.slice(i, i + MAX_LEGS) });
    }
    for (const c of round) applyBatch(bal, { mints: [], transfers: c.legs }); // credits land after the round
    rounds.push(round);
    remaining = left;
  }
  return rounds;
}

/** Whole ledger -> per-chunk mints + rounds. Balances carry across chunks. */
export function buildAgentBatches(ledger: LedgerEntry[], parent: string, chunkHours = 1, opening?: Balances): AgentBatch[] {
  const out: AgentBatch[] = [];
  const bal: Balances = new Map(opening); // a live epoch starts from what is already on chain
  const chunks = new Map<number, LedgerEntry[]>();
  for (const e of ledger) {
    if (e.units <= 0) continue;
    const c = Math.floor(e.hour / chunkHours);
    chunks.set(c, [...(chunks.get(c) ?? []), e]);
  }
  for (const [, es] of [...chunks].sort((a, b) => a[0] - b[0])) {
    const mints = new Map<string, MintCall>();
    const legs: TransferLeg[] = [];
    for (const e of es) {
      if (e.kind === 'mint') {
        const account = accountFor(e.to, parent);
        const m = mints.get(key(account, e.item));
        if (m) m.amount += e.units;
        else mints.set(key(account, e.item), { account, tokenId: e.item, amount: e.units });
      } else {
        legs.push({ from: accountFor(e.from!, parent), to: accountFor(e.to, parent), tokenId: e.item, amount: e.units });
      }
    }
    applyBatch(bal, { mints: [...mints.values()], transfers: [] });
    out.push({ mints: [...mints.values()], rounds: planRounds(legs, bal) });
  }
  return out;
}
