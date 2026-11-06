<div align="center">

<img src="docs/img/banner.png" alt="Nims: a market town run by AI merchants. The economy is the game." width="100%" />

# Nims

**A market town where every trader is an AI agent with its own money, its own stock and its own pricing.**

[Play it live](https://nims-app.up.railway.app) · [Demo video (104 s)](docs/nims-demo.mp4) · [Judge walk-through](docs/DEMO.md) · Contract: `oja-items.testnet`

![NEAR testnet](https://img.shields.io/badge/NEAR-testnet-00ec97) ![NEP-245](https://img.shields.io/badge/items-NEP--245-blue) ![tests](https://img.shields.io/badge/tests-377%20passing-brightgreen) ![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)

</div>

Track: **Games With Real Economies** (NEAR HACKATHON). The economy is the gameplay, and the player never sees the chain.

## The problem and the product

Game economies are usually scripts: prices follow a table, NPCs trade nothing, and a player cannot move a market. Nims replaces the script with agents.

- **Eight merchant agents** each hold their own goods and coins, and set their own prices from their stock, their cash and what was traded recently.
- **Prices explain themselves, out loud.** Hover a price and the merchant says why, in their own voice: *"It is the festive season and everyone wants fabric right now."* The words come from **NEAR AI Cloud**, checked against the game's real numbers, and are spoken with ElevenLabs.
- **Merchants talk back.** Haggle once an hour and the merchant answers in character (cautious, greedy or loyal), and the town gazette prints what really happened: dividends, a merchant that stopped buying, a week of rain.
- **Players move markets.** Flooding one good crashes its price for everyone. A merchant with no cash closes; a community fund can reopen it.
- **Players own parts of the economy.** Buy up to 49% of a merchant for a share of its nightly profit, or open a stall and set your own prices.
- **A way back from broke.** Nearly out of coins with nothing to sell? Search the scrap heap, or take an odd job: a merchant who is short of a good pays you to fetch it, and pays the cost and your reward from their own till. Jobs are open only while you are short of coins, with a cooldown, so they are a way back up and not a way to farm.
- **Delivery orders.** State the goods and the lowest price you will take; the town's carriers (a solver run by the game) sell for you when the price allows.

The chain is invisible: sign in with Google or an emailed link, no wallet, no seed phrase, no gas prompt.

<table>
<tr>
<td width="50%"><img src="docs/img/stall.jpg" alt="A stall: prices, delivery order, shares" /><br /><sub><b>A stall.</b> Buy, sell, place a delivery order, buy shares.</sub></td>
<td width="50%"><img src="docs/img/prices.jpg" alt="The price board" /><br /><sub><b>The price board.</b> Every good in every market against its usual price.</sub></td>
</tr>
<tr>
<td colspan="2"><img src="docs/img/fastforward.jpg" alt="Fast-forward week: prices and shop cash over seven days" /><br /><sub><b>Fast-forward a week.</b> The same economy, run headless and replayed: price swings, shocks, shops closing.</sub></td>
</tr>
</table>

## How NEAR is used

| Piece | NEAR feature | Where |
|---|---|---|
| Every good and the `coins` token | One **NEP-245** multi-token contract (no per-item contracts), deployed as `oja-items.testnet` | [`contracts/items/`](contracts/items/) |
| Player accounts | Created behind email sign-in; keys held encrypted by the server | [`server/accounts/accounts.ts`](server/accounts/accounts.ts) |
| Gas | A relayer pays through **NEP-366** delegate actions | [`server/chain/relayer.ts`](server/chain/relayer.ts) |
| Merchant agents | Each has its own account and signs its own transfers | [`merchants/agents/`](merchants/agents/), [`server/chain/rounds.ts`](server/chain/rounds.ts) |
| Settlement | Trades apply instantly in the game, then settle to the chain in merged batches with per-signer sequence numbers, so a retry can never apply twice | [`server/chain/chainsync.ts`](server/chain/chainsync.ts) |
| Haggling reactions (optional) | **NEAR AI Cloud** writes the merchant's reaction when a player wins a haggle (grudging if cautious, grumbling if greedy, warm if loyal). The game has already decided the deal; the line is checked against its numbers | [`server/voice/haggle.ts`](server/voice/haggle.ts) |
| Town gazette (optional) | **NEAR AI Cloud** turns the town's latest events into a few newspaper headlines in the News tab. Same rules as the merchant voice: facts only from the game, every number checked, plain event list as the fallback | [`server/voice/gazette.ts`](server/voice/gazette.ts) |
| Merchant voice (optional) | **NEAR AI Cloud** (OpenAI-compatible API) rewrites a merchant's price reasoning in their own words when a player hovers a price. Prices never depend on it: the reply is used only if every number matches `pricing.ts`, and the plain explanation shows otherwise. Set `NEAR_AI_API_KEY` to turn it on. The line is also spoken aloud: with **ElevenLabs** natural voices (one stock voice per merchant) when `ELEVENLABS_API_KEY` is set, otherwise with the browser's built-in speech. It follows the sound switch | [`server/voice/voice.ts`](server/voice/voice.ts), [`llm.ts`](server/voice/llm.ts) |
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
9. Open `/chain/status` on the live address. See the contract, the settlement namespace, and how far settlement has got.

**Locally:**

```bash
npm run setup     # installs the server and the web app
npm run dev       # starts both; open the address Vite prints (usually http://localhost:5173)
```

**Optional extras** (all off unless you set them in `.env`; see `.env.example`):

| Variable | What it turns on |
|---|---|
| `NEAR_AI_API_KEY` | NEAR AI Cloud writes the merchant voice, the town gazette and haggling reactions. Key from [cloud.near.ai](https://cloud.near.ai). Optional `NEAR_AI_MODEL`. |
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

Below its cash floor a merchant stops buying; at zero cash with nothing to sell it closes. Personality (cautious, greedy, loyal) changes only the parameters, never the formula.

**Design rules**

- One pricing file, one economy: fast-forward calls the same engine as the live game.
- Gameplay never waits on the chain. If the chain rejects a call, the settler starts a fresh epoch minted from the game state instead of patching.
- A redeploy does not cost a new epoch: the settler never sends anything the saved game does not contain, and on a stop signal it finishes the call in flight and saves before exiting.
- Testnet only: the chain client refuses any other network. Secrets live in `.env`; only `.env.example` is committed.

```
merchants/
  pricing.ts           The one pricing file
  agents/              Merchant agent: reviews its own settlement legs before signing
sim/                   Headless economy: engine, world, simulated players, fast-forward
server/
  main.ts              Entry point: wires everything and starts the server
  http/                HTTP API, email-link and Google login, mailer
  game/                Live game state, saving, and the odd jobs board
  chain/               NEAR client, relayer, settlement batches, rounds, live settler
  accounts/            Player accounts, merchant wallets, key encryption, secrets
  voice/               Optional NEAR AI Cloud writing (merchant voice, gazette, haggling) and ElevenLabs speech
  scripts/             Testnet deploy and live-check scripts
contracts/items/       The NEP-245 contract (Rust, near-sdk)
web/src/
  main.tsx, App.tsx    Entry and top-level screen
  api/                 Typed client for the game server
  game/                The play screen: map, HUD, stall panels, price board, tooltips
  sim/                 Fast-forward dashboard and charts
  ui/                  Small shared inputs (select, number field, slider, ...)
  art/, lib/, test/    Icons and mascot; rank and sound helpers; fixtures
video/                 The demo video, built with Remotion (see video/README.md)
docs/                  Judge walk-through, deploy notes, voice-over script, demo video, images
```

The [privacy policy](web/public/privacy.html) is served at `/privacy.html`. The full design (world, game loop, on-chain design, balance numbers) is in [DESIGN.md](DESIGN.md).

## Fit to the track

| Track asks for | Nims |
|---|---|
| NPCs with wallets | Eight merchant agents, each with its own NEAR account and its own signing |
| Economy that evolves without a dev patch | Prices come from stock, cash and trades; shocks (rain, fuel queue, festive season) are random |
| Player-owned markets | Own a stall, hold shares in merchants, fund a closed shop back open |
| Players never notice the chain | Google or email login, no wallet, relayer pays gas; tests assert no API response mentions wallets, keys or gas |
| NEP-245 | One multi-token contract holds every item and the coin token |

## Tests and chain verification

```bash
npm test               # economy, pricing, server, API       (231 tests)
npm run test:web       # the UI against real game state      (146 tests)
npm run contract:test  # the NEP-245 contract                (needs Rust)
```

`sim/economy.test.ts` guards the balance: flooding a good crashes its price, and a calm player reaches the 12,000-coin goal in roughly 12 to 20 minutes.

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
- **Shares and funds as contracts:** move share ownership and community-fund payouts from the game server to an on-chain contract.
- **Real sign-in email:** Resend is wired in; it needs a key and a verified sending domain. Google sign-in already works without one.
- **Scale out:** move game state from one process with a JSON save to a shared store.

## Built at NEAR HACKATHON

- **When:** all code here was written during the hackathon window. The first commit is dated 2026-11-04; there is no earlier baseline.
- **AI assistance:** the code was written with Claude Code (Anthropic) under the author's direction. The demo narration is a cloned voice made with ElevenLabs, and the demo video is built with Remotion.
- **Main libraries:** near-api-js, near-sdk (Rust), React, Vite, Radix UI, Vitest, Remotion.
- **Setting:** a fictional market town with a fictional currency, so no real-world place is needed to follow the game.
- **License:** MIT, see [LICENSE](LICENSE).
