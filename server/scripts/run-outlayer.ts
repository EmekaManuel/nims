/**
 * The Town Clerk: an agent wallet custodied by OutLayer (testnet), which records the council's votes on the DAO.
 *
 *   npx tsx server/scripts/run-outlayer.ts register   # once: create the wallet. Prints its API key ONCE: put it in .env
 *   npx tsx server/scripts/run-outlayer.ts check      # show the wallet's address, balance and policy (needs OUTLAYER_API_KEY)
 *   npx tsx server/scripts/run-outlayer.ts fund 5     # send it testnet NEAR from NEAR_ACCOUNT_ID, for gas and the DAO's 1 NEAR bond
 *
 * The wallet's key lives in OutLayer's secure enclave; only the API key is held here. Set its policy in the dashboard
 * (the link printed by `register`): allow only the DAO's account, only `call`, and a spending cap.
 * Testnet only: OUTLAYER_URL may point elsewhere only if it is a testnet host.
 */
import { connect } from '../chain/chain';
import { OUTLAYER_TESTNET, outlayer, registerWallet } from '../chain/outlayer';

const cmd = process.argv[2];
const url = process.env.OUTLAYER_URL?.trim() || OUTLAYER_TESTNET;
if (!/testnet/.test(url)) throw new Error('Refusing to run: Nims only talks to the OutLayer testnet.');
const clerk = () => {
  const apiKey = process.env.OUTLAYER_API_KEY?.trim();
  if (!apiKey) throw new Error('Set OUTLAYER_API_KEY in .env first (run `register`).');
  return outlayer({ apiKey, baseUrl: url });
};

if (cmd === 'register') {
  const w = await registerWallet(url);
  console.log(`Wallet created: ${w.accountId}\n\nAdd to .env (shown only once, keep it secret):\nOUTLAYER_API_KEY=${w.apiKey}\n`);
  if (w.handoffUrl) console.log(`Set its policy here (only the DAO account, only "call", a spending cap):\n${w.handoffUrl}`);
} else if (cmd === 'check') {
  const c = clerk();
  console.log('address:', await c.address());
  console.log('balance:', JSON.stringify(await c.balance()));
  console.log('policy: ', JSON.stringify(await c.policy()));
} else if (cmd === 'fund') {
  const near = Number(process.argv[3]);
  if (!(near > 0 && near <= 20)) throw new Error('Give an amount of NEAR between 0 and 20.');
  const to = await clerk().address();
  const { account } = connect();
  await account.transfer({ receiverId: to, amount: BigInt(Math.round(near * 1e6)) * 10n ** 18n });
  console.log(`Sent ${near} NEAR to ${to}.`);
} else {
  console.log('Usage: register | check | fund <near>');
}
