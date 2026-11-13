# Nims launch video: storyboard (draft for approval)

Target 100–115 s, hard cap 2:15 (X allows 2:20). 1920×1080, 30 fps, built in the repo's existing Remotion project (`video/`, Remotion 4.0.290). Everything shown is real footage of the live game (https://nims-app.up.railway.app), real terminal output, or real RPC data read at capture time. Graphics are limited to title cards, captions and overlays that look like graphics.

The one idea: **the merchants are AI, they handle real accounts, and they cannot go rogue, because the model only picks from steps the code allows.**

## Beats

| # | Time | Shot (real source) | Truth-layer / overlay | Caption (4–8 words) | Claim and citation |
|---|---|---|---|---|---|
| 1 | 0–7 | Live game, 3D or 2D map. A player sells a load of iron to Anil Metals. Anil's cash and iron price change on screen. No logo. | Small overlay: Anil's till and price before → after, from `/game/state` taken at that moment. | "This shopkeeper is an AI. It has its own money." | Merchants price from stock and cash: `merchants/pricing.ts#L98-L155`. A sale moves goods and cash: `sim/engine.ts#L90-L125`. |
| 2 | 7–17 | Brand title card on the grid, two lines. | none | "Game economies are scripts." / "A model with real money can be talked into anything." | Problem statement: README first screen. No code claim. |
| 3 | 17–27 | Live sign-in screen: **Continue with Google** and **Play as a guest**, then the guest press and the town. No wallet anywhere. | none | "Play in one press. No wallet." | Sign-in: `web/src/game/Login.tsx#L38-L39`. No wallet words in any API body: `server/http/api.test.ts#L126-L136`. |
| 4 | 27–55 | **Split screen.** Left: live game, collect tomatoes, sell to Mira's Greens, haggle. Right (TruthPanel, mono): the merchant's plan for the day (stock words, margin word, reason) → the fixed step it maps to; Mira's cash before/after; then the same trade on the testnet explorer. | The right side is built only from `demo-data.json`: plan from `/game/state` (`server/game/game.ts#L1378`), balances from the same state, the explorer account page and the `behind` count. **The chain side lands later than the game side (settlement runs in windows). The cut shows a visible "later" label and both real timestamps.** | "The player sees a sale." / "The chain sees an NEP-245 transfer." | Plan to step: `sim/plan.ts#L29-L46`. Delegate action and relayer: `server/chain/agent-chain.ts#L37-L48`, `server/chain/relay.ts#L22-L26`. Explorer link: `server/chain/chainsync.ts#L437-L440`. |
| 5 | 55–70 | Real terminal: `npx vitest run server/agents/planner.test.ts`. Highlight the lines where the model says `"triple"` or `"double"` and the code returns `null`, and where an invented number is replaced. | The real file lines `planner.test.ts#L24-L37`, read at build time, next to the real passing output. | "The model asks for triple." / "The code says no." | Menu and clamps: `sim/plan.ts#L29-L32`. Invalid replies ignored: `server/agents/planner.ts#L78-L104`, `planner.test.ts#L29-L37`. Invented numbers replaced: `planner.test.ts#L24`, `server/voice/llm.ts#L74`. |
| 6 | 70–90 | About 2 s shots, all real: price board with prices moving; a live shock banner if one is active; the **#sim** simulated week (labelled "simulated week, same engine") where a merchant goes from struggling to closed and is revived; the News feed; the council board with the **passed** Produce Market rent vote, then the SputnikDAO proposal #11 **Approved** read by RPC. | Each shot gets a small label saying what it is (live / simulated). DAO proposal read with a read-only RPC call. | "No dev patch." / "Players voted. The DAO recorded it." | States: `sim/engine.ts#L130-L148`. Shocks: `#L188-L194`. Guild: `#L380-L415`. Council: `sim/council.ts`. DAO record: `server/chain/dao.ts#L37-L80`. Clerk key custody: `server/chain/outlayer.ts`. |
| 7 | 90–102 | The live town board, then the numbers counting up. | Live players, trades, council votes passed, last settlement, the contract `oja-items.testnet` and the DAO `nims-council.sputnikv2.testnet`. **Read just before render. Never rounded.** | "54 people. 34 trades. 1 rule voted in." (real figures at render time) | `/stats`, `/chain/status`, RPC `view_account`. |
| 8 | 102–112 | Close card on the grid. | none | "Nims. A market town run by AI merchants." | Pitch: README first screen. URLs and tags are on screen, not spoken. |

30 s teaser for a reply post: beats 1, 4 (shortened) and 8.

## What each side of beat 4 is made from (all real, nothing recreated)
- **Left:** a Playwright recording (`recordVideo`) of the live game at 1920×1080, with eased mouse paths so the cursor moves like a person.
- **Right, planner step:** `stalls[].plan` from `/game/state` (the merchant's real, already-validated plan), mapped to its numeric step with the constants in `sim/plan.ts#L29-L32`.
- **Right, balances:** the same state before and after the click.
- **Right, chain:** the explorer page for the player's account (`proof.explorer`), screenshotted after settlement catches up, plus the `behind` count at the click.

## Honest limits the narration must respect
- Merchant and player keys are held by the server (README "Honest limits"). The video says merchants "hold their own NEAR accounts", not that they hold their own keys.
- Settlement is background work in windows, so the chain does not update at the instant of the click. The split screen shows the lag.
- NEAR Intents is partial, so the video does not mention it.
- The "simulated week" shots are the same engine but not live players, and are labelled as such.
- Google OAuth cannot be automated, so the sign-in beat shows the real sign-in screen and the guest press. The narration says "Google or guest", not that Google was used.

## Decisions I need from you (⏸)
1. **Where to capture.** (A) The live site as a guest player. Recommended: it is the only way to get a real transaction. It adds one guest and a few trades to the live board. (B) You screen-record by hand to my list. (C) A local server with `CHAIN_SYNC=0`: no real transaction, so beat 4's right side would not be real.
2. **Playwright.** It is not in the repo. I would add `playwright-core` as a dev dependency in `video/` and drive your installed Chrome (`channel: 'chrome'`), with no browser download. OK?
3. **3D or 2D footage.** The existing `remotion.config.ts` warns that the 3D town glitches in parallel headless tabs. I'll test one headless capture of the 3D town and fall back to the 2D map, or ask you to hand-record, if it glitches.
4. **Voice.** The current demo uses your cloned voice (`7IAccZ5Mu2dejWi0Rd6v`). Reuse it, or have me list three account voices to compare? I will show the character count and cost before any spend beyond the draft pass.
5. **Music.** None, unless you give me a track with a confirmed license.
6. **Publishing.** You already posted the 2:19 cut and sent a request-changes. A new video means a new post (or a reply) and another request-changes to update `demoUrl`. Work budget: capture, voice, build and render in about 14–18 hours, with the final render at least 6 hours before 2026-11-14T23:59Z.
