/**
 * Milestone 4 live check: settle N sim hours on testnet where EVERY merchant and player signs its own
 * outgoing transfers (the relayer only pays gas), then compare merchant stock on chain to the sim.
 *
 *   npx tsx server/run-m4-check.ts [hours=12]
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { MerchantAgent } from '../merchants/agents/agent';
import { act, newPlayer } from '../sim/players';
import { tick } from '../sim/engine';
import { createWorld } from '../sim/world';
import { agentChain } from './agent-chain';
import { buildAgentBatches, SignedCall } from './rounds';
import { applyBatch, Balances, MintCall } from './settle';
import { WalletStore } from './wallets';

const HOURS = Number(process.argv[2] ?? 12);
// Each run lives in its own namespace account (e.g. v2.oja-items.testnet) so balances from earlier runs never interfere.
const NS = process.argv[3] ?? 'v2';
const chain = agentChain();
const parent = `${NS}.${chain.contractId}`; // merchants live at mira.v2.oja-items.testnet etc.
const root = new WalletStore('server/data/wallets.json', chain.contractId, process.env.MASTER_KEY!);
const wallets = new WalletStore(`server/data/wallets-${NS}.json`, parent, process.env.MASTER_KEY!);

// 1. Run the sim.
const players = [
  newPlayer('gatherer-1', 'gatherer'), newPlayer('gatherer-2', 'gatherer'), newPlayer('gatherer-3', 'gatherer'),
  newPlayer('arbitrageur', 'arbitrageur', 8_000), newPlayer('investor', 'investor', 40_000), newPlayer('flooder', 'flooder'),
];
const w = createWorld(21, players);
for (let h = 0; h < HOURS; h++) tick(w, act);
const batches = buildAgentBatches(w.ledger, parent, 4);

// 2. Dry run on the books: every merchant agent reviews its own legs before anything touches the chain.
type Step = { kind: 'mint'; mints: MintCall[] } | { kind: 'send'; call: SignedCall };
const steps: Step[] = [];
const books: Balances = new Map();
const merchantIds = new Set(w.merchants.map((m) => m.id));
let refused = 0;
for (const b of batches) {
  applyBatch(books, { mints: b.mints, transfers: [] });
  if (b.mints.length) steps.push({ kind: 'mint', mints: b.mints });
  for (const round of b.rounds) {
    const roundCalls: SignedCall[] = [];
    for (const call of round) {
      const id = call.signer.slice(0, call.signer.length - parent.length - 1);
      const agent = new MerchantAgent(id, call.signer, (t) => books.get(`${call.signer}|${t}`) ?? 0);
      const review = merchantIds.has(id) ? await agent.review(call.legs.map((l) => ({ to: l.to, tokenId: l.tokenId, amount: l.amount }))) : null;
      if (review) refused += review.refused.length;
      roundCalls.push(call);
    }
    for (const c of roundCalls) {
      steps.push({ kind: 'send', call: c });
    }
    for (const c of roundCalls) applyBatch(books, { mints: [], transfers: c.legs });
  }
}
console.log(`${HOURS}h of sim -> ${steps.length} chain steps (${steps.filter((s) => s.kind === 'send').length} self-signed calls); agents refused ${refused} legs`);
if (refused) throw new Error('A merchant agent refused legs it should have been able to cover');

// 3. Make sure the namespace account and every signer have real accounts.
const nsWallet = root.getOrCreate(NS);
if (!nsWallet.onChain) {
  await chain.createAccount(nsWallet.accountId, nsWallet.publicKey, undefined, 600_000_000_000_000_000_000_000n); // 0.6 NEAR
  root.markOnChain(NS);
  console.log('created namespace', nsWallet.accountId);
}
const creator = { accountId: nsWallet.accountId, secretKey: root.secretKeyOf(NS) };
const ids = [...w.merchants.map((m) => m.id), ...players.map((p) => p.id)];
for (const id of ids) {
  const wl = wallets.getOrCreate(id);
  if (!wl.onChain) {
    await chain.createAccount(wl.accountId, wl.publicKey, creator);
    wallets.markOnChain(id);
    console.log('created', wl.accountId);
  }
}

// 4. Execute, resumably (progress saved after each step so a rate limit never double-mints).
const PROGRESS = 'sim/out/m4-progress.json';
const key = `${parent}|21|${HOURS}`; // progress is per namespace, so a new namespace starts clean
let done = existsSync(PROGRESS) && JSON.parse(readFileSync(PROGRESS, 'utf8')).key === key ? JSON.parse(readFileSync(PROGRESS, 'utf8')).done : 0;
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let a = 0; ; a++) {
    try { return await fn(); } catch (e) {
      if (a >= 8 || !/429|ETIMEDOUT|ECONNRESET|fetch failed|timeout/i.test(String((e as Error).message) + JSON.stringify((e as { cause?: unknown }).cause ?? ''))) throw e;
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1_000 * 2 ** a)));
    }
  }
};
for (; done < steps.length; done++) {
  const s = steps[done];
  if (s.kind === 'mint') await retry(() => chain.batchMint(s.mints));
  else {
    const id = s.call.signer.slice(0, s.call.signer.length - parent.length - 1);
    await retry(() => chain.sendMany({ accountId: s.call.signer, secretKey: wallets.secretKeyOf(id) }, s.call.legs));
  }
  mkdirSync('sim/out', { recursive: true });
  writeFileSync(PROGRESS, JSON.stringify({ key, done: done + 1 }));
  if ((done + 1) % 10 === 0) console.log(`  ${done + 1}/${steps.length}`);
}

// 5. Compare.
let bad = 0;
for (const m of w.merchants) {
  for (const [item, units] of Object.entries(m.stock)) {
    let onChain = -1;
    for (let a = 0; a < 6 && onChain !== units; a++) { // views can lag a block behind
      onChain = await retry(() => chain.balanceOf(wallets.accountIdOf(m.id), item));
      if (onChain !== units) await new Promise((r) => setTimeout(r, 3000));
    }
    if (onChain !== units) (bad++, console.log(`MISMATCH ${m.id} ${item}: chain ${onChain} vs sim ${units}`));
  }
}
console.log(bad ? `FAIL: ${bad} mismatches` : 'PASS: every merchant signed its own settlements and balances match the sim.');
process.exit(bad ? 1 : 0);
