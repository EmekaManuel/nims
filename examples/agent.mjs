// A tiny AI-agent player for Nims: it signs in as a guest and trades through the same HTTP API the web page uses.
// No dependencies (Node 18+). Swap `choose()` for an LLM call to make it smarter.
//
//   node examples/agent.mjs                                  # plays on the live game
//   node examples/agent.mjs http://localhost:3000 30         # a local server, 30 turns
const BASE = process.argv[2] ?? 'https://nims-app.up.railway.app';
const TURNS = Number(process.argv[3] ?? 20);
let cookie = '';

/** One API call. The session cookie from /auth/guest is kept and sent back, like a browser would. */
async function call(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const json = await r.json().catch(() => ({}));
  if (r.status >= 500) throw new Error(`${path}: server error ${r.status}`);
  return json;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** What each good cost us, per unit, so we never sell at a loss. */
const paid = {};

/** Which place each market is in: you can only sell where you are (travelling is a journey, see /game/travel). */
const MARKET_PLACE = { produce: 'town', fabric: 'town', scrap: 'town', harbour: 'saltmere', woods: 'timberfell', mine: 'gemhollow', vale: 'sunvale' };

/** The stall here that pays most for this good right now (prices fall as a stall fills up, and recover over time). */
function bestBuyer(s, item) {
  let best = null;
  const here = s.realm?.here ?? 'town';
  for (const st of s.stalls) {
    if (st.state !== 'open' || MARKET_PLACE[st.market] !== here) continue;
    const o = st.offers.find((x) => x.item === item && x.willBuy);
    if (o && (!best || o.buyPrice > best.price)) best = { id: st.id, name: st.name, price: o.buyPrice };
  }
  return best;
}

/** Pick the best deal you can pay for: collect at a source, then sell where it pays more. */
function choose(s) {
  return s.deals.filter((d) => d.from.kind === 'source' && d.profit > 0 && d.from.cost <= s.you.cash).sort((a, b) => b.profit - a.profit)[0] ?? null;
}

const guest = await call('POST', '/auth/guest', {});
if (!guest.ok) throw new Error(guest.error ?? 'could not sign in');
await call('POST', '/game/name', { name: 'Agent' });
await call('POST', '/game/goal', { kind: 'fortune' });
const start = (await call('GET', '/game/state')).you.netWorth;

for (let turn = 1; turn <= TURNS; turn++) {
  const s = await call('GET', '/game/state');
  if (s.realm?.journey) { await wait(5_000); continue; } // on the road: nothing to do until you arrive
  const carried = s.you.inventory.find((x) => x.units > 0);
  if (carried) {
    // sell a few at a time, only while some stall pays more than it cost us; otherwise hold and let prices recover
    const buyer = bestBuyer(s, carried.item);
    if (buyer && buyer.price > (paid[carried.item] ?? 0)) {
      const units = Math.min(carried.units, 4);
      const r = await call('POST', '/game/sell', { merchant: buyer.id, item: carried.item, units });
      console.log(`turn ${turn}: sell ${units} ${carried.item} to ${buyer.name} at ~${buyer.price}: ${r.message} (cash ${r.state?.you.cash})`);
    } else {
      console.log(`turn ${turn}: holding ${carried.units} ${carried.item}: no stall pays more than the ${paid[carried.item]} it cost`);
      await wait(10_000); // one game hour
    }
    continue;
  }
  const deal = choose(s);
  if (!deal) { console.log(`turn ${turn}: no deal worth doing. The game's hint: ${s.coach.text}`); await wait(10_000); continue; }
  const got = await call('POST', '/game/gather', { item: deal.item });
  paid[deal.item] = deal.from.cost;
  console.log(`turn ${turn}: collect ${deal.item} at ${deal.from.label} (${deal.from.cost} each): ${got.message}`);
  await wait(1_000);
}
const end = await call('GET', '/game/state');
console.log(`done: ${end.you.name} went from ${start} to ${end.you.netWorth} coins of net worth (cash ${end.you.cash}, goods included)`);
