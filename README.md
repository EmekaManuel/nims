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
| **Trade** | Collect goods from farms and scrap spots (free) or the wholesaler (fixed price), carry them between three markets, haggle once an hour. Hover any price and the merchant explains it in their own words. |
| **Read the market** | A chalkboard price board shows every good in every market against its usual price. Each stall draws crates from its real stock, so a flooded stall visibly overflows and a broke one has its shutters down. |
| **Revive** | A shop with no cash and no stock closes. Neighbours reopen it with an **fund** pool; contributors become part-owners and their names go on the sign. |
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
web/                   The game and the dashboard (Vite + React + SVG)
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

The deployed contract is `oja-items.testnet`.

## Known limits (honest list)

- **Coins are not on chain.** Only items are settled. Shares, dividends and community funds are game state. The design calls for a small on-chain fund/shares contract, which needs a decision on how coins should work on chain first.
- **The live game is not auto-settled.** The settlement pipeline is built and verified on testnet against the simulation, and the server settles queued player transfers, but the running game's full item ledger isn't streamed to the chain continuously.
- **Login links are shown on screen in development.** A real email provider is one small replacement of the `Mailer` interface.
- **One server process, state in memory with a JSON save.** Fine for a demo; not horizontally scalable.
- **Free testnet RPC endpoints rate-limit.** Settlement retries with backoff, but a busy demo wants a paid key.
