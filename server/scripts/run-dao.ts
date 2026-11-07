/**
 * The town council's public record on SputnikDAO (testnet).
 *
 *   npx tsx server/scripts/run-dao.ts create nims-council   # once: make the DAO, with this server account as its council
 *   npx tsx server/scripts/run-dao.ts policy                # show the DAO's rules and council (needs SPUTNIK_DAO_ID)
 *   npx tsx server/scripts/run-dao.ts proposals             # list what the game has recorded
 *
 * If OUTLAYER_API_KEY is set, the DAO's council is the OutLayer-custodied Town Clerk (see run-outlayer.ts); otherwise it is this
 * server account.
 * `create` spends testnet NEAR from NEAR_ACCOUNT_ID (the factory's creation deposit, default 6 NEAR).
 * The factory is sputnikv2.testnet by default; override with SPUTNIK_FACTORY if it has moved.
 * Then put the new account id in .env as SPUTNIK_DAO_ID.
 */
import { connect } from '../chain/chain';
import { OUTLAYER_TESTNET, outlayer } from '../chain/outlayer';

const cmd = process.argv[2];
const { env, account } = connect();
const daoId = process.env.SPUTNIK_DAO_ID;
const need = () => { if (!daoId) throw new Error('Set SPUTNIK_DAO_ID in .env first.'); return daoId; };

if (cmd === 'create') {
  const name = process.argv[3];
  if (!name || !/^[a-z0-9-]{2,40}$/.test(name)) throw new Error('Give the DAO a short name: lowercase letters, digits and dashes.');
  const factory = process.env.SPUTNIK_FACTORY || 'sputnikv2.testnet';
  const amount = BigInt(Math.round(Number(process.env.SPUTNIK_CREATE_NEAR ?? 6) * 1e6)) * 10n ** 18n;
  // Whose account is on the council: the Town Clerk if there is one, else the server's own.
  const key = process.env.OUTLAYER_API_KEY?.trim();
  const councilor = key ? await outlayer({ apiKey: key, baseUrl: process.env.OUTLAYER_URL?.trim() || OUTLAYER_TESTNET }).address() : env.accountId;
  const args = { config: { name, purpose: 'A public record of the Nims town councils: every shareholder vote, and how it ended.', metadata: '' }, policy: [councilor] };
  await account.callFunction({ contractId: factory, methodName: 'create', args: { name, args: Buffer.from(JSON.stringify(args)).toString('base64') }, gas: 150_000_000_000_000n, deposit: amount });
  console.log(`Created ${name}.${factory} with ${councilor} on its council. Add this to .env:\nSPUTNIK_DAO_ID=${name}.${factory}`);
} else if (cmd === 'policy') {
  console.log(JSON.stringify(await account.provider.callFunction({ contractId: need(), method: 'get_policy', args: {} }), null, 2));
} else if (cmd === 'proposals') {
  const last = Number(await account.provider.callFunction({ contractId: need(), method: 'get_last_proposal_id', args: {} }));
  const list = await account.provider.callFunction<{ id: number; description: string; status: string }[]>({ contractId: need(), method: 'get_proposals', args: { from_index: Math.max(0, last - 20), limit: 20 } });
  for (const p of list ?? []) console.log(`#${p.id} [${p.status}] ${p.description}`);
  console.log(`${last} proposals in total.`);
} else {
  console.log('Usage: create <name> | policy | proposals');
}
