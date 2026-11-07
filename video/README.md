# Nims demo video (Remotion)

1080p, about 132 s, narrated in a cloned ElevenLabs voice, set **at night in the 3D town**. It is **not a screen recording**: Remotion draws the game's real React screen (`web/src/game/GameScreen`) and its real 3D town (`Map3D`, React Three Fiber) from states produced by the real game engine, with a scripted cursor and cameras. Every frame is drawn from the time of the frame alone (walkers, the truck, rain and limb swing are pure functions of time), so frames can render in any order, in parallel.

What is real in it:

- **The screen:** the same components the live game uses (3D map, HUD, stall panel, deals drawer, council panel, news), drawn from `GameState` objects. The picture is set at night by moving each shot's game hour into the dark, so the lamps, windows and stall lights come on.
- **The numbers and events:** played through the real `Game` class (`scripts/play-session.ts`): the loading screen and sign-in (Google button and email), collecting cotton, selling with a haggle, a town council vote (a rent cut that passes at the end of the day), running out of coins, the scrap heap, taking and delivering an odd job. The "run out of coins" moment is staged by moving coins through the ledger.
- **The council record:** with `SPUTNIK_DAO_ID` and `OUTLAYER_API_KEY` set, the same script writes that vote to the real SputnikDAO through the OutLayer-custodied Town Clerk, exactly as the live server does, and the record scene shows the proposal it made.
- **The words:** the merchant's price explanation, the haggle reaction and the gazette headlines come from the real NEAR AI Cloud calls. The merchants' spoken lines are real ElevenLabs clips of those words. For the video each merchant line is trimmed to its first sentence so it stays short.
- **The chain scene:** the live testnet contract's batch count, block height and balance, read by `chain-snapshot.mjs`.
- **The fast-forward week** is the real dashboard (`FastForwardPage` in replay mode) drawn from a run of the real engine (`scripts/make-ffrun.ts` → `src/data/ffrun.json`), frozen at the hour the video has reached and scrolled down the page.

## Render
- `npm install`, then `npm run studio` to preview; `npm run render` (voiced) or `npm run render:silent` (no narration, for your own voice).

## Rebuild it from scratch
Needs `NEAR_AI_API_KEY` and `ELEVENLABS_API_KEY` in `../.env` (and `SPUTNIK_DAO_ID`, `OUTLAYER_API_KEY` and the testnet account to record the council vote on the DAO; without them the vote is still played, just not recorded).

1. `npm run session` plays the story through the real game and writes `src/data/session.json` (states, recorded lines and the DAO proposal) and `public/live/*.mp3` (the merchants' spoken lines). Pass a seed to get a different town: `npm run session -- 5`. Then `npm run ffrun` makes the fast-forward week for the dashboard scene.
2. Edit `src/data/lines.json` if you want to change the narration, then `node --env-file=../.env tts.mjs` makes `public/vo/<scene>.mp3` (voice id `7IAccZ5Mu2dejWi0Rd6v`, or set `ELEVENLABS_VOICE`). `node --env-file=../.env tts.mjs council record` makes just those lines and spends no other credits.
3. `node measure.mjs` reads the length of every narration line and merchant clip, so scene lengths follow the audio.
4. `npm run measure` renders each recorded shot of the real screen and records where its buttons and panels are (`src/data/targets.json`), so the cursor points at the real elements. Run it again whenever the game's layout changes. Clicks on things in the 3D town (the cotton shed, Lena's stall) are projected through the scene's camera (`src/native/town.ts`).
5. `node chain-snapshot.mjs` refreshes the live-contract numbers.
6. `npm run render`.

## The 3D cameras
Each scene has a camera track (`townCamAt`, in `src/native/Nims.tsx`): positions that ease from one to the next. The side drawer covers the right third of the map when it is open, and the video zooms the whole screen into the drawer, so the cameras are aimed with `node scripts/aim.mjs`, which works out where to point the camera so a stall or the cotton shed lands at a chosen pixel of the final picture, through that zoom. `npx remotion still src/index.ts Town3dTest out/town.png --props='{"pos":[0,9.5,11],"look":[0,0,-0.5],"fov":38}'` renders one frame from any camera to check it.

## How it fits together
- `src/native/Screen.tsx` renders one recorded shot, with a camera, and holds the game's tooltip and haggle checkbox in the state the script asks for. It drives the 3D town (time, camera, night) and holds each frame until the canvas has drawn it. `TownCanvas` is the 3D town on its own, behind the title cards.
- `src/native/Nims.tsx` is the composition: each scene's script says which shot shows when, where the cursor goes and what the camera does.
- `src/timeline.ts` turns the narration and clip lengths into scene lengths.
- `web/src/lib/services.tsx` is how the screen asks for a merchant's voice, the gazette and the chain proof: the game uses the live server, the video supplies the recorded answers.
