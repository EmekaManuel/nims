# Nims launch video: script (draft for approval)

Voice: your cloned voice (`7IAccZ5Mu2dejWi0Rd6v`), model `eleven_multilingual_v2`, the same voice settings for every beat. One audio file per beat. A calm pace with a real pause before the "triple" reveal in beat 5.

The right-hand "truth" panel in beats 1 and 4 uses only `public/demo-data.json`. Figures on screen in beat 8 are read from the live game just before the final render.

| # | Time | Spoken (captions are the same words, in 4–8 word groups) | Where each claim comes from |
|---|---|---|---|
| 1 | 0–8 | Ruth runs a salvage stall. She's an AI with her own money. I sold her iron, and her price just dropped. | Ruth's till 50,085 coins and iron buy price 160 → 140 after the sale: `demo-data.json` (from `/game/state`). A quote falls as stock rises: `merchants/pricing.ts#L98-L155`; the sale: `sim/engine.ts#L90-L125`. |
| 2 | 8–16 | Most game economies are scripts. And a language model with real money can be wrong, or talked into things. | Problem statement: README first screen and `docs/BOUNDED-AGENTS.md` ("The problem"). No code claim. |
| 3 | 16–26 | Nims is a town of eleven AI merchants. Sign in with Google, or press one button and play as a guest. No wallet. | Eleven merchants: `sim/world.ts#L248-L261`. Sign-in buttons: `web/src/game/Login.tsx#L38-L39`. No wallet words in any API body: `server/http/api.test.ts#L126-L136`. |
| 4 | 26–52 | I sell Ruth six iron. Her plan, in her own words, picked only two things: sell less iron, and price wider. I never sign anything. My account sends those six iron to hers, as an NEP-245 transfer. A couple of minutes later, it's on NEAR testnet. | Plan `{"iron":"less"}`, margin `"wider"` and her sentence: `demo-data.json` (from `/game/state`, `server/game/game.ts#L1378`). Plan to step: `sim/plan.ts#L29-L46`. Players never sign (delegate action, relayer): `server/chain/agent-chain.ts#L37-L48`, `server/chain/relay.ts#L22-L26`. The transfer: tx `67D5HX7UhgP1…`, 6 iron to Ruth, 100 s after the sale: `demo-data.json` (nearblocks index, RPC `EXPERIMENTAL_tx_status`). |
| 5 | 52–68 | Here is why it can't go rogue. The model picks from a menu: more, less, or the same. Wider, or narrower. Ask for triple, and the code drops the reply. The model can steer a shop. It can't touch the money. | Menu and clamps: `sim/plan.ts#L29-L32`. Invalid replies dropped: `server/agents/planner.ts#L78-L104`, `planner.test.ts#L29-L37` (shown, with the real passing output in `clips/planner-test.txt`). Money never passes through the model: `merchants/pricing.ts#L98`, `sim/ledger-fuzz.test.ts`. |
| 6 | 68–86 | Nothing here is patched by hand. Shocks roll in, shops close, and a community fund reopens them. This is a simulated week, on the same engine. Players vote on the rules, and each vote is recorded on a SputnikDAO by an agent whose key OutLayer holds. | Shocks `sim/engine.ts#L188-L194`; states `#L130-L148`; funds `#L151-L170`. Council: `sim/council.ts`. DAO record and OutLayer clerk: `server/chain/dao.ts#L37-L80`, `server/chain/outlayer.ts`. The #sim shots are labelled "simulated week" on screen. |
| 7 | 86–98 | And there's more. Quests and a daily reward, shares in a merchant, delivery orders, your own stall, a harbour, and three frontiers to settle. | Real UI, nothing bought or changed (`clips/features.mp4`): quests, daily reward and invites `server/game/quests.ts#L69-L91`; shares and delivery orders in the stall panel (`server/game/game.ts#L940`, `#L335`); your own stall, 6,000 coins `sim/engine.ts#L468`; the harbour and three frontiers `sim/world.ts#L43-L48`. |
| 8 | 98–108 | These numbers are live, from the game's own board. The contract and the DAO are public on testnet. | Numbers read from `/stats` and `/chain/status` just before render, minus the guests this capture created: `demo-data.json` (`proof`). Contract and DAO ids on screen. Proposal 11 Approved: RPC `get_proposal`. **Not spoken, so they can change without new audio.** |
| 9 | 108–114 | Nims. A market town run by AI merchants. Built at the NEAR hackathon. | README first screen. The URLs and tags are on screen, not spoken. |

## Text sent to the voice (pronunciation respelled)
`NEP-245` → "N E P two forty-five"; `SputnikDAO` → "Sputnik D A O"; `OutLayer` → "Out Layer"; `testnet` → "test net"; `DAO` → "D A O". Only the voice text changes, not the captions.

## Count
`node scripts/script-stats.mjs` prints the words, characters and banned-phrase scan from `vo-script.json`.
