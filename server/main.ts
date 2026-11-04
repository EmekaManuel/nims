/** Dev server: `npm run server`. Login links are printed to the console instead of emailed. */
import 'dotenv/config';
import { AccountStore } from './accounts';
import { createApp } from './api';
import { Auth } from './auth';
import { loadEnv } from './chain';
import { realChain } from './relayer';

const env = loadEnv();
const port = Number(process.env.PORT ?? 3000);
const app = createApp({
  auth: new Auth(process.env.SESSION_SECRET!),
  store: new AccountStore('server/data/accounts.json', env.contractId, process.env.MASTER_KEY!),
  chain: realChain(),
  baseUrl: `http://localhost:${port}`,
  merchantParent: env.parent,
  mailer: {
    async sendLoginLink(email, link) {
      console.log(`[dev mailer] login link for ${email}: ${link}`);
    },
  },
});
await app.listen(port);
setInterval(() => void app.flush(), 5_000); // batch-settle every few seconds
console.log(`Oja server on http://localhost:${port}`);
