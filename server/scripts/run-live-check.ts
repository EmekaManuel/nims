/**
 * Live exit check for Milestone 8: play a few game days, stream them to the real testnet through ChainSync,
 * then verify that every goods and coin balance on the chain equals the game's.
 *
 *   npx tsx server/scripts/run-live-check.ts [hours]
 */
import 'dotenv/config';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentChain } from '../chain/agent-chain';
import { loadEnv } from '../chain/chain';
import { ChainSync } from '../chain/chainsync';
import { Game } from '../game/game';
import { loadSecrets } from '../accounts/secrets';
import { WalletStore } from '../accounts/wallets';

const hours = Number(process.argv[2] ?? 36);
const { contractId } = loadEnv();
const secrets = loadSecrets();
const dir = mkdtempSync(join(tmpdir(), 'nims-live-'));
const game = new Game(7);
const me = 'check@example.com';
game.state(me);

const sync = new ChainSync({
  game,
  ops: agentChain(),
  contractId,
  rootWallets: new WalletStore(join(dir, 'roots.json'), contractId, secrets.masterKey),
  walletsFor: (ns) => new WalletStore(join(dir, `w-${ns}.json`), ns, secrets.masterKey),
  stateFile: join(dir, 'state.json'),
  log: (m) => console.log(m),
});

console.log(`Playing ${hours} game hours, settling live to ${contractId}...`);
for (let h = 0; h < hours; h++) {
  if (h % 3 === 0) { game.gather(me, 'iron'); game.sell(me, 'anil', 'iron', 20); }
  if (h % 5 === 0) { game.gather(me, 'tomatoes'); game.sell(me, 'mira', 'tomatoes', 20, true); }
  game.tickOnce();
  if (h % 6 === 5) { const r = await sync.step(); console.log(`hour ${h + 1}: ${r}, behind ${sync.status().behind}`); }
}
game.w.hour += 24; // let the last window close
for (let i = 0; i < 500; i++) {
  const r = await sync.step();
  if (r === 'idle') break;
  if (r === 'retry') await new Promise((res) => setTimeout(res, 2000));
  if (r === 'paused') throw new Error('paused: ' + sync.status().error);
}
console.log('Status:', sync.status());
const v = await sync.verify();
console.log(v.mismatches.length ? `MISMATCHES (${v.mismatches.length}):\n${v.mismatches.slice(0, 10).join('\n')}` : `OK: all ${v.checked} balances on the chain match the game.`);
console.log(`Look at it: https://explorer.testnet.near.org/accounts/${sync.accountOf(game.w.players.find((p) => p.strategy === 'human')!.id)}`);
process.exit(v.mismatches.length ? 1 : 0);
