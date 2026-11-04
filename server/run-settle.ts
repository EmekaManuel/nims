/**
 * Exit check for Milestone 2: run a sim week, settle its item ledger to testnet in batches,
 * then compare on-chain balances to the sim's final state.
 *
 *   npx tsx server/run-settle.ts deploy     # once: deploy + init the contract
 *   npx tsx server/run-settle.ts settle     # settle a week and verify
 */
import { runWeek } from '../sim/run';
import { accountFor, buildBatches, genesisLedger } from './settle';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { balanceOf, callsOf, deploy, loadEnv, submitCall } from './chain';

// Progress is saved after every successful call, so a crash or rate limit resumes instead of double-minting.
const PROGRESS = 'sim/out/settle-progress.json';
const loadDone = (key: string) => (existsSync(PROGRESS) && JSON.parse(readFileSync(PROGRESS, 'utf8')).key === key ? JSON.parse(readFileSync(PROGRESS, 'utf8')).done : 0);
const saveDone = (key: string, done: number) => (mkdirSync('sim/out', { recursive: true }), writeFileSync(PROGRESS, JSON.stringify({ key, done })));

const cmd = process.argv[2];

if (cmd === 'deploy') {
  console.log('Deployed to', await deploy());
} else if (cmd === 'settle') {
  const { parent } = loadEnv();
  const w = runWeek(1);
  const batches = buildBatches([...genesisLedger(), ...w.ledger], parent);
  const calls = batches.flatMap(callsOf);
  const key = `${parent}|seed1`;
  let done = loadDone(key);
  console.log(`${calls.length} chain calls (${batches.length} batches); resuming at ${done}`);
  for (; done < calls.length; done++) {
    await submitCall(calls[done]);
    saveDone(key, done + 1);
    if ((done + 1) % 25 === 0) console.log(`  ${done + 1}/${calls.length}`);
  }
  let bad = 0;
  for (const m of w.merchants) {
    for (const [item, units] of Object.entries(m.stock)) {
      const onChain = await balanceOf(accountFor(m.id, parent), item);
      if (onChain !== units) (bad++, console.log(`MISMATCH ${m.id} ${item}: chain ${onChain} vs sim ${units}`));
    }
  }
  console.log(bad ? `${bad} mismatches` : 'All merchant balances match the sim.');
} else {
  console.log('usage: run-settle.ts deploy|settle');
}
