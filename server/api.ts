/**
 * Game server HTTP API. Deliberately free of wallet vocabulary: no seed phrases, keys,
 * accounts, gas or signing appear in any request or response (CLAUDE.md hard rule).
 *
 * Gameplay never waits on the chain: /trade/send answers immediately and the transfer is
 * settled in the background by `flush()` (called on a timer by server/main.ts).
 */
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { AccountStore } from './accounts';
import { Auth, looksLikeEmail, normaliseEmail } from './auth';
import { ChainPort } from './relayer';
import { Game } from './game';
import { runFastForward, sanitize, FastForwardResult } from '../sim/fastforward';
import { BASE_PRICE, createMerchants } from '../sim/world';

export interface Mailer {
  sendLoginLink(email: string, link: string): Promise<void>;
}

export interface AppDeps {
  auth: Auth;
  store: AccountStore;
  chain: ChainPort;
  mailer: Mailer;
  /** Public origin used to build the login link, e.g. http://localhost:3000 */
  baseUrl: string;
  /** Parent account for merchant NEAR accounts (see server/settle.ts accountFor). */
  merchantParent: string;
  /** The live game. Optional so the account/relayer API can be tested alone. */
  game?: Game;
  /** Dev only: return the login link in the response instead of emailing it. Never enable in production. */
  devLinks?: boolean;
  /** Opt-in proof for the curious: where the game's goods and coins live on the testnet. Nothing in the game needs it. */
  chainStatus?: () => unknown;
  /** The signed-in player's own proof link, if the live settler is on. */
  chainProof?: (email: string) => unknown;
  /** Folder of the built web app (web/dist). When set, this server also serves the game's pages, so one process hosts everything. */
  staticDir?: string;
  /** Minimum gap between two different fast-forward runs. Default 500ms; tests set 0. */
  fastForwardGapMs?: number;
}

interface Pending {
  email: string;
  to: string;
  item: string;
  units: number;
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };
/** A file inside the built web app for this path (the page itself for "/"), or null. Never leaves the folder. */
function staticFile(dir: string, pathname: string): string | null {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\]|\.\.)+/, '');
  const f = join(dir, rel === '' ? 'index.html' : rel);
  if (!f.startsWith(dir)) return null;
  try { if (existsSync(f) && statSync(f).isFile()) return f; } catch { /* fall through */ }
  return null;
}

const MERCHANTS = new Set(createMerchants().map((m) => m.id));
const COOKIE = 'nims_session';

const readJson = (req: IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c)).on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });

const send = (res: ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(code, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

const cookieOf = (req: IncomingMessage) =>
  /(?:^|;\s*)nims_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];

export function createApp(d: AppDeps) {
  const queue: Pending[] = [];
  // Fast-forward runs are cheap but not free: remember recent ones and space out new ones.
  const ffCache = new Map<string, FastForwardResult>();
  let ffLast = 0;
  const creating = new Set<string>();

  /** First login: make the player's on-chain account in the background. Gameplay doesn't wait for it. */
  function ensureAccount(email: string) {
    const acct = d.store.getOrCreate(email);
    if (acct.onChain || creating.has(email)) return;
    creating.add(email);
    d.chain
      .createPlayerAccount(acct.accountId, acct.publicKey)
      .then(() => d.store.markOnChain(email))
      .catch((e) => console.error('account setup failed, will retry on next login:', e?.message))
      .finally(() => creating.delete(email));
  }

  /** Settle queued transfers to the chain. Returns how many succeeded. Failed ones stay queued. */
  async function flush(): Promise<number> {
    let ok = 0;
    while (queue.length) {
      const p = queue[0];
      const acct = d.store.getOrCreate(p.email);
      if (!acct.onChain) break; // account not ready yet; try again next flush
      try {
        await d.chain.transferItem(
          { accountId: acct.accountId, secretKey: d.store.secretKeyOf(p.email) },
          `${p.to}.${d.merchantParent}`,
          p.item,
          p.units,
        );
        queue.shift();
        ok++;
      } catch (e) {
        console.error('settlement failed, will retry:', (e as Error)?.message);
        break;
      }
    }
    return ok;
  }

  async function handler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', d.baseUrl);

    if (req.method === 'POST' && url.pathname === '/auth/request') {
      const email = normaliseEmail(String((await readJson(req)).email ?? ''));
      if (!looksLikeEmail(email)) return send(res, 400, { error: 'Enter a valid email address.' });
      const link = `${d.baseUrl}/auth/verify?token=${d.auth.magicToken(email)}`;
      await d.mailer.sendLoginLink(email, link);
      // Same answer whether or not we've seen this email before.
      return send(res, 200, d.devLinks ? { ok: true, devLink: link } : { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/auth/verify') {
      const email = d.auth.verifyMagic(url.searchParams.get('token') ?? '');
      // A person clicking the emailed link (a browser page load) lands back in the game; API callers get JSON.
      const fromBrowser = (req.headers.accept ?? '').includes('text/html');
      if (!email) {
        if (fromBrowser) { res.writeHead(302, { location: '/?login=expired' }); return void res.end(); }
        return send(res, 400, { error: 'That link has expired. Ask for a new one.' });
      }
      ensureAccount(email);
      const cookie = `${COOKIE}=${d.auth.sessionToken(email)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${d.baseUrl.startsWith('https:') ? '; Secure' : ''}`;
      if (fromBrowser) { res.writeHead(302, { location: '/', 'set-cookie': cookie }); return void res.end(); }
      return send(res, 200, { ok: true }, { 'set-cookie': cookie });
    }

    if (req.method === 'GET' && d.staticDir) {
      const file = staticFile(d.staticDir, url.pathname);
      if (file) {
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
        return void res.end(readFileSync(file));
      }
    }

    // Public and read-only: how far the background settlement has got. The game never reads this.
    if (req.method === 'GET' && url.pathname === '/chain/status') {
      return send(res, 200, d.chainStatus ? d.chainStatus() : { enabled: false });
    }

    // Open to everyone, no login: it touches no player data and starts its own fresh world.
    if (req.method === 'POST' && url.pathname === '/sim/fastforward') {
      const params = sanitize(await readJson(req));
      const key = JSON.stringify(params);
      let result = ffCache.get(key);
      if (!result) {
        const wait = (d.fastForwardGapMs ?? 500) - (Date.now() - ffLast);
        if (wait > 0) return send(res, 429, { error: 'One moment, another run just started. Try again in a second.' });
        ffLast = Date.now();
        result = runFastForward(params);
        ffCache.set(key, result);
        if (ffCache.size > 20) ffCache.delete(ffCache.keys().next().value!);
      }
      return send(res, 200, result);
    }

    const email = d.auth.verifySession(cookieOf(req));
    if (!email) return send(res, 401, { error: 'Please log in.' });

    if (req.method === 'GET' && url.pathname === '/me') {
      ensureAccount(email);
      return send(res, 200, { email, ready: d.store.getOrCreate(email).onChain });
    }

    if (req.method === 'POST' && url.pathname === '/trade/send') {
      const b = await readJson(req);
      const to = String(b.to ?? '');
      const item = String(b.item ?? '');
      const units = Number(b.units);
      if (!MERCHANTS.has(to)) return send(res, 400, { error: 'Unknown stall.' });
      if (!(item in BASE_PRICE)) return send(res, 400, { error: 'Unknown item.' });
      if (!Number.isInteger(units) || units < 1 || units > 1000) return send(res, 400, { error: 'Pick 1 to 1000 units.' });
      queue.push({ email, to, item, units });
      return send(res, 202, { queued: true }); // answered instantly; settles in the background
    }

    if (d.game && url.pathname.startsWith('/game/')) {
      const g = d.game;
      if (req.method === 'GET' && url.pathname === '/game/state') return send(res, 200, g.state(email));
      if (req.method === 'GET' && url.pathname === '/game/chain') return send(res, 200, d.chainProof?.(email) ?? null);
      if (req.method === 'POST') {
        const b = await readJson(req);
        const item = String(b.item ?? '') as never;
        const merchant = String(b.merchant ?? '');
        const units = Number(b.units ?? 1);
        const haggle = b.haggle === true;
        const routes: Record<string, () => ReturnType<typeof g.gather>> = {
          '/game/order': () => g.placeOrder(email, merchant, item, units, Number(b.minPrice)),
          '/game/order/cancel': () => g.cancelOrder(email, Number(b.id)),
          '/game/gather': () => g.gather(email, item),
          '/game/sell': () => g.sell(email, merchant, item, units, haggle),
          '/game/buy': () => g.buy(email, merchant, item, units, haggle),
          '/game/upgrade': () => g.upgrade(email, String(b.to ?? '')),
          '/game/goal': () => g.chooseGoal(email, String(b.kind ?? '')),
          '/game/shares/buy': () => g.buyShares(email, merchant, Number(b.shares)),
          '/game/shares/sell': () => g.sellShares(email, merchant, Number(b.shares)),
          '/game/fund': () => g.contribute(email, merchant, Number(b.amount)),
          '/game/stall/open': () => g.openStall(email, String(b.market ?? '')),
          '/game/stall/stock': () => g.stallStock(email, item, units),
          '/game/stall/take': () => g.stallTake(email, item, units),
          '/game/stall/price': () => g.stallPrice(email, item, Number(b.buy), Number(b.sell)),
          '/game/stall/deposit': () => g.stallCash(email, 'deposit', Number(b.amount)),
          '/game/stall/withdraw': () => g.stallCash(email, 'withdraw', Number(b.amount)),
          '/game/ack': () => g.ack(email),
        };
        const run = routes[url.pathname];
        if (run) {
          const result = run();
          return send(res, result.ok ? 200 : 400, { ...result, state: g.state(email) });
        }
      }
    }

    return send(res, 404, { error: 'Not found.' });
  }

  const listen = (port: number): Promise<Server> =>
    new Promise((resolve) => {
      const s = createServer((req, res) => void handler(req, res).catch(() => send(res, 500, { error: 'Something went wrong.' })));
      s.listen(port, () => resolve(s));
    });

  return { handler, flush, listen, queueLength: () => queue.length };
}
