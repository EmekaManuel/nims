# Nims demo video (Remotion)

1080p, about 100 s. Native 1920x1080 gameplay in a floating browser window with a visible cursor, camera moves, callouts for the real numbers (cash, delivery-order fill, the merchant's own words), a hook and a live-contract scene, sound design and narration.

## Render
- `npm install`, then `npm run studio` to preview; `npm run render` (voiced) or `npm run render:silent`.
- The narration is a placeholder computer voice. For a real one: `ELEVENLABS_API_KEY=... node tts.mjs`, or put your own `public/vo/<scene>.mp3` files in place. Then `node measure.mjs` so scene lengths follow the audio.
- `node chain-snapshot.mjs` re-reads the live testnet contract for the chain scene (real settlement count, block height, balance).

## Re-record the gameplay
1. Start a throwaway offline server: `NEAR_ACCOUNT_ID= NEAR_PRIVATE_KEY= CONTRACT_ID= NIMS_DEV=1 TICK_MS=4000 DATA_DIR=/tmp/nims-demo PORT=3100 npx tsx server/main.ts`
2. `node record.mjs /tmp/take`: records clean footage and `beats.json` (scene start/end times and the numbers read from the page).
3. Convert to `public/raw.mp4` at 30 fps (`ffmpeg -i /tmp/take/video/*.webm -r 30 -c:v libx264 -crf 14 -pix_fmt yuv420p -an public/raw.mp4`).
4. The recording starts with a magenta flash. Find the first frame where the picture is magenta (`signalstats` VAVG above 150), and set `offset` in `beats.json` to `facts.syncAt - that time`. The offset differs from take to take, so measure it every time.
5. Copy `beats.json` to `src/data/`.
