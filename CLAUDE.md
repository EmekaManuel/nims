# CLAUDE.md — Oja

Read `DESIGN.md` before doing anything. It is the source of truth for the game loop, pricing, and architecture.

## Hard rules
- **Items are NEP-245** multi tokens. One contract holds every item type. Don't create per-item contracts.
- **No wallet UX in the game loop.** No seed phrases, wallet popups, or gas prompts. Use social or email login plus a relayer for meta-transactions.
- **All merchant pricing lives in `merchants/pricing.ts`.**
  - It is a pure function: same inputs, same output.
  - It returns the price *and* a list of plain-English reasoning lines for the tooltip.
  - Personality only changes parameters, never the formula.
- **Never block gameplay on the chain.** Apply trades to game state immediately and batch-settle on chain.
- **Fast-forward mode must call the same `pricing.ts`** as the live game. No duplicate economy logic.
- Default to NEAR **testnet**. Never touch mainnet or real funds.
- Keep secrets (relayer keys, agent keys) in `.env`, never in code or commits. Commit a `.env.example`.

## How to work
- Build **one milestone at a time** (DESIGN.md §6). Don't start the next one until the current exit test passes.
- Show a short plan before writing files for a new milestone.
- Write tests for `pricing.ts` covering:
  - flooding lowers buy prices
  - scarcity raises prices
  - clamps hold
  - the cash floor stops buying
  - a broke merchant closes
- Prefer small, readable modules. Judges will read `pricing.ts`, so keep it well commented.
- Use the NEAR dapp agent skill (from the track's "Start here") for scaffolding and NEAR conventions where it applies.

## Suggested layout
```
/merchants/pricing.ts     # the one readable pricing file
/merchants/agents/        # merchant agent logic + wallets
/sim/                     # headless fast-forward simulation + dashboard data
/contracts/items/         # NEP-245 contract
/contracts/ajo/           # ajo pools + merchant shares
/server/                  # game state, relayer, batch settlement
/web/                     # UI: map, stalls, price board, tooltips
```

## Tone
Lagos setting: affectionate and specific (places, goods, events, ajo). No caricatures or stereotypes in names, dialogue, or art.