/**
 * Game server HTTP API. Deliberately free of wallet vocabulary: no seed phrases, keys,
 * accounts, gas or signing appear in any request or response (CLAUDE.md hard rule).
 *
 * Gameplay never waits on the chain: /trade/send answers immediately and the transfer is
 * settled in the background by `flush()` (called on a timer by server/main.ts).
 */
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AccountStore } from './accounts';
import { Auth, looksLikeEmail, normaliseEmail } from './auth';
import { ChainPort } from './relayer';
import { Game } from './game';
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
}

interface Pending {
  email: string;
  to: string;
  item: string;
  units: number;
}

const MERCHANTS = new Set(createMerchants().map((m) => m.id));
const COOKIE = 'oja_session';

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
  /(?:^|;\s*)oja_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];

export function createApp(d: AppDeps) {
  const queue: Pending[] = [];
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
      if (!email) return send(res, 400, { error: 'That link has expired. Ask for a new one.' });
      ensureAccount(email);
      return send(res, 200, { ok: true }, {
        'set-cookie': `${COOKIE}=${d.auth.sessionToken(email)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
      });
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
      if (req.method === 'POST') {
        const b = await readJson(req);
        const units = Number(b.units ?? 1);
        const haggle = b.haggle === true;
        const item = String(b.item ?? '') as never;
        const merchant = String(b.merchant ?? '');
        const result =
          url.pathname === '/game/gather' ? g.gather(email, item)
          : url.pathname === '/game/sell' ? g.sell(email, merchant, item, units, haggle)
          : url.pathname === '/game/buy' ? g.buy(email, merchant, item, units, haggle)
          : url.pathname === '/game/upgrade' ? g.upgrade(email, String(b.to ?? ''))
          : null;
        if (result) return send(res, result.ok ? 200 : 400, { ...result, state: g.state(email) });
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
