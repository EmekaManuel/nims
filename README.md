<div align="center">

<img src="docs/img/banner.png" alt="Nims: a market town run by AI merchants. The economy is the game." width="100%" />

# Nims

**A market town where every trader is an AI agent with its own money, its own stock and its own pricing.**

[Play it live](https://nims-app.up.railway.app) · [Demo video (143 s)](docs/nims-demo.mp4) · [Judge walk-through](docs/DEMO.md) · Contract: `oja-items.testnet`

![NEAR testnet](https://img.shields.io/badge/NEAR-testnet-00ec97) ![NEP-245](https://img.shields.io/badge/items-NEP--245-blue) ![tests](https://img.shields.io/badge/tests-557%20passing-brightgreen) ![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)

</div>

Track: **Games With Real Economies** (NEAR HACKATHON). The economy is the gameplay, and the player never sees the chain.

## The problem and the product

Game economies are usually scripts: prices follow a table, NPCs trade nothing, and a player cannot move a market. Nims replaces the script with agents.

- **Eight merchant agents** each hold their own goods and coins, and set their own prices from their stock, their cash and what was traded recently. **Each morning every merchant plans its own day through NEAR AI Cloud:** told its real books and the town around it, it decides which goods to stock up on or run down and whether to price keener or wider, and says why (from a live run: *"I am stocking up on 49 pepper while the price is low at 147 coins to prepare for the festive season crowds."*). The game turns those choices into small, bounded adjustments, so a merchant steers its business but can never break the economy.
- **Prices explain themselves, out loud.** Hover a price and the merchant says why, in their own voice: *"It is the festive season and everyone wants fabric right now."* The words come from **NEAR AI Cloud**, checked against the game's real numbers, and are spoken with ElevenLabs.
- **Merchants talk back.** Haggle once an hour and the merchant answers in character (cautious, greedy or loyal), and the town gazette prints what really happened: dividends, a merchant that stopped buying, a week of rain.
- **Players move markets.** Flooding one good crashes its price for everyone. A merchant that runs out of cash and stock closes; a community fund can reopen it. Carrying goods to another market costs a fare that is a small share of what they are worth (3% of the usual price), cheaper in a pickup or a van.
- **Players own parts of the economy.** Buy up to 49% of a merchant for a share of its nightly profit, or open a stall and set your own prices. A purchase is priced on the merchant after your money is in its till, so buying and selling straight back is a wash and nobody can make coins by moving the price. Dividends go only to shares held since the day began.
- **Stores stay in business.** Wholesalers charge relative to the going price (they used to charge a fixed amount, which bankrupted every merchant whose goods gatherers kept cheap). Merchants spend surplus cash on upkeep each evening, so a share stays at a price a new player can reach however long the town has been running, and that upkeep is shared out to merchants that are running low (the merchants' guild). A test runs the town for 120 simulated days and checks that no store is closed more than 2% of the time or low on cash more than 5% of it ([`sim/guild.test.ts`](sim/guild.test.ts)).
- **Shareholders run the markets.** Each market has a town council. Players vote on its stall rent and on how much profit merchants share out. Trading in a market gives you a seat there, and each share you hold adds another, so a new player can vote without buying a share. The merchants vote too (they oppose anything that costs them). A passing vote changes how the economy runs from the next day, with no dev patch. Extra rent is paid to shareholders each evening; every coin stays on the ledger. Code: [`sim/council.ts`](sim/council.ts).
- **A 3D town.** The game opens in a 3D town (React Three Fiber): stalls with real goods in their crates, shopkeepers and townsfolk, day and night, rain. The townsfolk walk only on paved walkways and stop in front of stalls and sources, and a test simulates them to check they never touch a building. Phones and tablets, small windows, reduced-motion settings and browsers without WebGL start on the 2D map instead, a button on the map switches either way, and the game remembers your choice. If the 3D town ever fails to start, the 2D map takes over. If it opens in 3D on its own and runs slowly (under about 22 frames a second over the first few seconds), the game drops to the 2D map, says so, offers **Try 3D anyway**, and does not try again by itself on that browser. A view you chose yourself is never overridden.
- **A world beyond the town.** Take the road out of Nims to **Saltmere Harbour**: a journey of 6 game hours (about a minute) that costs a passage plus freight on what you carry, and you can't trade on the road. The harbour has its own merchants (fish and salt, a chandlery, a spice house), a fishing pier and salt pans, drawn in 2D and 3D with the sea and boats. Distance makes goods dear: the harbour pays 1.5x for thread and iron from town, the town pays 1.6x for spice and 1.3x for salt from the harbour, so goods are worth carrying both ways. Code: [`sim/world.ts`](sim/world.ts) (realms and prices), `Game.travel` in [`server/game/game.ts`](server/game/game.ts).
- **Three unexplored frontiers to settle.** Timberfell Woods (by car), Gem Hollow and Sunvale (by plane) have no shops at all, just 8 plots of land each and a source of their own (timber, gems, wine). Buy a plot where you are (one per place; the plots by the source cost more), build a business on it, stock it and set its prices, and the people there buy from you; they pay more for what their place lacks. Put empty land up for sale and another player can buy it from you. The first to reach each frontier is named in the news. Code: `buyLand`, `listLand` and `build` in [`server/game/game.ts`](server/game/game.ts), plots in [`sim/world.ts`](sim/world.ts).
- **Quests, daily rewards and invites for new players.** A starter quest chain teaches the first ten minutes (first haul, first sale, a haggle, two markets, a share, a council vote) and a realm chain sends you to the harbour and back with spice, and an explorer chain takes you to a frontier to buy land and open a business; each pays a small reward when claimed. A daily reward grows for 7 days in a row. Invite a friend with your link, and when they make their first sale you each get 300 coins (up to 10 friends). Every reward is paid through the ledger. Code: [`server/game/quests.ts`](server/game/quests.ts).
- **Create your trader.** A new player picks a look (skin, hair, hairstyle, shirt, cap) and a name before trading; it shows in the 2D and 3D towns and on the town board. Code: [`web/src/game/AvatarCreator.tsx`](web/src/game/AvatarCreator.tsx).
- **A way back from broke.** Nearly out of coins with nothing to sell? Search the scrap heap, or take an odd job: a merchant who is short of a good pays you to fetch it, and pays the cost and your reward from their own till. Jobs are open only while you are short of coins, with a cooldown, so they are a way back up and not a way to farm.
- **Delivery orders.** State the goods and the lowest price you will take; the town's carriers (a solver run by the game) sell for you when the price allows.

The chain is invisible: sign in with Google or an emailed link, no wallet, no seed phrase, no gas prompt.

<table>
<tr>
<td colspan="2"><img src="docs/img/town.jpg" alt="The Nims market town at night, in 3D" /><br /><sub><b>The town at night, in 3D.</b> Lamp-lit stalls, shopkeepers, and townsfolk who walk the paths and stop to shop. Every stall and price is real game state.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/img/stall.jpg" alt="A stall: the merchant explains a price, delivery order, shares" /><br /><sub><b>A stall.</b> Hover a price and the merchant explains it in their own words (NEAR AI). Buy, sell, haggle, place a delivery order, buy shares.</sub></td>
<td width="50%"><img src="docs/img/prices.jpg" alt="The price board" /><br /><sub><b>The price board.</b> Every good in every market against its usual price: dear, cheap, or about usual.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/img/plan.jpg" alt="A stall showing the merchant's own plan for the day, written through NEAR AI Cloud" /><br /><sub><b>Today's plan.</b> Each morning the merchant reads its own books and decides, through NEAR AI Cloud, what to stock up on or run down and how hard to price. A real reply, from a local test game.</sub></td>
<td width="50%"><img src="docs/img/board.jpg" alt="The public town board: players, trades, richest traders and council decisions" /><br /><sub><b>The town board.</b> Public, no login (<code>#town</code>): who is playing, the richest traders and every council decision. Shown here from a local test game with six test players.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/img/council.jpg" alt="A town council vote on cutting a market's rent" /><br /><sub><b>The town council.</b> Trade in a market and you get a seat. A vote to cut the rent, with the merchants' stance. It passes at the end of the day, with no dev patch.</sub></td>
<td width="50%"><img src="docs/img/record.jpg" alt="A council vote recorded on a SputnikDAO by an OutLayer-custodied Town Clerk" /><br /><sub><b>On the record.</b> Every vote is also written to a SputnikDAO on testnet by an OutLayer-custodied Town Clerk. This is a real proposal from the demo's own vote.</sub></td>
</tr>
<tr>
<td colspan="2"><img src="docs/img/fastforward.jpg" alt="Fast-forward week: prices, shop cash and traders over seven days" /><br /><sub><b>Fast-forward a week.</b> The same economy, run headless and replayed: a flooder crashes iron to 30% of its usual price, every shop stays open, shareholders are paid each evening.</sub></td>
</tr>
</table>

## How NEAR is used

| Piece | NEAR feature | Where |
|---|---|---|
| Every good and the `coins` token | One **NEP-245** multi-token contract (no per-item contracts), deployed as `oja-items.testnet` | [`contracts/items/`](contracts/items/) |
| Player accounts | Created behind email sign-in; keys held encrypted by the server | [`server/accounts/accounts.ts`](server/accounts/accounts.ts) |
| Gas | A relayer pays through **NEP-366** delegate actions: each merchant or player signs its own `send_many` as a delegate action, and the relayer submits it and pays the gas | [`server/chain/agent-chain.ts`](server/chain/agent-chain.ts) (the live settler), [`server/chain/relayer.ts`](server/chain/relayer.ts) (single transfers when the settler is off) |
| Merchant agents | Each has its own account and signs its own transfers | [`merchants/agents/`](merchants/agents/), [`server/chain/rounds.ts`](server/chain/rounds.ts) |
| Settlement | Trades apply instantly in the game, then settle to the chain in merged batches with per-signer sequence numbers, so a retry can never apply twice | [`server/chain/chainsync.ts`](server/chain/chainsync.ts) |
| Merchant agents (optional) | **NEAR AI Cloud** plans each merchant's day: which goods to stock up on or run down, and keener or wider prices, with a reason. The game bounds every choice and ignores a reply that fails its checks; without NEAR AI the merchants keep their usual settings. `MERCHANT_AGENTS=0` turns it off | [`server/agents/planner.ts`](server/agents/planner.ts), [`sim/plan.ts`](sim/plan.ts) |
| Haggling reactions (optional) | **NEAR AI Cloud** writes the merchant's reaction when a player wins a haggle (grudging if cautious, grumbling if greedy, warm if loyal). The game has already decided the deal; the line is checked against its numbers | [`server/voice/haggle.ts`](server/voice/haggle.ts) |
| Town gazette (optional) | **NEAR AI Cloud** turns the town's latest events into a few newspaper headlines in the News tab. Same rules as the merchant voice: facts only from the game, every number checked, plain event list as the fallback | [`server/voice/gazette.ts`](server/voice/gazette.ts) |
| Merchant voice (optional) | **NEAR AI Cloud** (OpenAI-compatible API) rewrites a merchant's price reasoning in their own words when a player hovers a price. Prices never depend on it: the reply is used only if every number matches `pricing.ts`, and the plain explanation shows otherwise. Set `NEAR_AI_API_KEY` to turn it on. The line is also spoken aloud: with **ElevenLabs** natural voices (one stock voice per merchant) when `ELEVENLABS_API_KEY` is set, otherwise with the browser's built-in speech. It follows the sound switch | [`server/voice/voice.ts`](server/voice/voice.ts), [`llm.ts`](server/voice/llm.ts) |
| Council record (optional) | Every town-council vote is also written to a **SputnikDAO** on testnet (`nims-council.sputnikv2.testnet`): a Vote proposal when it opens, approved or rejected when it closes, so the decisions are public. **The game counts the votes and stays the authority; the DAO is only the record.** Player names are never written. Calls retry with back-off and never block gameplay | [`server/chain/dao.ts`](server/chain/dao.ts) |
| Town Clerk (optional) | An agent wallet custodied by **OutLayer** (testnet): its key lives in a secure enclave and the server holds only an API key. It is the DAO's only council member and signs the record. Its OutLayer policy, set in the OutLayer dashboard rather than in this repo, allows only contract calls, only to the DAO account, within spending caps (1.5 NEAR per call, 10 per hour, 30 per day); transfers, withdrawals and everything else are denied. `npm run chain:outlayer -- check` prints the live policy. **The merchants' own accounts are not custodied this way: the server still holds their keys** | [`server/chain/outlayer.ts`](server/chain/outlayer.ts) |
| Delivery orders | Intents-style: state the outcome and a limit price, a solver fills it. Implemented inside the game (`Game.placeOrder`, `fillOrders`) | [`server/game/game.ts`](server/game/game.ts) |

NEAR **testnet only**. No mainnet or real funds are used.

## Try it

**Live (no setup):** <https://nims-app.up.railway.app>. Do each step, then look for the result.

1. Press **Continue with Google**, or enter any email, press **Send me a link**, then **Open my link (development)**. See the town map with a goal card and a next-step hint from Nim. No wallet or popup appears.
2. Click the **Wholesaler (cotton)**, press **Collect cotton**. See your cash drop and the wheelbarrow fill.
3. Click **Lena's Textiles** and hover a price. See the merchant explain it in their own voice (sound on for the spoken line).
4. Tick **Haggle** and press **Sell**. See your cash rise at once and the merchant answer in character; the game never waits for a block.
5. In the stall panel, place a **delivery order** (goods and a lowest price). See the carriers sell the load and your cash rise when the price allows.
6. Run low on coins with nothing to sell, then open **Deals** and its **Odd jobs** tab. See the scrap heap and merchants offering to pay you to fetch what they lack.
7. Open the **News** tab. See the town gazette and the plain list of events.
8. Open **Fast-forward** (or add `#sim` to the address, no login). See a simulated week as price and shop-cash charts, driven by the same pricing code as the live game.
9. Open `/chain/status` on the live address. See the contract, the settlement namespace, and how far settlement has got. `behind` counts game ledger entries not yet on chain. Settlement works through the game in windows of 6 game hours (one real minute), widening up to 96 when it falls behind ([`chainsync.ts`](server/chain/chainsync.ts)), so `behind` rises and falls with each window instead of sitting at zero; `lastSettledAt` moving shows it is keeping up.
10. Open the **town board** (`#town` on the live address, or **See who's playing** on the sign-in screen; no login). See how many people have played, trades and players in the last 24 real hours, council votes passed, shops open, the ten richest traders and the latest council decisions. It counts only signed-in people and never shows an email: players appear, here and in the game, by the name they chose in **My business**, or else by a first name from their email, or only an initial when the email's username is one word and may hold a surname ([`web/src/town/TownBoard.tsx`](web/src/town/TownBoard.tsx), [`server/game/activity.ts`](server/game/activity.ts)); the same numbers are JSON at `/stats`.

**Locally:**

```bash
npm run setup     # installs the server and the web app
npm run dev       # starts both; open the address Vite prints (usually http://localhost:5173)
```

**The newest parts** (council, 3D view):

1. Collect some goods (the tomato field, say) and sell one unit to a merchant in the Produce Market. You are now a regular there.
2. Open **My business → Town council → Produce Market**. It shows your seat. Press **Low** under **Stall rent**. The merchants back a cut, so it passes at the end of the game day (use `TICK_MS=1000 npm run dev` to get there in a few minutes), and the news feed says so.
3. On a desktop browser the map opens in 3D (**2D map** switches to the flat map and back). Click a stall to open its panel. Drag to turn the view; watch the townsfolk walk to the stalls.
4. With `SPUTNIK_DAO_ID` (and optionally `OUTLAYER_API_KEY`) set, the same vote appears on the DAO: `npm run chain:dao -- proposals` lists it as Approved or Rejected. Proposal #0 on `nims-council.sputnikv2.testnet` is from a test run, not from real play; the later ones are from the demo and from play.

**Optional extras** (all off unless you set them in `.env`; see `.env.example`):

| Variable | What it turns on |
|---|---|
| `NEAR_AI_API_KEY` | NEAR AI Cloud plans each merchant's day (`MERCHANT_AGENTS=0` turns that off) and writes the merchant voice, the town gazette and haggling reactions. Key from [cloud.near.ai](https://cloud.near.ai). Optional `NEAR_AI_MODEL`. |
| `SPUTNIK_DAO_ID` | Records each council vote on this SputnikDAO (a `*.testnet` account). Make one with `npm run chain:dao -- create nims-council`. |
| `OUTLAYER_API_KEY` | Makes the OutLayer-custodied Town Clerk the one who calls the DAO. Run `npm run chain:outlayer -- register`, then `fund`, and set the wallet's policy in the OutLayer dashboard (call only, the DAO account only, spending caps). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Adds **Continue with Google** to the sign-in screen. Same account as the emailed link, matched by the verified email. Register `PUBLIC_URL/auth/google/callback` as the redirect in Google Cloud. |
| `ELEVENLABS_API_KEY` | Natural spoken merchants (one stock voice each). Without it the browser's own voice is used. Optional `ELEVENLABS_VOICES`, `ELEVENLABS_VOICE`, `ELEVENLABS_MODEL`. |
| `TICK_MS` | Real milliseconds per game hour (default 10000). Lower is a faster, twitchier market. |

Every one of these falls back to plain text and the browser voice, so the game plays the same without them.

No `.env` is needed. Without testnet credentials the game plays the same and does not settle to a chain. The game saves to `server/data/game.json` and resumes after a restart. In development the sign-in link is shown on screen instead of emailed.

## How it works

```mermaid
flowchart LR
  P[Player: email login] --> G[Game state<br/>applies trades instantly]
  A[8 AI merchants] --> G
  G -->|same pricing.ts| F[Fast-forward sim]
  G -->|batches, time-windowed| S[Settler]
  S -->|NEP-366 delegate actions<br/>relayer pays gas| N[(NEAR testnet<br/>one NEP-245 contract)]
```

**Pricing** lives in one pure function, [`merchants/pricing.ts`](merchants/pricing.ts): same inputs, same price, and it returns the reasoning lines shown in the tooltip.

```
scarcity  = (targetStock / max(stock, 1)) ^ elasticity
demand    = 1 + ((recentBuys - recentSells) / window) * demandWeight
mid       = clamp(basePrice * scarcity * demand, basePrice * minMult, basePrice * maxMult)
buyPrice  = mid * (1 - margin)     # what the merchant pays the player
sellPrice = mid * (1 + margin)     # what the merchant charges the player
```

Below its cash floor a merchant stops buying; at zero cash with nothing to sell it closes. Personality (cautious, greedy, loyal) changes only the parameters, never the formula, and so does a merchant's daily plan: it adjusts the target stock and the margin within fixed bounds ([`sim/plan.ts`](sim/plan.ts)).

**Design rules**

- One pricing file, one economy: fast-forward calls the same engine as the live game.
- Gameplay never waits on the chain. If the chain rejects a call, the settler starts a fresh epoch minted from the game state instead of patching.
- A redeploy does not cost a new epoch: the settler never sends anything the saved game does not contain, and on a stop signal it finishes the call in flight and saves before exiting.
- Testnet only: the chain client refuses any other network. Secrets live in `.env`; only `.env.example` is committed.

```
merchants/
  pricing.ts           The one pricing file
  agents/              Merchant agent: reviews its own settlement legs before signing
sim/                   Headless economy: engine, world, simulated players, fast-forward, and the town council (council.ts)
server/
  main.ts              Entry point: wires everything and starts the server
  http/                HTTP API, email-link and Google login, mailer
  game/                Live game state, saving, and the odd jobs board
  chain/               NEAR client, relayer, settlement batches, rounds, live settler, the DAO record (dao.ts) and OutLayer client (outlayer.ts)
  accounts/            Player accounts, merchant wallets, key encryption, secrets
  voice/               Optional NEAR AI Cloud writing (merchant voice, gazette, haggling) and ElevenLabs speech
  scripts/             Testnet deploy and live-check scripts
contracts/items/       The NEP-245 contract (Rust, near-sdk)
web/src/
  main.tsx, App.tsx    Entry and top-level screen
  api/                 Typed client for the game server
  game/                The play screen: map, 3D map (Map3D.tsx) and its walkways (paths.ts), council panel, HUD, stall panels, price board
  sim/                 Fast-forward dashboard and charts
  ui/                  Small shared inputs (select, number field, slider, ...)
  art/, lib/, test/    Icons and mascot; rank and sound helpers; fixtures
video/                 The demo video, built with Remotion (see video/README.md)
docs/                  Judge walk-through, deploy notes, voice-over script, demo video, images
```

The [privacy policy](web/public/privacy.html) is served at `/privacy.html`. The full design (world, game loop, on-chain design, balance numbers) is in [DESIGN.md](DESIGN.md).

## Fit to the track

Games With Real Economies asks for *"NPCs with wallets, player-owned markets and economies that evolve without a dev patch. Judged on the game loop, not the token; bonus if players never notice the chain"*, with the hints AGENT NPCS, SOCIAL LOGIN, NEAR INTENTS and NEP-245. Each line below names the code that does it, the test that checks it, and what to try on the live game.

| The track asks for | In Nims | Code | Checked by | Try it |
|---|---|---|---|---|
| **NPCs with wallets** | 8 merchant agents, each with its own NEAR account, cash and stock. Each signs only its own transfers, and reviews a batch against what it holds before signing | [`server/chain/rounds.ts`](server/chain/rounds.ts), [`merchants/agents/agent.ts`](merchants/agents/agent.ts), [`sim/world.ts`](sim/world.ts) | [`rounds.test.ts`](server/chain/rounds.test.ts): a whole simulated week settles with every signer paying its own transfers. [`agent.test.ts`](merchants/agents/agent.test.ts): a merchant refuses transfers it cannot cover | Open `/chain/status`: the settlement namespace and how far it has got |
| **AGENT NPCS** | Each morning every merchant **decides its own plan** through NEAR AI Cloud from its real books (cash, stock against its usual stock, what traders bought and sold, prices, shocks, its market's council rules): stock up on or run down each good, and price keener or wider, with a reason in its own words. The game maps each choice to a small fixed step (stock target x1.3 or x0.75, margin plus or minus 3 points, kept within 5 to 25%), so a merchant steers but cannot break the economy; a reply that fails the checks is ignored. Prices then follow from `pricing.ts`, with a personality (cautious, greedy, loyal). Merchants also haggle, and explain a price in their own words; a line is used only if every number in it is the game's | [`server/agents/planner.ts`](server/agents/planner.ts), [`sim/plan.ts`](sim/plan.ts), [`merchants/pricing.ts`](merchants/pricing.ts), [`server/voice/voice.ts`](server/voice/voice.ts) | [`planner.test.ts`](server/agents/planner.test.ts): bad, hostile or invented replies are ignored, one plan per merchant per day; [`plan.test.ts`](sim/plan.test.ts): every choice stays in bounds; [`voice.test.ts`](server/voice/voice.test.ts) | Open any stall: **Today's plan**, in the merchant's words. Plan changes also appear in **News** |
| **Player-owned markets** | Buy up to 49% of a merchant and share its profit each evening; open your own stall and set its prices; pay into a community fund to reopen a closed shop and own part of it | [`sim/engine.ts`](sim/engine.ts), [`server/game/game.ts`](server/game/game.ts) | [`ownership.test.ts`](sim/ownership.test.ts): shares, dividends, funds and player stalls; a round trip on shares makes no coins | In a stall panel's shares section, **Buy**; or open **My business** |
| **Economies that evolve without a dev patch** | Prices come from supply and demand; shocks (rain, fuel queue, festive season) arrive at random; shareholders vote on each market's rent and profit payout, and a passing vote changes how the economy runs from the next day | [`sim/council.ts`](sim/council.ts), [`sim/engine.ts`](sim/engine.ts) | [`council.test.ts`](sim/council.test.ts), [`server/game/council.test.ts`](server/game/council.test.ts); [`guild.test.ts`](sim/guild.test.ts): 120 simulated days with stores staying open; [`fastforward.test.ts`](sim/fastforward.test.ts): a flooder crashes iron | **My business → Town council**; **Fast-forward** for a simulated week |
| **Judged on the game loop** | Collect at a farm, scrap spot or wholesaler; haul to the market that pays most after the fare; sell, haggle or post a delivery order; invest; vote. Ranks and a 10,000-coin goal, odd jobs when you are broke | [`server/game/game.ts`](server/game/game.ts), [`web/src/game/`](web/src/game/) | [`game.test.ts`](server/game/game.test.ts), [`economy.test.ts`](sim/economy.test.ts), [`recovery.test.ts`](server/game/recovery.test.ts); `npm run balance` times the goal | The **Try it** steps above |
| **Players never notice the chain** | Sign in with Google or an emailed link. No wallet, seed phrase or gas prompt: a relayer pays through NEP-366 delegate actions, and trades apply at once and settle in the background | [`server/http/google.ts`](server/http/google.ts), [`server/chain/relayer.ts`](server/chain/relayer.ts), [`server/chain/chainsync.ts`](server/chain/chainsync.ts) | [`api.test.ts`](server/http/api.test.ts) and [`game.test.ts`](server/game/game.test.ts): no API response or game state mentions wallets, keys, gas or signatures | Sign in on the live game: no popup at any point |
| **SOCIAL LOGIN** | Continue with Google, matched to the same account as the emailed link by the verified email | [`server/http/google.ts`](server/http/google.ts) | [`Login.test.tsx`](web/src/game/Login.test.tsx) | **Continue with Google** on the sign-in screen |
| **NEP-245** | One multi-token contract holds every good and the `coins` token: `mt_transfer`, `mt_batch_transfer`, balances and supply, `nep245` events, plus idempotent `batch_mint` and `send_many` | [`contracts/items/src/lib.rs`](contracts/items/src/lib.rs), deployed as `oja-items.testnet` | 18 contract tests (`npm run contract:test`) | `oja-items.testnet` on a testnet explorer |
| **NEAR INTENTS** | Partly. Delivery orders take Intents' shape (state the goods and the lowest price you will take; a solver fills it when the price allows), but the solver runs inside the game, not on the Intents network, which has no testnet | [`server/game/game.ts`](server/game/game.ts) (`placeOrder`, `fillOrders`) | [`game.test.ts`](server/game/game.test.ts): *delivery orders (intents)* | **Place order** in a stall panel |

## What is real, and what is not

**Built and tested** (unit tests, and the council record and Town Clerk also run once against testnet):

- The merchant agents: pricing from stock, cash and recent trades, and each merchant's daily plan through NEAR AI Cloud, kept within fixed bounds.
- Prices that explain themselves (NEAR AI Cloud and ElevenLabs, with the plain line when either is off), haggling, and the town gazette.
- Markets players can move: flooding, closures, community funds that reopen a merchant, fares and freight.
- Ownership: shares (up to 49%) with nightly dividends, player stalls, and the fare, share-price, dividend and store-cash fixes, and the merchants' guild.
- The town council, with merchants' votes, regulars' seats, rent and payout rules, and the rent levy.
- The council record on a SputnikDAO, signed by an OutLayer-custodied Town Clerk with a policy set on its wallet.
- Settlement of every good and coin to the NEP-245 contract, with per-player accounts and proof links.
- The 3D town and its checked walkways, the 2D map, and the speed check that falls back to 2D.
- Saltmere Harbour and the journey there: passage and freight, no trading on the road, prices that make goods worth carrying both ways.
- The three frontiers: land (one plot per place), building and stocking a business, selling empty land to another player, first-arrival news, travel by car or plane.
- Quests (starter, harbour and frontier chains), the 7-day daily reward, and invites (300 coins each, up to 10 friends), all paid through the ledger.
- Create your trader: the look and the name, checked on the server, shown in 2D, 3D and on the town board.
- A way back from broke (scrap and odd jobs) and delivery orders.
- The public town board (`/stats`), sign-in by Google or emailed link, and fast-forward week.

**Not built, or not what it might sound like:**

- **The DAO is a record, not the counter.** Votes are counted in the game, weighted by seats and shares. The DAO shows how each vote ended. It does not decide anything.
- **Only the Town Clerk is OutLayer-custodied.** The merchants' own accounts, and player accounts, are still signed with keys the server holds (encrypted).
- **Delivery orders do not use NEAR Intents.** They follow its shape (state the outcome and a limit price, a solver fills it) but run inside the game, not on the Intents network.
- **Shares, council tallies and funds live in the game server,** not in a contract. Item and coin balances settle to the NEP-245 contract.
- **Testnet only.** Nothing here uses mainnet or real funds.
- **Balance is tuned by simulation,** not by long human play.

## Tests and chain verification

```bash
npm test               # economy, pricing, server, API, chain, merchant agents, names  (347 tests)
npm run test:web       # the UI against real game state, 3D walkways, the 3D speed check, the town board, merchants' plans  (210 tests)
npm run contract:test  # the NEP-245 contract  (18 tests, needs Rust)
```

`sim/economy.test.ts` guards the balance: sources charge for goods, a buy-and-sell trip changes net worth by a modest amount, every good averages near its usual price over a quiet week, and a flooder still crashes iron. `npm run balance` plays a scripted trader and prints how long it takes, in real minutes, to reach each rank and the 10,000-coin goal (14 of 16 seeded runs reach it, from under a minute to about 14 minutes).

To verify the chain side, copy `.env.example` to `.env` with a testnet account, then:

```bash
npm run contract:build && npm run chain:deploy        # deploy the items contract
npx tsx server/scripts/run-live-check.ts 30   # play 30 game hours, settle to testnet, check every balance on chain equals the game's
npx tsx server/scripts/run-m4-check.ts 12     # 12 hours where every merchant and player signs its own transfers; compare stock to the sim
npx tsx server/scripts/run-m3-check.ts        # a new email-only player gets an account and moves items with no wallet step
```

With credentials in `.env`, `npm run server` streams the running game to the chain in the background (`CHAIN_SYNC=0` turns that off).

## Deploy

One container serves the pages and the API ([`Dockerfile`](Dockerfile)). Steps for Railway and Render, and what to set, are in [docs/DEPLOY.md](docs/DEPLOY.md).

## What's next

- **Native NEAR Intents:** route delivery orders through the Intents solver network instead of the in-game carriers.
- **OutLayer for the merchants:** custody the merchants' own accounts the way the Town Clerk is, which means reworking how settlement epochs reuse accounts.
- **Votes counted on chain:** have the DAO count weighted votes (for example with a token for seats), so it decides and the game follows, instead of recording the result.
- **Shares and funds as contracts:** move share ownership and community-fund payouts from the game server to an on-chain contract.
- **Real sign-in email:** Resend is wired in; it needs a key and a verified sending domain. Google sign-in already works without one.
- **Scale out:** move game state from one process with a JSON save to a shared store.

## Built at NEAR HACKATHON

- **When:** all code here was written during the hackathon window. The first commit is dated 2026-11-04; there is no earlier baseline.
- **AI assistance:** the code was written with Claude Code (Anthropic) under the author's direction. The demo narration is a cloned voice made with ElevenLabs, and the demo video is built with Remotion.
- **Main libraries:** near-api-js, near-sdk (Rust), React, React Three Fiber (three.js), Vite, Radix UI, Vitest, Remotion. SputnikDAO v2 and OutLayer agent custody for the council record.
- **Setting:** a fictional market town with a fictional currency, so no real-world place is needed to follow the game.
- **License:** MIT, see [LICENSE](LICENSE).
