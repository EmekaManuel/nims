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
- **Farms** on the edge of town → tomatoes, pepper, cassava (→ flour at a merchant).
- **Scrap spots** around the map → iron, copper wire. Respawn on a timer.
- **Wholesaler** → buy bulk cloth at a fixed price (a stable price anchor).

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
2. **Revive:** when an community fund fills, the closed shop reopens with contributors' names on its sign.
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
- If `cash == 0` and there's no sellable stock: the state becomes `closed`, and the shop is investable via an community fund.
- Personality only changes the parameters (`elasticity`, `demandWeight`, `margin`), never the formula.
- Every term returns a plain-English line, and the tooltip is those lines joined together.

Pricing is a **pure function**: same inputs, same price. The live game and fast-forward mode call the same function.

---

## 4. On-chain design (invisible to the player)

| Concern | Approach |
|---|---|
| Items | One **NEP-245** multi-token contract holds every item type (token id per item). |
| Money | An in-game coin token, either fungible or a NEP-245 id. Keep it simple. |
| Login | Social or email login creates a NEAR account behind the scenes. No seed phrase. |
| Gas | A relayer pays for meta-transactions, so player actions are signed silently. |
| Speed | Trades apply instantly to game state, then **batch-settle** to the chain every few seconds. The player never waits on a block. |
| Merchants | Each agent owns a NEAR account and signs its own settlements. |
| Cross-market moves and investments | Expressed as **NEAR Intents**, for example "move 50 iron from Scrap to Hardware for X coins." |
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