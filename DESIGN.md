y# Nims — Design

**Track:** Games With Real Economies (id: `games`) — "The economy is the gameplay"
**Pitch:** A small market town where every trader is an AI agent with its own wallet and stock. Start with a wheelbarrow, read the market, move goods where they're dear, revive broke shops, and end up a shareholder in half the stalls. The economy keeps moving whether you're online or not.

**Judging targets**
- A tight, readable game loop where the economy *is* the gameplay.
- Bonus: the player never notices the chain. No seed phrases, no wallet popups, no gas prompts in the normal loop.

**Tone:** Warm, clear and universal: a fictional market town that anyone, anywhere, understands at a glance. Plain-English goods and money; no real-world place or culture is needed to follow the game. No caricatures.

---

## 1. World

### Markets (v1: 3, stretch: 4)
| Market | Buys / sells | Notes |
|---|---|---|
| Produce Market | tomatoes, pepper, flour | Perishable goods; rain speeds spoilage |
| Fabric Market | cotton, lace, thread | Festive season spikes demand |
| Scrap & Hardware | iron, copper wire | Classic flood-the-market demo item |
| *(stretch)* Phone Parts | screens, batteries | Higher value, lower volume |

### Sources (where players gather)
- **Farms** on the edge of town → tomatoes, pepper (flour is stocked by merchants).
- **Scrap spots** around the map → iron, copper wire. Supply refills slowly on a timer.
- **Wholesaler** → buy bulk cotton at the wholesale price (a stable price anchor).

Sources sell at a **wholesale price: 50% of a good's usual price**. They are not free. If goods cost nothing, the first trip is worth thousands and the market stops mattering; at wholesale, starting cash is the limit and the profit is in price gaps, shortages and shocks. (See "Economy balance" below.)

### Merchants (v1: 8 agents)
Each merchant has:
- A NEAR account (its own wallet), holding cash plus NEP-245 item balances.
- `targetStock` per item: how much they like to hold.
- `cashFloor`: below this they stop buying.
- A personality that tweaks the pricing parameters:
  - **Cautious:** higher margin, slow to move price.
  - **Greedy:** reacts hard to scarcity.
  - **Loyal:** gives regulars a reputation discount.
- A short demand memory: buys and sells over the last N in-game hours.
- A state: `open` | `struggling` | `closed`.

### Shocks (random, roughly 1 per in-game day)
- **Rain:** produce spoils faster, and gathering is slower.
- **Fuel queue:** moving goods between markets costs more, so price gaps widen.
- **Festive season:** fabric demand rises, and fabric merchants pay more.

---

## 2. Game loop

### Every 30 seconds: gather, carry, haggle
1. Tap a source to collect a load. Capacity depends on the vehicle: wheelbarrow, then pickup, then van.
2. Walk to a stall to see the merchant's buy and sell offers.
3. Hover the price to see the **reasoning tooltip**, for example:
   > "I'm holding 140 iron and I only want 50. Four people sold me iron this hour. I'll pay 180, coins not my usual 300 coins."
4. Decide: sell now, haggle once (a small swing based on reputation), or carry the goods to another market.
5. Every trade updates the merchant's stock and demand memory, so the player is always nudging prices.

### Every 5 minutes: route and react
1. Check the **price board**, which shows each item's price in every market, colour-coded relative to the base price.
2. Spot the arbitrage, for example: iron is cheap at Scrap and dear at Hardware.
3. A shock fires or a merchant changes state, for example: "Mira's Greens is low on cash and stopped buying pepper."
4. Spend profit on one meaningful thing:
   - a capacity upgrade
   - a contribution to an **community fund** for a closed shop
   - shares in an open merchant
5. Watch the consequences: flooding one market turns its board red while the other markets stay green.

### Every session (20–30 minutes): ownership and legacy
1. **Invest:** shares in merchants pay out a cut of their profits.
2. **Revive:** when a community fund fills, the closed shop reopens with contributors' names on its sign.
3. **Own a stall:** you unlock your own stall and set your own prices. Agent merchants buy from you and sell to you, which makes the market player-owned.
4. **Return:** the town kept trading without you. Merchants restocked, someone went broke, prices drifted, and your shares paid out (or didn't).
5. **Session goals** (the player picks one):
   - Reach a net-worth target.
   - Hold a stake in every market.
   - Keep a district alive through a shock.

---

## 3. Merchant pricing (lives in `merchants/pricing.ts`)

```
scarcity  = (targetStock / max(stock, 1)) ^ elasticity
demand    = 1 + ((recentBuys - recentSells) / window) * demandWeight
mid       = basePrice * scarcity * demand
buyPrice  = mid * (1 - margin)      // what the merchant pays the player
sellPrice = mid * (1 + margin)      // what the merchant charges the player
```

Rules:
- Clamp `mid` to `[basePrice * minMult, basePrice * maxMult]` so prices never go absurd.
- If `cash < cashFloor`: the merchant stops buying, and the state becomes `struggling`.
- If `cash == 0` and there's no sellable stock: the state becomes `closed`, and the shop is investable via a community fund.
- Personality only changes the parameters (`elasticity`, `demandWeight`, `margin`), never the formula.
- Every term returns a plain-English line, and the tooltip is those lines joined together.

Pricing is a **pure function**: same inputs, same price. The live game and fast-forward mode call the same function.

---

## 4. On-chain design (invisible to the player)

| Concern | Approach |
|---|---|
| Items | One **NEP-245** multi-token contract holds every item type (token id per item). |
| Money | **Coins are a token id (`coins`) in the same NEP-245 contract.** A `town` pseudo-account marks coins entering (mints) or leaving (transfers) the economy. Fund escrows are accounts too. |
| Login | Social or email login creates a NEAR account behind the scenes. No seed phrase. |
| Gas | A relayer pays for meta-transactions, so player actions are signed silently. |
| Speed | Trades apply instantly to game state, then **batch-settle** to the chain in the background (time-windowed, merged, every account signing its own). The player never waits on a block. |
| Exactness | Calls carry per-signer sequence numbers, so a retry after a timeout can never apply twice. If a call is ever rejected, a fresh **epoch** (new namespace, minted from the game's state) starts instead of patching. |
| Merchants | Each agent owns a NEAR account and signs its own settlements. The server holds those keys (encrypted). |
| Council record | Every town-council vote is also written to a **SputnikDAO** on testnet: a Vote proposal when it opens, approved or rejected when it closes. The game counts the votes and decides; the DAO is a public record. No player names are written. Failures retry with back-off and never block play. |
| Town Clerk | The DAO's only council member is an agent wallet custodied by **OutLayer**: its key lives in a secure enclave and the server holds only an API key. Its OutLayer policy allows only contract calls, only to the DAO, with spending caps. |
| Cross-market moves | **Delivery orders**, an intents-style flow: the player states the outcome ("sell 50 iron at Hardware for at least 280 each") and the town's carriers (a solver run by the game, every tick) wait for the price, make the trip and sell it through the normal sale. The result settles to the chain like any trade. This follows the *shape* of NEAR Intents (declare the result, let a solver find the path, enforce the limit). It does **not** call the NEAR Intents protocol or its solver network; wiring a real Intents solver is future work. |
| Fund pools and shares | A small contract (or contract module) tracks contributions and pays out. |

---

## 5. Fast-forward mode (for judges)

- A headless simulation runs 7 in-game days in about 60 seconds, using the same `pricing.ts`.
- Simulated players follow simple strategies: a gatherer, an arbitrageur, an investor, and a market-flooder.
- A live dashboard shows:
  - price per item per market over time
  - merchant cash lines
  - shop open and close events
  - shock markers
- One button: **"Fast-forward a week."**

---

## 6. Build milestones

1. **Economy sim (no chain):** `pricing.ts`, 8 merchants, simulated players, 7 days, price chart. *Exit test: flooding iron makes iron cheap; a merchant can go broke and get revived.*
2. **Items contract:** NEP-245 on testnet with mint, transfer, and batch transfer. Settlement script.
3. **Invisible accounts:** social or email login plus a relayer. The player plays with zero popups.
4. **Agent merchants:** each merchant has a wallet and signs batched settlements.
5. **Playable UI:** map, stalls, price board, reasoning tooltips, vehicle upgrades.
6. **Ownership:** community funds, merchant shares, player-owned stall.
7. **Polish:** shocks, fast-forward dashboard, demo script for judges.

## 7. Out of scope (v1)
Housing, needs bars, relationships, deep crafting trees, multiplayer chat. Stretch: one crafting step (cloth + thread → tailored outfit) to add a second layer of demand.

## 8. Economy balance (what the numbers are for)

The economy is the gameplay, so it has to stay healthy without a human in it. These are the levers and why they sit where they do. `sim/economy.test.ts` guards them.

| Lever | Value | Why |
|---|---|---|
| Wholesale rate | 50% of usual price | Goods are not free. Starting cash limits you, so growth is earned. |
| Starting cash | 4,000 coins | Enough for a first small load, not enough to flood a market. |
| Carried goods in net worth | what they cost at their source (80% of usual price for a good no source sells) | Collecting a load is not instant profit: it was valued at 80% while costing 50%, so goal progress jumped before any trade. |
| Vehicle in net worth | what it cost | Buying a pickup turns coins into a pickup. It used to count for nothing, so upgrading set you back on the goal. |
| Everyday demand | per good, per stall, per hour (`DEMAND_PER_HOUR`) | Town-wide demand roughly matches each source's supply, so prices hover near fair value instead of sitting on the floor. |
| Merchant restock | below 85% of target | Stalls don't sit understocked, which would hold prices permanently high. |
| NPC gatherers | every 3rd hour, only when the best price beats cost by 40%, sell above cost + 10% | A trader, not a firehose. Supply follows profit, so a glut corrects itself. |
| Market flooder | bankrolled with 60,000 coins | It is a saboteur who dumps goods whatever they cost, so it needs deep pockets. |
| Fare to another market | 3% of the goods' usual price per unit (min 1); x0.7 pickup, x0.5 van; x1.5 in a fuel queue | A small share of what is carried, so cheap goods are not taxed like dear ones and bigger vehicles haul cheaper. It was a flat 20 a unit, a fifth of a tomato's price. |
| Wholesaler price to a merchant | at most 85% of the going price, never above 95% of usual | A fixed price bankrupted every merchant whose goods gatherers kept cheap (iron sold near 200, cost 285). |
| Share price | a purchase costs n% of the merchant after the money is in its till (n x worth / (100 - n)); selling pays n% of worth | Priced on the worth before the payment, a buyer could pay 45,000 and sell back for 61,000. Now a round trip is a wash. |
| Dividend and levy | only on shares held since the day began | No buying at 10pm to collect and sell. |
| Merchant upkeep | a quarter of the cash above 40,000 (plus what shareholders paid in), each evening, after dividends | Without a sink merchants earn forever and a share (1% of worth) rises tenfold in a few months. |
| Merchants' guild | upkeep goes to open merchants under 6,000 coins; the rest to the town | Smooths a lean spell. A closed shop is left for the community fund. `sim/guild.test.ts` runs 120 days and checks no store is closed more than 2% of the time or low on cash more than 5%. |
| Fortune goal | 10,000 coins | Hauling alone levels off at about 9,500 to 16,000 coins (prices fall as you sell, and merchants' cash is finite); growing beyond that takes shares or a stall. At 12,000 the goal sat on that ceiling. `npm run balance`: a trader acting every 2.5 to 3.3 seconds reaches 10,000 in 14 of 16 seeded runs, in about 5 to 29 real minutes. |
| Ranks | 3,000 / 7,000 / 15,000 / 35,000 | A new rank every few minutes early on. |

Before this pass a calm player reached the goal in about 40 seconds and Tycoon in 2.5 minutes: free goods plus an oversupplied market made money a fountain. Wholesale prices, fares and upkeep now make it slow; `npm run balance` prints the current times.

## 9. Getting back up when broke

A player with no coins, nothing carried and no shares would be stuck: sources sell at wholesale, so nothing is free. Two small, capped ways back:

- **Scrap heap.** When you hold under twice the cheapest wholesale price and carry nothing, you can search for one piece of iron, at most once every 3 in-game hours. Holding the iron (or having the coins) ends eligibility, so it cannot be farmed.
- **Odd jobs board.** Merchants are nearly always a little under their target stock, and the farms, scrap spots and wholesaler have goods to spare. A short merchant posts a job: collect up to 5 units at the source (free for the courier, taken from the source's stock, reserved so they cannot be sold elsewhere), carry them over, and on delivery the merchant pays the goods' cost to the town plus a reward (about 10% of the usual price per unit, plus a flat 30). Nothing is printed: the merchant's own cash pays. Jobs are open only while you hold under 10 times the cheapest wholesale price, one at a time, and one every 8 in-game hours. A job that is dropped or lapses (48 hours) sends the goods back to the source.

Measured: from 5 coins a player is back above 600 within 3 to 5 minutes at the default tick, and jobs then close to them. A deliberate exploiter who parks coins in shares to stay eligible gains about 5,000 net worth per hour. `server/game/recovery.test.ts` guards the ledger balance, the reservation and the farming cap.

## 10. The town council

Each market has a council that votes on two rules, so the economy can change without a dev patch (`sim/council.ts`):

- **Stall rent**: low (x0.5), normal, or high (x2). Rent above normal goes into a levy that is paid to the market's shareholders each evening; the merchants carry the cost.
- **Profit payout**: lean (20% of a day's profit), normal (30%), or generous (50%).

**Seats.** One seat for being a regular (you have traded with a merchant in that market) and one per share you hold in its merchants. Shares get dear in an old town, so the trading seat keeps new players in the vote. Each open merchant has a seat worth 8 and always votes against anything that costs it money (it backs a cut), so a rise needs shareholders to organise while a cut passes easily.

**Voting.** Anyone with a seat can propose; one vote per market at a time; it stays open at least 6 game hours and closes at the end of the day. More seats for than against passes (a tie fails). The change applies from the next day, and the result is in the news and in each voter's notes. At normal settings the game behaves exactly as it did before the council.

**The record.** If `SPUTNIK_DAO_ID` is set, each vote is also written to a SputnikDAO (see section 4). The DAO does not count anything: it is a record of how each vote ended.

## 11. Fares and the 3D town

- **Fares** are in the balance table (section 8). Using your own stall puts you at its market, so selling there afterwards costs no second fare.
- **The 3D view** (`web/src/game/Map3D.tsx`, React Three Fiber) draws the same state as the 2D map. Townsfolk move along a walkway graph (`web/src/game/paths.ts`) and stop in front of open stalls and the sources; `paths.test.ts` samples every walkway and simulates walkers to check they never touch a stall, plot, source, tree or lamp.

## 12. Merchant agents: each merchant plans its day

Each in-game day every town merchant plans its own business through NEAR AI Cloud (`server/agents/planner.ts`). It is told its real books and the town around it (cash and cash floor; for each good its stock, usual stock, what traders bought and sold in the last day, the price now and the usual price; shocks; its market's council rules) and nothing about any player. It answers in words:

| Choice | Effect (`sim/plan.ts`) |
|---|---|
| Stock a good: more / less / same | Target stock x1.3 / x0.75 / x1. Prices of that good, restocking and odd jobs follow the new target. |
| Margin: wider / narrower / same | Personality margin plus 3 / minus 3 / 0 points, kept within 5% to 25%. |
| Reason | One first-person sentence, shown in the stall and the news. Used only if every number in it is from the facts and it avoids the forbidden words; otherwise a plain sentence built from the choices. |

Words, not numbers, so the model cannot set a price: `pricing.ts` is unchanged and simply given the chosen target and margin. A reply that does not parse, names an unknown choice or misses the margin is ignored, and the merchant keeps its plan. The fast-forward sim never calls the model, so it stays deterministic; a server without NEAR AI (or with `MERCHANT_AGENTS=0`) behaves exactly as before. One merchant plans every 15 real seconds, so all eight plan within a game day.

Checked: with every merchant on the widest margin the model can ask for (the worst case for players: `BALANCE_WIDER=1 npm run balance`), 12 of the 16 seeded runs of `npm run balance`'s trader still reach the 10,000 goal (14 of 16 with normal margins), the slowest after about 33 real minutes. In a live run against NEAR AI Cloud all eight replies parsed; most reasons passed the number check in the merchant's own words and the rest fell back to the plain sentence.

## 13. Beyond the town: realms, quests and new-player incentives

**Realms.** The town (three markets) and Saltmere Harbour (one market, three merchants, the fishing pier and the salt pans) are realms. Moving between markets inside a realm costs a fare as before; moving between realms is a journey (`Game.travel`): `REALMS[..].journeyHours` game hours (6) and `passage` coins (120) plus freight of twice the usual fare per unit carried, paid up front. On the road nothing can be traded; the player arrives on the tick the journey ends. Trading, collecting, orders and odd jobs in another realm are refused with a plain "a journey away" message, and deals, the coach and the jobs board only point at the realm you are in.

| Lever | Value | Why |
|---|---|---|
| Import price, harbour | thread and iron x1.5 | Ships need them; a reason to carry town goods out |
| Import price, town | spice x1.6, salt x1.3 (June's Pantry) | The town has none of its own; a reason to carry harbour goods back |
| Journey | 6 game hours, 120 coins + freight | Long enough to be a decision, short enough to make in one session |

Simulated traders and the fast-forward stay in the town, so the week in the dashboard is the town's. A save from before the harbour gains its merchants, sources and council when it loads, booked in the ledger like a new world's genesis (`addMissingPlaces`).

**Quests** (`server/game/quests.ts`). Chains of quests whose objectives count what a player does (collect, sell, haggle, buy a share, vote, travel ...). One quest per chain is open at a time; claiming pays its reward (town to player, through the ledger) and opens the next. Starter rewards total 1,250 coins, small next to the 10,000-coin goal. The realm chain (travel to Saltmere, sell 10 units there, sell 5 spice in the Produce Market) opens after "Know the town".

**Daily reward.** In real days (UTC): 100, 150, 200, 300, 400, 500, then 700 a day; a missed day starts again.

**Invite a friend.** A link built from the player's opaque id. A new player (no sale yet) who joins with it is linked to the inviter; on their first sale both get 300 coins. Not your own link, once per player, at most 10 rewarded friends per inviter.

**Avatars.** A look is picks from fixed palettes (`server/game/avatar.ts` checks them), the same palettes the 3D town draws people with.

## 14. The frontiers: land and businesses

Three realms with no merchants: Timberfell Woods (8 game hours by car, 160 coins), Gem Hollow (10 hours by plane, 260) and Sunvale (10 hours by plane, 240). Each has a source of its own good (timber, gems, wine), which the town (Diego, Anil, June) and the harbour (Marlow) buy at an import premium; each frontier's customers pay a premium for what it lacks (`IMPORT_PRICE`).

| Lever | Value | Why |
|---|---|---|
| Plots | 8 per frontier: 3,500 by the source, 2,600 in the middle, 1,800 at the edge | Being early and near the source is worth paying for |
| Land per player | one plot per frontier | No one buys a whole place |
| Building | 4,000 coins on land you own | Together with land, about the cost of a town stall, and a commitment |
| Reselling | the owner sets an asking price for empty land; the buyer pays the owner through the ledger | Land is an asset players trade |

A business is a player-run shop (the same mechanics as a town stall: your prices, your stock, your till) whose id is `biz-<plot>`; the stall actions take that id, and stocking one means going there. Everyday customers buy from it when its price is fair for that place (`localBase` x1.6). The first player to reach a frontier is recorded and named in the news. Saves from before the frontiers gain their plots, sources and the merchants' new goods on load.
