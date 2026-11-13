# Nims launch video: script (draft for approval)

Voice: your cloned voice (`7IAccZ5Mu2dejWi0Rd6v`), model `eleven_multilingual_v2`, the same voice settings for every beat. One audio file per beat. Spoken at a calm pace with real pauses before the two reveals (marked `[pause]`).

The right-hand "truth" panel in beats 1 and 4 uses only `public/demo-data.json`. Numbers on screen in beat 7 are read from the live game just before the final render and are **not spoken**, so they can change without regenerating any audio.

| # | Time | Spoken (caption text is the same, in 4–8 word groups) | Where each claim comes from |
|---|---|---|---|
| 1 | 0–8 | Ruth runs a salvage stall. She's an AI with her own money. I sold her iron, and her price just dropped. | Ruth's till 50,085 coins and iron buy price 160 → 140 after the sale: `demo-data.json` (from `/game/state`). A merchant's quote falls as its stock rises: `merchants/pricing.ts#L98-L155`; the sale: `sim/engine.ts#L90-L125`. |
| 2 | 8–19 | Most game economies are scripts. Prices follow a table, and nothing changes until the next patch. Hand a language model real money, and it can be wrong, or talked into things. | Problem statement: README first screen and `docs/BOUNDED-AGENTS.md` ("The problem"). No code claim. |
| 3 | 19–29 | Nims is a town with eleven AI merchants. Sign in with Google, or press one button and play as a guest. There's no wallet. | Eleven merchants: `sim/world.ts#L248-L261`. Sign-in buttons: `web/src/game/Login.tsx#L38-L39`. No wallet words in any API body: `server/http/api.test.ts#L126-L136`. |
| 4 | 29–58 | I sell Ruth six iron. My cash lands at once. Her plan for the day is in her own words, and her model picked only two things: sell less iron, and price wider. I never sign anything. My account sends those six iron to hers, as an NEP-245 transfer. A couple of minutes later, it's on NEAR testnet. | Plan words `{"iron":"less"}`, margin `"wider"` and her sentence: `demo-data.json` (from `/game/state`, `server/game/game.ts#L1378`). Plan to step: `sim/plan.ts#L29-L46`. Players never sign: delegate action and relayer, `server/chain/agent-chain.ts#L37-L48`, `server/chain/relay.ts#L22-L26`. The transfer: tx `67D5HX7UhgP1…`, 6 iron to Ruth, 100 s after the sale: `demo-data.json` (nearblocks index, RPC `EXPERIMENTAL_tx_status`). |
| 5 | 58–74 | Here is why it can't go rogue. The model picks from a menu: more, less, or the same. Wider, or narrower. [pause] Ask for triple, or double, and the code drops the reply. The model can steer a shop. It can't touch the money. | The menu and clamps: `sim/plan.ts#L29-L32`. Invalid replies dropped: `server/agents/planner.ts#L78-L104`, `planner.test.ts#L29-L37` (shown, with the real passing output in `clips/planner-test.txt`). Money never passes through the model: `merchants/pricing.ts#L98` and the ledger test `sim/ledger-fuzz.test.ts`. |
| 6 | 74–93 | Nothing here is patched by hand. Shocks roll in. Shops run low, close, and get reopened by a community fund. This is a simulated week, on the same engine. And players vote on the rules: each vote is recorded on a SputnikDAO, by an agent whose key is held by OutLayer. | Shocks `sim/engine.ts#L188-L194`; states `#L130-L148`; funds `#L151-L170`; guild `#L380-L415`. Council: `sim/council.ts`. DAO record and OutLayer clerk: `server/chain/dao.ts#L37-L80`, `server/chain/outlayer.ts`. Proposal 11 Approved: `demo-data.json` (RPC `get_proposal`). The #sim shots are labelled "simulated week" on screen. |
| 7 | 93–104 | These numbers are live. They come from the game's own board, and the contract and the DAO are public on testnet. | Numbers read from `/stats` and `/chain/status` just before render, minus the guests this capture created: `demo-data.json` (`proof`). Contract and DAO ids: `oja-items.testnet`, `nims-council.sputnikv2.testnet`. |
| 8 | 104–112 | Nims. A market town run by AI merchants. Built at the NEAR hackathon. | README first screen. The URLs and tags are on screen, not spoken. |

## Text sent to the voice (pronunciation respelled)

Respellings only change what the voice says, not the captions: `NEP-245` → "N E P two forty-five"; `SputnikDAO` → "Sputnik D A O"; `OutLayer` → "Out Layer"; `testnet` → "test net"; `Nims` stays "Nims" (check the first take).

## Count
Words and characters are printed by `scripts/script-stats.mjs` from the exact text sent to the voice (see the message that asked for approval).
