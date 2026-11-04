# Nims demo video (Remotion)

1080p product video: floating browser window, camera zooms, word-by-word captions, title and outro cards, narration.

- `npm install` then `npm run studio` to preview, `npm run render` (voiced) or `npm run render:silent` (no narration track).
- `record.mjs` records clean gameplay (no overlays) against a local server: `NEAR_ACCOUNT_ID= NEAR_PRIVATE_KEY= CONTRACT_ID= NIMS_DEV=1 TICK_MS=4000 PORT=3100 npx tsx server/main.ts`, then `node record.mjs <outdir> src/data/durations.json`. Convert the webm to `public/raw.mp4` at 30 fps and copy `cues.json` to `src/data/`.
- `src/timeline.ts` holds the cue times, camera targets and the 0.8 s clip offset (re-measure it after re-recording).
- `public/vo/*.mp3` is a placeholder computer voice; replace each file with your own take of the same line.
