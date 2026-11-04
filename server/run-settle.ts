/**
 * Exit check for Milestone 2: run a sim week, settle its item ledger to testnet in batches,
 * then compare on-chain balances to the sim's final state.
 *
 *   npx tsx server/run-settle.ts deploy     # once: deploy + init the contract
 *   npx tsx server/run-settle.ts settle     # settle a week and verify
 */
import { runWeek } from '../sim/run';
import { accountFor, buildBatches, genesisLedger } from './settle';
import { balanceOf, deploy, loadEnv, submitBatch } from './chain';

const cmd = process.argv[2];

if (cmd === 'deploy') {
  console.log('Deployed to', await deploy());
} else if (cmd === 'settle') {
  const { parent } = loadEnv();
  const w = runWeek(1);
  const batches = buildBatches([...genesisLedger(), ...w.ledger], parent);
  console.log(`Submitting ${batches.length} batches...`);
  let n = 0;
  for (const b of batches) {
    await submitBatch(b);
    if (++n % 10 === 0) console.log(`  ${n}/${batches.length}`);
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
