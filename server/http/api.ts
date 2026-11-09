/**
 * Game server HTTP API. Deliberately free of wallet vocabulary: no seed phrases, keys,
 * accounts, gas or signing appear in any request or response (a hard rule of the project).
 *
 * Gameplay never waits on the chain: /trade/send answers immediately and the transfer is
 * settled in the background by `flush()` (called on a timer by server/main.ts).
 */
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { AccountStore } from '../accounts/accounts';
import { Auth, guestIdentity, looksLikeEmail, normaliseEmail } from './auth';
import type { Google } from './google';
import { ChainPort } from '../chain/relayer';
import { Game } from '../game/game';
import type { Voice } from '../voice/voice';
import type { Speaker } from '../voice/speaker';
import type { Gazette } from '../voice/gazette';
import type { Haggler } from '../voice/haggle';
import { runFastForward, sanitize, FastForwardResult } from '../../sim/fastforward';
import { BASE_PRICE, createMerchants } from '../../sim/world';

export interface AppDeps {
  auth: Auth;
  store: AccountStore;
  chain: ChainPort;
  /** Public origin, e.g. http://localhost:3000 (Google's return address is built from it). */
  baseUrl: string;
  /** Parent account for merchant NEAR accounts (see server/chain/settle.ts accountFor). */
  merchantParent: string;
  /** The live game. Optional so the account/relayer API can be tested alone. */
  game?: Game;
  /** Opt-in proof for the curious: where the game's goods and coins live on the testnet. Nothing in the game needs it. */
  chainStatus?: () => unknown;
  /** The signed-in player's own proof link, if the live settler is on. */
  chainProof?: (email: string) => unknown;
  /** Optional: writes each merchant's price reasoning in their own words. Without it the plain templated line is used. */
  voice?: Voice;
  /** Optional: turns those lines into natural speech (ElevenLabs). Without it the browser's own speech is used. */
  speaker?: Speaker;
  /** Optional: headlines for the town's recent events. Without it the News tab shows only the plain list. */
  gazette?: Gazette;
  /** Optional: the merchant's reaction after the player wins a haggle. Without it the plain result stands. */
  haggler?: Haggler;
  /** Optional: "Continue with Google". Without it the sign-in screen offers only "Play as a guest". */
  google?: Google;
  /** Folder of the built web app (web/dist). When set, this server also serves the game's pages, so one process hosts everything. */
  staticDir?: string;
  /** Guest sign-ins allowed from one address per hour. Default 20; tests may raise it. */
  guestsPerHour?: number;
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
export const SESSION_COOKIE = 'nims_session';
const COOKIE = SESSION_COOKIE;
const OAUTH_COOKIE = 'nims_oauth';

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

const cookieOf = (req: IncomingMessage, name = COOKIE) =>
  new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.cookie ?? '')?.[1];

export function createApp(d: AppDeps) {
  const queue: Pending[] = [];
  // Fast-forward runs are cheap but not free: remember recent ones and space out new ones.
  const ffCache = new Map<string, FastForwardResult>();
  let ffLast = 0;
  const creating = new Set<string>();
  /** address -> times of recent guest sign-ins (POST /auth/guest). */
  const guests = new Map<string, number[]>();

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

    // Which sign-in options this server offers, so the login screen shows only what works.
    if (req.method === 'GET' && url.pathname === '/auth/providers') return send(res, 200, { google: !!d.google, guest: true });

    const secure = d.baseUrl.startsWith('https:') ? '; Secure' : '';
    const sessionCookie = (email: string) => `${COOKIE}=${d.auth.sessionToken(email)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`;

    if (req.method === 'GET' && url.pathname === '/auth/google' && d.google) {
      const { state, nonce } = d.auth.oauthState();
      res.writeHead(302, { location: d.google.authUrl(state), 'set-cookie': `${OAUTH_COOKIE}=${nonce}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600${secure}` });
      return void res.end();
    }

    if (req.method === 'GET' && url.pathname === '/auth/google/callback' && d.google) {
      const clear = `${OAUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0${secure}`;
      const fail = () => { res.writeHead(302, { location: '/?login=failed', 'set-cookie': clear }); return void res.end(); };
      const code = url.searchParams.get('code');
      if (!code || !d.auth.verifyOauthState(url.searchParams.get('state'), cookieOf(req, OAUTH_COOKIE))) return fail();
      const email = await d.google.emailFor(code);
      if (!email || !looksLikeEmail(email)) return fail();
      ensureAccount(normaliseEmail(email));
      res.writeHead(302, { location: '/', 'set-cookie': [sessionCookie(normaliseEmail(email)), clear] });
      return void res.end();
    }

    // Play as a guest: a new private identity and a session cookie, so trying the game takes one press. A few per address
    // per hour, so nobody can fill the town with empty players.
    if (req.method === 'POST' && url.pathname === '/auth/guest') {
      const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
      const now = Date.now();
      const recent = (guests.get(ip) ?? []).filter((t) => now - t < 3_600_000);
      if (recent.length >= (d.guestsPerHour ?? 20)) return send(res, 429, { error: 'Too many new guests from here. Try again later, or continue with Google.' });
      guests.set(ip, [...recent, now]);
      const id = guestIdentity();
      ensureAccount(id);
      return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(id) });
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

    // Public and read-only: how busy the town is. Counts only, never a name or an email.
    if (req.method === 'GET' && url.pathname === '/stats') {
      if (!d.game) return send(res, 200, { enabled: false });
      const c = (d.chainStatus?.() ?? null) as { epoch?: number; behind?: number; lastSettledAt?: string | null; contract?: string } | null;
      return send(res, 200, { ...d.game.publicStats(), chain: c ? { contract: c.contract, epoch: c.epoch, behind: c.behind, lastSettledAt: c.lastSettledAt } : null });
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
      // Lazy and optional: the page asks only when a price is hovered. `text: null` means "keep the plain line";
      // `audio` is a link to natural speech for what should be said, or null (the browser's own speech is used).
      if (req.method === 'GET' && url.pathname === '/game/voice') {
        const facts = d.voice || d.speaker ? g.voiceFacts(email, url.searchParams.get('merchant') ?? '', url.searchParams.get('item') ?? '') : null;
        if (!facts) return send(res, 200, { text: null, audio: null });
        const text = d.voice ? await d.voice.say(facts) : null;
        const id = d.speaker?.register(facts, text ?? facts.tooltip);
        return send(res, 200, { text, audio: id ? `/game/voice/audio?id=${id}` : null });
      }
      // The merchant's reaction to the player's last won haggle. Written from facts the server stored, never from the request.
      if (req.method === 'GET' && url.pathname === '/game/haggle') {
        const facts = d.haggler ? g.haggleFacts(email) : null;
        const text = facts && d.haggler ? await d.haggler.reply(facts) : null;
        const id = text && facts ? d.speaker?.register({ id: facts.id, personality: facts.personality }, text) : null;
        return send(res, 200, { text, audio: id ? `/game/voice/audio?id=${id}` : null });
      }
      if (req.method === 'GET' && url.pathname === '/game/gazette') {
        return send(res, 200, { headlines: d.gazette ? await d.gazette.headlines(g.gazetteFacts()) : null });
      }
      if (req.method === 'GET' && url.pathname === '/game/voice/audio') {
        const mp3 = d.speaker ? await d.speaker.audio(url.searchParams.get('id') ?? '') : null;
        if (!mp3) return send(res, 404, { error: 'No audio.' });
        res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': mp3.length, 'cache-control': 'private, max-age=600' });
        return void res.end(mp3);
      }
      if (req.method === 'POST') {
        const b = await readJson(req);
        const item = String(b.item ?? '') as never;
        const merchant = String(b.merchant ?? '');
        const units = Number(b.units ?? 1);
        const haggle = b.haggle === true;
        const shopId = typeof b.shop === 'string' && b.shop ? b.shop : undefined; // one of your businesses; your town stall when absent
        const routes: Record<string, () => ReturnType<typeof g.gather>> = {
          '/game/order': () => g.placeOrder(email, merchant, item, units, Number(b.minPrice)),
          '/game/order/cancel': () => g.cancelOrder(email, Number(b.id)),
          '/game/gather': () => g.gather(email, item),
          '/game/sell': () => g.sell(email, merchant, item, units, haggle),
          '/game/buy': () => g.buy(email, merchant, item, units, haggle),
          '/game/upgrade': () => g.upgrade(email, String(b.to ?? '')),
          '/game/goal': () => g.chooseGoal(email, String(b.kind ?? '')),
          '/game/name': () => g.setName(email, String(b.name ?? '')),
          '/game/quest/claim': () => g.claimQuest(email, String(b.id ?? '')),
          '/game/daily': () => g.claimDailyReward(email),
          '/game/invite': () => g.redeemInvite(email, String(b.code ?? '')),
          '/game/avatar': () => g.setAvatar(email, b.avatar),
          '/game/travel': () => g.travel(email, String(b.realm ?? '')),
          '/game/shares/buy': () => g.buyShares(email, merchant, Number(b.shares)),
          '/game/shares/sell': () => g.sellShares(email, merchant, Number(b.shares)),
          '/game/council/propose': () => g.councilPropose(email, String(b.market ?? ''), String(b.lever ?? ''), String(b.to ?? '')),
          '/game/council/vote': () => g.councilVote(email, String(b.market ?? ''), b.yes === true),
          '/game/fund': () => g.contribute(email, merchant, Number(b.amount)),
          '/game/stall/open': () => g.openStall(email, String(b.market ?? '')),
          '/game/stall/stock': () => g.stallStock(email, item, units, shopId),
          '/game/stall/take': () => g.stallTake(email, item, units, shopId),
          '/game/stall/price': () => g.stallPrice(email, item, Number(b.buy), Number(b.sell), shopId),
          '/game/stall/deposit': () => g.stallCash(email, 'deposit', Number(b.amount), shopId),
          '/game/stall/withdraw': () => g.stallCash(email, 'withdraw', Number(b.amount), shopId),
          '/game/land/buy': () => g.buyLand(email, String(b.plot ?? '')),
          '/game/land/list': () => g.listLand(email, String(b.plot ?? ''), Number(b.price ?? 0)),
          '/game/land/build': () => g.build(email, String(b.plot ?? ''), b.name === undefined ? undefined : String(b.name)),
          '/game/scavenge': () => g.scavenge(email),
          '/game/job/take': () => g.takeJob(email, Number(b.id)),
          '/game/job/deliver': () => g.deliverJob(email),
          '/game/job/drop': () => g.dropJob(email),
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
