# Nims demo video (Remotion)

1080p, about 104 s, narrated in a cloned ElevenLabs voice. It is **not a screen recording**: Remotion draws the game's real React screen (`web/src/game/GameScreen`) from states produced by the real game engine, with a scripted cursor and camera, so every frame is crisp vector UI at any zoom and nothing depends on a recording being in sync.

What is real in it:

- **The screen:** the same components the live game uses (map, HUD, stall panel, deals drawer, news), drawn from `GameState` objects.
- **The numbers and events:** played through the real `Game` class (`scripts/play-session.ts`): the loading screen and sign-in (Google button and email), collecting cotton, selling with a haggle, running out of coins, the scrap heap, taking and delivering an odd job. The "run out of coins" moment is staged by moving coins through the ledger.
- **The words:** the merchant's price explanation, the haggle reaction and the gazette headlines come from the real NEAR AI Cloud calls. The merchants' spoken lines are real ElevenLabs clips of those words. For the video each merchant line is trimmed to its first sentence so it stays short.
- **The chain scene:** the live testnet contract's batch count, block height and balance, read by `chain-snapshot.mjs`.
- **The fast-forward week** is the one scene that is footage (`public/raw.mp4`), because the replay is an animation the game plays itself.

## Render
- `npm install`, then `npm run studio` to preview; `npm run render` (voiced) or `npm run render:silent` (no narration, for your own voice).

## Rebuild it from scratch
Needs `NEAR_AI_API_KEY` and `ELEVENLABS_API_KEY` in `../.env`.

1. `npm run session` plays the story through the real game and writes `src/data/session.json` (states and recorded lines) and `public/live/*.mp3` (the merchants' spoken lines). Pass a seed to get a different town: `npm run session -- 5`.
2. Edit `src/data/lines.json` if you want to change the narration, then `node --env-file=../.env tts.mjs` makes `public/vo/<scene>.mp3` (voice id `7IAccZ5Mu2dejWi0Rd6v`, or set `ELEVENLABS_VOICE`).
3. `node measure.mjs` reads the length of every narration line and merchant clip, so scene lengths follow the audio.
4. `npm run measure` renders each recorded shot of the real screen and records where its buttons, prices and stalls are (`src/data/targets.json`), so the cursor points at the real elements. Run it again whenever the game's layout changes.
5. `node chain-snapshot.mjs` refreshes the live-contract numbers.
6. `npm run render`.

## How it fits together
- `src/native/Screen.tsx` renders one recorded shot, with a camera, and holds the game's tooltip and haggle checkbox in the state the script asks for.
- `src/native/Nims.tsx` is the composition: each scene's script says which shot shows when, where the cursor goes and what the camera does.
- `src/timeline.ts` turns the narration and clip lengths into scene lengths.
- `web/src/lib/services.tsx` is how the screen asks for a merchant's voice, the gazette and the chain proof: the game uses the live server, the video supplies the recorded answers.
