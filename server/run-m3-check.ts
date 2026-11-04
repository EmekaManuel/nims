/**
 * Milestone 3 live check: a new player logs in by email, gets an invisible account, and trades
 * on chain with zero wallet steps. The relayer creates the account and pays all gas.
 *
 *   npx tsx server/run-m3-check.ts [email]
 */
import 'dotenv/config';
import { AccountStore } from './accounts';
import { connect } from './chain';
import { realChain } from './relayer';

const email = process.argv[2] ?? `check-${Date.now()}@example.com`;
const { env, account: owner } = connect();
const store = new AccountStore('server/data/accounts.json', env.contractId, process.env.MASTER_KEY!);
const chain = realChain();

const acct = store.getOrCreate(email);
console.log('player account:', acct.accountId);

if (!acct.onChain) {
  await chain.createPlayerAccount(acct.accountId, acct.publicKey);
  store.markOnChain(email);
  console.log('account created by relayer');
}

const pre = await chain.itemBalance(acct.accountId, 'iron');

// Give the player some iron (stands in for gathering at a scrap spot).
await owner.callFunction({
  contractId: env.contractId,
  methodName: 'batch_mint',
  args: { mints: [{ account_id: acct.accountId, token_id: 'iron', amount: '10' }] },
  gas: 100_000_000_000_000n,
});

const merchant = `mira.${env.parent}`;
await chain.transferItem({ accountId: acct.accountId, secretKey: store.secretKeyOf(email) }, merchant, 'iron', 4);
const after = await chain.itemBalance(acct.accountId, 'iron');
const expected = pre + 10 - 4;
console.log(`player iron: ${pre} + 10 minted - 4 sent = ${after} (expected ${expected}; sent to ${merchant}, no popup, relayer paid gas)`);
console.log(after === expected ? 'PASS' : 'FAIL');
process.exit(after === expected ? 0 : 1);
