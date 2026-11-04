/** Dev server: `npm run server`. Login links are printed to the console instead of emailed. */
import 'dotenv/config';
import { AccountStore } from './accounts';
import { createApp } from './api';
import { Auth } from './auth';
import { Game } from './game';
import { loadGame, saveGame } from './store';
import { loadEnv } from './chain';
import { realChain } from './relayer';

const env = loadEnv();
const port = Number(process.env.PORT ?? 3000);
const SAVE_FILE = process.env.SAVE_FILE ?? 'server/data/game.json';
const restored = loadGame(SAVE_FILE);
const game = restored ?? new Game(Number(process.env.SEED ?? 1));
console.log(restored ? `Resumed the saved game at day ${Math.floor(game.w.hour / 24) + 1}.` : 'Starting a new game.');
const save = () => { try { saveGame(game, SAVE_FILE); } catch (e) { console.error('Could not save the game:', (e as Error).message); } };
setInterval(save, 20_000);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { save(); process.exit(0); });
// One in-game hour every 4 real seconds: a day passes in about a minute and a half.
setInterval(() => game.tickOnce(), Number(process.env.TICK_MS ?? 4000));
const app = createApp({
  auth: new Auth(process.env.SESSION_SECRET!),
  store: new AccountStore('server/data/accounts.json', env.contractId, process.env.MASTER_KEY!),
  chain: realChain(),
  baseUrl: `http://localhost:${port}`,
  merchantParent: env.parent,
  game,
  devLinks: process.env.OJA_DEV === '1',
  mailer: {
    async sendLoginLink(email, link) {
      console.log(`[dev mailer] login link for ${email}: ${link}`);
    },
  },
});
await app.listen(port);
setInterval(() => void app.flush(), 5_000); // batch-settle every few seconds
console.log(`Oja server on http://localhost:${port}`);
