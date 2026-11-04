# Nims

A small market town where every trader is an AI agent with its own wallet and stock. You start with a wheelbarrow, read the market, move goods where they're dear, revive broke shops, and end up a part-owner of half the stalls. The economy keeps moving whether you're online or not.

Built for the **Games With Real Economies** track: the economy *is* the gameplay, and the player never notices the chain.

## Run it (two minutes, no accounts needed)

```bash
npm run setup     # installs the server and the web app
npm run dev       # starts both; open the address Vite prints (usually http://localhost:5173)
```

- Enter any email, press **Send me a link**, then **Open my link (development)**. In development the sign-in link is shown on screen instead of emailed.
- No `.env` is needed. Without testnet credentials the game runs exactly the same and just doesn't settle to a chain. See [Testnet](#testnet) to switch that on.
- The page `#sim` (the **Fast-forward a week** link, no login) replays the whole economy as charts.
- The game saves itself to `server/data/game.json` and resumes after a restart.

**Judges:** [docs/DEMO.md](docs/DEMO.md) is a five-minute walk-through.

## What you can do

| | |
|---|---|
| **Trade** | Buy goods at wholesale from the farms, scrap spots and the cloth wholesaler, carry them between three markets, and sell where they're dear. Your starting cash is the limit, so you start small and grow. You can haggle once an hour. Hover any price and the merchant explains it in their own words. |
| **Read the market** | The **Prices** tab shows every good in every market against its usual price, tinted green where it's dear and blue where it's cheap. On the map, each stall draws crates from its real stock, so a flooded stall visibly overflows and a broke one has its shutters down. |
| **Feel it** | The map is alive: traders walk the roads, a delivery truck drives by, you walk between markets with your vehicle, lamps come on at night, and shocks (rain, fuel queue, festive season) show up on the map. Sales float up as "+420 coins", there are small sound effects (with a mute button), your **rank** climbs from Street vendor to Tycoon, and Nim the guide tells you what to do next. |
| **Revive** | A shop with no cash and no stock closes. Neighbours reopen it by paying into a **community fund**; contributors become part-owners and their names go on the sign. |
| **Own** | Buy up to 49% of any merchant and get a share of their profit every evening, or open your own stall, set your own prices and let the merchants trade with you. |
| **Come back** | The town kept trading. A summary says what your shares paid and what happened around town. |
| **Watch** | *Fast-forward a week* runs the same economy headless and plays it back: prices, shop cash, shocks, closures. Choose which simulated traders take part (gatherers, an arbitrageur, an investor, a market flooder). |

## How it's put together

```
merchants/pricing.ts   The one pricing file. Pure: same inputs, same price. Returns the price AND the reasoning.
merchants/agents/      A merchant agent that reviews its own settlement legs before signing
sim/                   The headless economy: engine, world, simulated players, fast-forward runner
server/                Game state, login, relayer, batch settlement, HTTP API, saving
contracts/items/       One NEP-245 contract holding every item type (Rust, near-sdk)
web/                   The game and the dashboard (Vite + React + SVG; Radix UI primitives for selects, checkboxes, sliders)
docs/DEMO.md           The judge walk-through
```

**The rules this project holds itself to** (from `CLAUDE.md`):

- **Items are NEP-245.** One contract holds every item type. There is no per-item contract.
- **No wallet UX in the game loop.** Email login, keys held and encrypted by the server, and a relayer that pays gas through NEP-366 delegate actions. No seed phrase, no popup, no gas prompt. Tests check that no response mentions wallets, keys or gas.
- **All merchant pricing lives in `merchants/pricing.ts`.** Personality only changes parameters (`elasticity`, `demandWeight`, `margin`, `loyalty`), never the formula. A player's own stall prices come through the same file (`playerQuote`).
- **Never block gameplay on the chain.** Trades apply to game state immediately and settle in batches afterwards.
- **Fast-forward calls the same engine.** There is no second copy of the economy.
- **Testnet only.** The chain client refuses to run against anything else. Secrets live in `.env`; `.env.example` is committed.

Read `merchants/pricing.ts` first. It's short and heavily commented.

## Tests

```bash
npm test               # economy, pricing, server, API (about 110 tests)
npm run test:web       # the UI against real game state (about 57 tests)
npm run contract:test  # the NEP-245 contract (13 tests; needs Rust)
```

## Testnet

Everything below is optional and is how the chain side was verified.

1. Create a testnet account and copy `.env.example` to `.env` (account id and key; the key never leaves `.env`).
2. `npm run contract:build` then `npm run chain:deploy` deploys the items contract.
3. `npx tsx server/run-m4-check.ts 12 v2` settles 12 simulated hours where **every merchant and player signs its own transfers** (the relayer only pays gas), then checks each merchant's on-chain stock against the simulation.
4. `npx tsx server/run-m3-check.ts` makes a brand-new email-only player, creates their account, and moves items on chain with no wallet step.

5. `npx tsx server/run-live-check.ts 30` plays 30 game hours, streams them to testnet through the same settler the server uses, and verifies every goods and coin balance on the chain equals the game's.

With testnet credentials in `.env`, `npm run server` streams the running game to the chain in the background (set `CHAIN_SYNC=0` to turn that off). After changing the contract, run `npx tsx server/run-settle.ts upgrade` then `migrate`. `GET /chain/status` shows how far settlement has got; players get a quiet link to their own account in the news panel.

The deployed contract is `oja-items.testnet`. (That account was created before the game was renamed to Nims; an on-chain account name can't be changed.)

## Known limits (honest list)

- **Shares and the fund rules are game logic, not contract logic.** Goods *and coins* are real tokens on chain (coins are a token id in the same NEP-245 contract), and every contribution, dividend and revival moves real coins. But the rules for who is owed what are enforced by the game server, not by a contract.
- **The chain follows the game, it does not lead it.** Trades apply instantly; the chain catches up within a minute or so. If the chain ever rejects a call, the settler starts a fresh epoch (a new set of accounts minted from the game's current state) instead of patching, so older epochs stay on the testnet as history.
- **Login links are shown on screen in development.** A real email provider is one small replacement of the `Mailer` interface.
- **One server process, state in memory with a JSON save.** Fine for a demo; not horizontally scalable.
- **Free testnet RPC endpoints rate-limit.** Settlement retries with backoff, but a busy demo wants a paid key.

## Host it

One container serves the game's pages and its API (`Dockerfile`). Any host that runs a container and gives it a persistent volume will do (Fly.io, Railway, Render).

1. Set the variables from `.env.example`: the NEAR testnet ones, plus `PUBLIC_URL` (your https address), `RESEND_API_KEY` and `MAIL_FROM` for real sign-in emails, and `MASTER_KEY` / `SESSION_SECRET` (generate with `openssl rand -hex 32`; without them the server makes throwaway ones and everyone is signed out on each restart).
2. Mount a volume at `/data`. It holds accounts, wallets and chain progress. The game itself is saved there too.
3. Run **one** copy only. The game world and the chain settler live in that process.
4. Keep the settlement account funded: if it runs out of testnet NEAR, the status page says so and settlement pauses (gameplay keeps going).

## Delivery orders (intents-style)

On any stall you can place a **delivery order**: pick the goods, the units and the lowest price you will take. You don't walk anywhere. Each in-game hour the town's carriers check the stall and, once it pays your price, take the load over and sell it, with the trip's cost taken from the sale. Orders lapse after 24 hours; you can cancel any time. The code is `Game.placeOrder` / `fillOrders` in `server/game.ts`.

This is the *shape* of NEAR Intents (state the result, a solver finds the path, a limit price is enforced), implemented inside the game. It is **not** connected to the NEAR Intents protocol or its solver network.
