// Reads real numbers from the live NEAR testnet contract, for the chain scene. Run before rendering to refresh them.
import { writeFileSync } from 'node:fs';
const CONTRACT = process.env.CONTRACT_ID ?? 'oja-items.testnet';
const rpc = async (method, params) => (await (await fetch('https://rpc.testnet.near.org', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json()).result;
const acct = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: CONTRACT });
const seq = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: CONTRACT, method_name: 'mint_seq', args_base64: Buffer.from('{}').toString('base64') });
const out = {
  contract: CONTRACT,
  blockHeight: acct.block_height,
  settlementBatches: Number(Buffer.from(seq.result).toString()),
  balanceNear: Number((BigInt(acct.amount) / 10n ** 20n)) / 10000,
  storageKb: Math.round(acct.storage_usage / 1024),
  fetchedAt: new Date().toISOString().slice(0, 10),
};
writeFileSync(new URL('./src/data/chain.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(out);
