// Builds public/demo-data.json: every number and fact the video shows, each with where it came from. Re-run just before the final render.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const P = (f) => new URL('../public/' + f, import.meta.url).pathname;
const SITE = 'https://nims-app.up.railway.app';
const RPC = 'https://test.rpc.fastnear.com';
const curl = (args) => execFileSync('curl', ['-s', '-m', '30', ...args], { encoding: 'utf8' });
const getJson = (url) => JSON.parse(curl([url]));
const rpc = (method, params) => JSON.parse(curl(['-X', 'POST', RPC, '-H', 'content-type: application/json', '-d', JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })]));
const view = (acct, m, args = {}) => { const r = rpc('query', { request_type: 'call_function', finality: 'final', account_id: acct, method_name: m, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') }).result?.result; return r ? JSON.parse(Buffer.from(r).toString()) : null; };

const take = JSON.parse(readFileSync(P('clips/take1.events.json')));
const ev = (n) => take.events.find((e) => e.name === n);
const iso = (epoch) => new Date(epoch * 1000).toISOString();
const iron = (e, id) => e.stalls[id].offers.find((o) => o.item === 'iron');
const ruthB = ev('ruth-before-sale'), ruthA = ev('ruth-after-sale'), tomB = ev('tomas-before-sale'), tomA = ev('tomas-after-sale');
const account = ruthA.chain.account;

// the player's real transactions on testnet, decoded from the chain (nearblocks index + RPC)
const txns = getJson(`https://api-testnet.nearblocks.io/v1/account/${account}/txns?per_page=25`).txns;
const seen = new Set(); const settled = [];
for (const t of txns) {
  if (seen.has(t.transaction_hash)) continue; seen.add(t.transaction_hash);
  const r = rpc('EXPERIMENTAL_tx_status', { tx_hash: t.transaction_hash, sender_account_id: 'oja-items.testnet', wait_until: 'FINAL' }).result;
  let legs = null;
  for (const rc of r?.receipts ?? []) for (const a of rc.receipt.Action?.actions ?? []) if (a.FunctionCall?.method_name === 'send_many') legs = JSON.parse(Buffer.from(a.FunctionCall.args, 'base64').toString());
  if (legs) settled.push({ hash: t.transaction_hash, at: new Date(Number(t.block_timestamp) / 1e6).toISOString(), legs: legs.legs.map((l) => ({ to: l.receiver_id.split('.')[0], token: l.token_id, amount: Number(l.amount) })), explorer: `https://testnet.nearblocks.io/txns/${t.transaction_hash}` });
}
const after = (epoch) => settled.filter((s) => Date.parse(s.at) / 1000 > epoch).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const soldIron = ruthB.you.inventory.find((i) => i.item === 'iron')?.units ?? 0;
const soldTom = tomB.you.inventory.find((i) => i.item === 'tomatoes')?.units ?? 0;
const ironTx = after(ruthA.epoch).find((s) => s.legs.some((l) => l.token === 'iron' && l.to === 'ruth' && l.amount === soldIron)); // this sale's own transfer: the same units, after the sale
const tomTx = after(tomA.epoch).find((s) => s.legs.some((l) => l.token === 'tomatoes' && l.to === 'tomas' && l.amount === soldTom));
const lag = (tx, epoch) => tx ? Math.round(Date.parse(tx.at) / 1000 - epoch) : null;

const stats = getJson(`${SITE}/stats`), status = getJson(`${SITE}/chain/status`);
const lastId = view('nims-council.sputnikv2.testnet', 'get_last_proposal_id');
const prop = view('nims-council.sputnikv2.testnet', 'get_proposal', { id: 11 });
const CAPTURE_GUESTS = 7; // guests created by the capture runs (3 test sign-ins, 1 for the saved session, 1 for the sign-in clip, plus 2 earlier probes); subtracted from the live player count

writeFileSync(P('demo-data.json'), JSON.stringify({
  readAt: new Date().toISOString(),
  beat1_and_4: {
    note: 'One real trade on the live game by a guest named Demo. Values are the game\'s own state (/game/state) read at the moment named; chain values are decoded from the transactions on testnet.',
    sale1: {
      what: 'sold iron to Ruth\'s Salvage', gameTime: iso(ruthA.epoch), youCash: [ruthB.you.cash, ruthA.you.cash],
      ruthIronBuyPrice: [iron(ruthB, 'ruth').buy, iron(ruthA, 'ruth').buy], ruthTill: [ruthB.stalls.ruth.till, ruthA.stalls.ruth.till],
      ruthPlan: ruthB.stalls.ruth.plan, source: 'take1.events.json (ruth-before-sale, ruth-after-sale), from /game/state',
      chain: ironTx && { ...ironTx, settledSecondsAfterSale: lag(ironTx, ruthA.epoch) },
    },
    sale2: {
      what: 'sold tomatoes to Tomas Produce, with a haggle', gameTime: iso(tomA.epoch), youCash: [tomB.you.cash, tomA.you.cash],
      tomasPlan: tomB.stalls.tomas.plan, chain: tomTx && { ...tomTx, settledSecondsAfterSale: lag(tomTx, tomA.epoch) },
    },
    playerAccount: account, explorerAccount: ruthA.chain.explorer,
  },
  proof: {
    statsAtRead: { players: stats.players, tradesTotal: stats.total.trades, last24h: stats.last24h, councilVotesPassed: stats.total.passed, decisions: stats.total.decisions, shops: stats.shops },
    captureGuests: CAPTURE_GUESTS,
    playersExcludingCaptureGuests: stats.players - CAPTURE_GUESTS,
    note: 'Players is /stats "players" minus the guests this capture created. Trades are not adjusted (about 6 were the capture player, so the real count is a little lower).',
    chain: { contract: 'oja-items.testnet', epoch: status.epoch, lastSettledAt: status.lastSettledAt, paused: status.paused },
    dao: { account: 'nims-council.sputnikv2.testnet', proposals: lastId, proposal11: prop && { status: prop.status, description: prop.description.slice(0, 90) } },
  },
  sources: ['https://nims-app.up.railway.app/stats', 'https://nims-app.up.railway.app/chain/status', 'https://api-testnet.nearblocks.io (transactions)', 'https://test.rpc.fastnear.com (EXPERIMENTAL_tx_status, call_function)'],
}, null, 2));
console.log('wrote demo-data.json; iron tx', ironTx?.hash?.slice(0, 10), 'lag', ironTx && lag(ironTx, ruthA.epoch), 's | tomatoes tx', tomTx?.hash?.slice(0, 10), 'lag', tomTx && lag(tomTx, tomA.epoch), 's');
