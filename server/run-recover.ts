/**
 * Give back the testnet NEAR held by throwaway test namespaces: delete each account in a namespace, then the
 * namespace itself, sending the balance to the owner. Only touch directories you name (never a running server's data).
 *
 *   npx tsx server/run-recover.ts <dir> [dir...]
 */
import 'dotenv/config';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Account } from 'near-api-js';
import { loadEnv } from './chain';
import { decrypt } from './crypto';
import { loadSecrets } from './secrets';

const env = loadEnv();
const { masterKey } = loadSecrets();
type W = Record<string, { accountId: string; encryptedSecret: string; onChain: boolean }>;
const read = (f: string): W => JSON.parse(readFileSync(f, 'utf8'));
const del = async (w: { accountId: string; encryptedSecret: string }, to: string) => {
  try {
    const a = new Account(w.accountId, env.rpcUrl, decrypt(w.encryptedSecret, masterKey) as `ed25519:${string}`);
    await a.deleteAccount(to);
    console.log('  deleted', w.accountId);
  } catch (e) { console.log('  skip', w.accountId, String((e as Error).message).slice(0, 80)); }
};

for (const dir of process.argv.slice(2)) {
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir);
  const roots = files.find((f) => f === 'roots.json' || f === 'chain-roots.json');
  if (!roots) continue;
  for (const [id, root] of Object.entries(read(join(dir, roots)))) {
    if (!root.onChain) continue;
    console.log('namespace', root.accountId);
    const inner = files.find((f) => (f.startsWith('w-') || f.startsWith('wallets-')) && f.includes(`${id}.`));
    if (inner) for (const w of Object.values(read(join(dir, inner)))) if (w.onChain) await del(w, root.accountId);
    await del(root, env.accountId);
  }
}
const s = await new Account(env.accountId, env.rpcUrl, env.privateKey as `ed25519:${string}`).getState();
console.log('owner balance NEAR:', Number(s.balance.total) / 1e24);
