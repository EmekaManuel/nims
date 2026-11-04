/**
 * Soak test on the real testnet: the game ticks on a timer and "players" act while the settler runs in the
 * background, exactly as in the server. Ends by verifying the chain against the game.
 *
 *   npx tsx server/run-live-soak.ts [minutes]
 */
import 'dotenv/config';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentChain } from './agent-chain';
import { loadEnv } from './chain';
import { ChainSync } from './chainsync';
import { Game } from './game';
import { loadSecrets } from './secrets';
import { WalletStore } from './wallets';

const minutes = Number(process.argv[2] ?? 4);
const { contractId } = loadEnv();
const secrets = loadSecrets();
const dir = mkdtempSync(join(tmpdir(), 'nims-soak-'));
const game = new Game(1);
const sync = new ChainSync({
  game, ops: agentChain(), contractId,
  rootWallets: new WalletStore(join(dir, 'roots.json'), contractId, secrets.masterKey),
  walletsFor: (ns) => new WalletStore(join(dir, `w-${ns}.json`), ns, secrets.masterKey),
  stateFile: join(dir, 'state.json'),
  log: (m) => console.log(new Date().toISOString().slice(11, 19), m),
});
void sync.run();
const me = 'soak@example.com';
game.state(me);
const items = ['copper wire', 'iron'] as const;
let n = 0;
const tick = setInterval(() => game.tickOnce(), 1500);
const play = setInterval(() => {
  const it = items[n++ % 2];
  game.gather(me, it);
  game.sell(me, n % 4 < 2 ? 'anil' : 'ruth', it, 20);
}, 4000);
await new Promise((r) => setTimeout(r, minutes * 60_000));
clearInterval(play);
game.w.hour += 24;
for (let i = 0; i < 120 && sync.status().behind !== 0; i++) await new Promise((r) => setTimeout(r, 3000));
clearInterval(tick); sync.stop();
console.log('Status:', sync.status());
const v = await sync.verify();
console.log(v.mismatches.length ? `MISMATCHES:\n${v.mismatches.slice(0, 10).join('\n')}` : `OK: all ${v.checked} balances match.`);
process.exit(v.mismatches.length ? 1 : 0);
