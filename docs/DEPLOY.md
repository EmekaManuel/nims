# Deploying Nims

One container serves the pages and the API ([`Dockerfile`](../Dockerfile)); any host that runs a container works (Fly.io, Railway, Render, a VM).

**Railway (what the live demo uses):** New Project, Deploy from GitHub repo (it builds the `Dockerfile`), attach a **Volume** mounted at `/data`, then set `DATA_DIR=/data`, `NIMS_DEV=1`, `MASTER_KEY` and `SESSION_SECRET` (`openssl rand -hex 32` each, set once), `PUBLIC_URL` (your generated `https://...up.railway.app` address) and the testnet variables from `.env.example`. Pushing to the repo redeploys it, so avoid pushes while people are playing.

**Render (free, no card):** [`render.yaml`](../render.yaml) is a ready Blueprint.

1. Push the repo to GitHub. In Render choose **New, Blueprint** and pick it.
2. Fill the prompted variables: `PUBLIC_URL` (the `https://...onrender.com` address Render gives you), and the testnet ones from `.env.example` (`NEAR_RPC_URL`, `NEAR_ACCOUNT_ID`, `NEAR_PRIVATE_KEY`, `CONTRACT_ID`). Leave them empty to run without the chain. `MASTER_KEY` and `SESSION_SECRET` are generated for you.
3. Open the address. `NIMS_DEV=1` shows the sign-in link on screen so anyone can try it without email. Remove it, and set `RESEND_API_KEY` and `MAIL_FROM`, to send real emails.
4. Keep it awake during judging with a free pinger (for example UptimeRobot hitting the address every 5 minutes).

**Know the limits of a free plan:** Render's free tier sleeps when idle and wipes its disk on restart or redeploy, so players and saves reset. Anything that should last needs a persistent volume at `/data` (it holds accounts, wallets, chain progress and the game save).

Always: run **one** copy only (the game world and the settler live in that process), and keep the settlement account funded. If it runs out of testnet NEAR, the status page says so and settlement pauses while gameplay continues. Never commit `.env`.

## Optional features on a host

Set these as variables on the host to turn the extras on (each falls back to plain text and the browser voice if missing):

- `NEAR_AI_API_KEY`: NEAR AI Cloud writes the merchant voice, the town gazette and haggling reactions. Optional `NEAR_AI_MODEL`.
- `ELEVENLABS_API_KEY`: natural spoken merchants. Optional `ELEVENLABS_VOICES` (a JSON map of merchant id to voice id), `ELEVENLABS_VOICE`, `ELEVENLABS_MODEL`.
- `TICK_MS`: real milliseconds per game hour (default 10000).

Both keys cost credits per use, though results are cached and capped at 20 AI calls and 20 speech clips a minute. Keep them in the host's secret settings, never in the repository.
