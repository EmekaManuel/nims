# Truth audit: every number on screen and every claim in the voice-over

Footage is real recordings of the live game (https://nims-app.up.railway.app) as a guest named Demo, captured with `capture/take1.mjs`, `take2.mjs` and `take3.mjs`. Every figure comes from `public/demo-data.json`, built by `capture/make-data.mjs` from the game's own `/game/state`, `/stats`, `/chain/status`, the testnet RPC and the nearblocks index. Re-run `node capture/make-data.mjs` before any new render.

## On-screen figures

| Beat | On screen | Source |
|---|---|---|
| 1, 4 | Ruth's iron buy price **160 → 140** | `/game/state` before and after the sale, `demo-data.json` (`sale1.ruthIronBuyPrice`) |
| 1, 4 | my cash **1,047 → 1,904** | `/game/state`, `sale1.youCash` |
| 4 | Ruth's plan: iron `less`, margin `wider`, and her sentence | `/game/state` (`stalls[].plan`, `server/game/game.ts#L1378`), `sale1.ruthPlan` |
| 4 | "target x0.75", "+0.03 (kept 5–25%)" | `sim/plan.ts#L29-L32` (`STOCK_MULT`, `MARGIN_STEP`, `MARGIN_MIN/MAX`) |
| 4 | NEP-245 `send_many`, my account → ruth, 6 iron, delegate action, relayer pays gas | RPC `EXPERIMENTAL_tx_status` on the real tx; `server/chain/agent-chain.ts#L37-L48`, `server/chain/relay.ts#L22-L26` |
| 4 | tx `67D5HX7UhgP1…`, **+100 s** after the sale | nearblocks index and RPC; block time minus the sale time in `take1.events.json` |
| 5 | the code lines and the passing test output | read from the real files at build time (`scripts/extract-code.mjs` → `public/clips/code.json`, `planner-test.txt`) |
| 6 | "Mira's Greens has closed", price board, festive-season shock, #sim week, council board | live recordings; the #sim shot is tagged SIMULATED on screen |
| 6 | DAO proposal 11, **Approved**, its description | RPC `get_proposal(11)` on `nims-council.sputnikv2.testnet`, `proof.dao.proposal11` |
| 7 | quests, daily reward (100 coins), shares, delivery orders, "Open your own stall · 6,000 coins", the harbour and three frontiers | the live UI, nothing bought or changed (`features.mp4`); `server/game/quests.ts`, `sim/engine.ts#L468`, `sim/world.ts#L43-L48` |
| 8 | **54** people have played | `/stats` `players` (61) minus the **7** guests created by this capture, `proof.playersExcludingCaptureGuests` |
| 8 | **3** rules voted in; **16** DAO proposals; last settled time; epoch | `/stats` `total.passed`, RPC `get_last_proposal_id`, `/chain/status`, read 2026-11-13 19:00 UTC |
| 8 | contract and DAO account ids | `oja-items.testnet`, `nims-council.sputnikv2.testnet` |

Not shown on purpose: the trade count. The capture added several trades (the exact number is not tracked), so showing the live total would overstate real play.

## Voice-over claims

| Beat | Claim | Backed by |
|---|---|---|
| 1 | Ruth is an AI with her own money; her price dropped after I sold iron | her plan from the model (`planner.ts`), her till and price in `/game/state`; `merchants/pricing.ts#L98-L155`, `sim/engine.ts#L90-L125` |
| 2 | Game economies are scripts; a model with real money can be wrong or talked into things | README first screen, `docs/BOUNDED-AGENTS.md` (the problem). A general statement, no code claim. |
| 3 | eleven AI merchants; Google or a guest; no wallet | `sim/world.ts#L248-L261`, `web/src/game/Login.tsx#L38-L39`, `server/http/api.test.ts#L126-L136` |
| 4 | her plan picked two things: less iron, wider | `/game/state` plan `{iron: less, margin: wider}` |
| 4 | I never sign anything; my account sends six iron as an NEP-245 transfer | delegate action signed by the server-held key, relayer pays: `agent-chain.ts#L37-L48`; the tx's `send_many` legs. (README "Honest limits": the server holds the keys.) |
| 4 | a couple of minutes later it is on NEAR testnet | measured 100 s |
| 5 | the model picks from a menu; "triple" is dropped | `sim/plan.ts#L29-L32`, `planner.ts#L78-L104`, `planner.test.ts#L29-L37` |
| 5 | the model can steer a shop; it can't touch the money | money moves only through game actions and the ledger: `sim/ledger-fuzz.test.ts`; prices come from `merchants/pricing.ts#L98` |
| 6 | shocks, shop closures, a community fund reopens them | `sim/engine.ts#L188-L194`, `#L130-L148`, `#L151-L170` |
| 6 | a simulated week on the same engine | the #sim page runs `sim/run.ts`; tagged SIMULATED on screen |
| 6 | players vote on rules; each vote is recorded on a SputnikDAO by an agent whose key OutLayer holds | `sim/council.ts`, `server/chain/dao.ts#L37-L80`, `server/chain/outlayer.ts` (README: only the Town Clerk is OutLayer-custodied) |
| 7 | quests and a daily reward, shares, delivery orders, your own stall, a harbour, three frontiers | the live UI shown in the same shots |
| 8 | these numbers are live, from the game's own board; contract and DAO are public on testnet | `/stats`, `/chain/status`, RPC |
| 9 | a market town run by AI merchants; built at the NEAR hackathon | README first screen |

## Known limits of the video
- The clips show no mouse pointer (Chrome's screen capture omits it), so clicks are implied by the game's response.
- The left pane in beat 4 holds on the result while the chain catches up, and says so on screen.
- 7 capture guests were created on the live game while filming. They are listed here, subtracted from the figure shown, and disclosed in the final report.
- The narration says merchants hold NEAR accounts, not keys. The server holds the keys (README).
