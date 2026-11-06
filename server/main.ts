/** Dev server: `npm run server`. Login links are printed to the console instead of emailed. */
import 'dotenv/config';
import { AccountStore } from './accounts/accounts';
import { createApp } from './http/api';
import { Auth } from './http/auth';
import { Game } from './game/game';
import { loadGame, saveGame } from './game/store';
import { loadEnv } from './chain/chain';
import { ChainPort, offlineChain, realChain } from './chain/relayer';
import { loadSecrets } from './accounts/secrets';
import { agentChain } from './chain/agent-chain';
import { ChainSync } from './chain/chainsync';
import { WalletStore } from './accounts/wallets';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resendMailer } from './http/mailer';
import { createChat } from './voice/llm';
import { createGazette } from './voice/gazette';
import { createHaggler } from './voice/haggle';
import { createVoice } from './voice/voice';
import { createSpeaker } from './voice/speaker';

/** The built web app. When it exists this server serves the game's pages too (see Dockerfile). */
const WEB_DIST = resolve('web/dist');

const secrets = loadSecrets();
if (secrets.generated) console.log('No MASTER_KEY/SESSION_SECRET in .env: using generated development secrets (server/data/dev-secrets.json).');

// Testnet is optional. With credentials the game settles to the chain in the background; without them
// it runs exactly the same, and just doesn't settle anywhere. Gameplay never depends on the chain.
let chain: ChainPort = offlineChain;
let contractId = 'oja.testnet';
let merchantParent = 'oja.testnet';
try {
  const env = loadEnv();
  chain = realChain();
  contractId = env.contractId;
  merchantParent = env.parent;
  console.log(`Settling to NEAR testnet through ${env.contractId}.`);
} catch (e) {
  console.log(`Running without the chain: ${(e as Error).message} The game itself is unaffected.`);
}
// Where accounts, wallets and chain progress live. Override to run a second copy (e.g. to record a demo) without touching the first.
const DATA = process.env.DATA_DIR ?? 'server/data';
const port = Number(process.env.PORT ?? 3000);
const SAVE_FILE = process.env.SAVE_FILE ?? `${DATA}/game.json`;
const restored = loadGame(SAVE_FILE);
const game = restored ?? new Game(Number(process.env.SEED ?? 1));
console.log(restored ? `Resumed the saved game at day ${Math.floor(game.w.hour / 24) + 1}.` : 'Starting a new game.');
const save = () => { try { saveGame(game, SAVE_FILE); } catch (e) { console.error('Could not save the game:', (e as Error).message); } };
setInterval(save, 20_000);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { save(); process.exit(0); });
// One in-game hour every 4 real seconds: a day passes in about a minute and a half.
// One game hour per tick. 10 s keeps prices readable: at 4 s nearly every price moved every tick (about 6%), too fast to follow or read a tooltip.
setInterval(() => game.tickOnce(), Number(process.env.TICK_MS ?? 10_000));
// The live settler streams every trade (goods and coins) to the testnet in the background, with each
// account signing its own transfers. If it is on, it handles every player's account too, so the older
// per-player relayer is switched off to avoid doing the same work twice.
let sync: ChainSync | null = null;
if (chain !== offlineChain && process.env.CHAIN_SYNC !== '0') {
  sync = new ChainSync({
    game,
    ops: agentChain(),
    contractId,
    rootWallets: new WalletStore(`${DATA}/chain-roots.json`, contractId, secrets.masterKey),
    walletsFor: (ns) => new WalletStore(`${DATA}/wallets-${ns}.json`, ns, secrets.masterKey),
    stateFile: `${DATA}/chain-state.json`,
    log: (m) => console.log(m),
  });
  void sync.run();
  console.log('Streaming the game to the chain in the background.');
}
// One connection to NEAR AI Cloud for every feature that writes words, so they share one rate budget.
const ai = process.env.NEAR_AI_API_KEY ? createChat({ apiKey: process.env.NEAR_AI_API_KEY, model: process.env.NEAR_AI_MODEL || undefined, baseUrl: process.env.NEAR_AI_BASE_URL || undefined }) : undefined;
const app = createApp({
  auth: new Auth(secrets.sessionSecret),
  store: new AccountStore(`${DATA}/accounts.json`, contractId, secrets.masterKey),
  chain: sync ? offlineChain : chain,
  chainStatus: sync ? () => sync!.status() : undefined,
  chainProof: sync ? (email) => sync!.proof(game.playerFor(email).id) : undefined,
  baseUrl: (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, ''),
  staticDir: existsSync(WEB_DIST) ? WEB_DIST : undefined,
  merchantParent,
  game,
  devLinks: process.env.NIMS_DEV === '1',
  speaker: process.env.ELEVENLABS_API_KEY?.trim() ? createSpeaker({ apiKey: process.env.ELEVENLABS_API_KEY.trim().split(/\s+/)[0], voices: process.env.ELEVENLABS_VOICES ? JSON.parse(process.env.ELEVENLABS_VOICES) : undefined, defaultVoice: process.env.ELEVENLABS_VOICE || undefined, model: process.env.ELEVENLABS_MODEL || undefined }) : undefined,
  voice: ai ? createVoice({ chat: ai }) : undefined,
  gazette: ai ? createGazette({ chat: ai }) : undefined,
  haggler: ai ? createHaggler({ chat: ai }) : undefined,
  mailer: process.env.RESEND_API_KEY ? resendMailer(process.env.RESEND_API_KEY, process.env.MAIL_FROM ?? 'Nims <onboarding@resend.dev>') : {
    async sendLoginLink(email, link) {
      console.log(`[dev mailer] login link for ${email}: ${link}`);
    },
  },
});
await app.listen(port);
if (process.env.NEAR_AI_API_KEY) console.log('Merchant voice: on (NEAR AI Cloud).');
if (process.env.ELEVENLABS_API_KEY?.trim()) console.log('Spoken merchants: on (ElevenLabs).'); else console.log('Spoken merchants: using the browser voice (set ELEVENLABS_API_KEY for natural speech).');
if (process.env.RESEND_API_KEY) console.log('Login links are emailed.'); else console.log('No RESEND_API_KEY: login links are printed here instead of emailed.');
if (!sync) setInterval(() => void app.flush(), 5_000); // batch-settle every few seconds
console.log(`Nims server on http://localhost:${port}`);
