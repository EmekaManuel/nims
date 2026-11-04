import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { AccountStore } from './accounts';
import { createApp } from './api';
import { Auth } from './auth';
import { randomHex } from './crypto';
import type { ChainPort } from './relayer';

const WALLET_WORDS = /seed|mnemonic|private|secret|wallet|gas|ed25519|yocto|\.testnet|signature/i;

let server: Server;
let base: string;
let links: string[];
let transfers: { from: string; to: string; item: string; units: number }[];
let created: string[];
let app: ReturnType<typeof createApp>;
let slowChain = false;

beforeEach(async () => {
  links = [];
  transfers = [];
  created = [];
  slowChain = false;
  const chain: ChainPort = {
    async createPlayerAccount(id) {
      created.push(id);
    },
    async transferItem(from, to, item, units) {
      if (slowChain) throw new Error('chain is down');
      transfers.push({ from: from.accountId, to, item, units });
    },
    async itemBalance() {
      return 0;
    },
  };
  const dir = mkdtempSync(join(tmpdir(), 'oja-api-'));
  const master = randomHex(32);
  app = createApp({
    auth: new Auth(randomHex(32)),
    store: new AccountStore(join(dir, 'a.json'), 'oja.testnet', master),
    chain,
    mailer: { sendLoginLink: async (_e, link) => void links.push(link) },
    baseUrl: 'http://localhost:0',
    merchantParent: 'run.oja.testnet',
  });
  server = await app.listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
afterEach(() => void server.close());

const post = (path: string, body: unknown, cookie = '') =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });

/** Log in by email and return the session cookie. */
async function login(email = 'ada@example.com') {
  await post('/auth/request', { email });
  const token = new URL(links[links.length - 1]).searchParams.get('token');
  const r = await fetch(`${base}/auth/verify?token=${token}`);
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}

describe('api', () => {
  it('logs in by email link, then /me works', async () => {
    const cookie = await login();
    const me = await (await fetch(base + '/me', { headers: { cookie } })).json();
    expect(me.email).toBe('ada@example.com');
    expect((await fetch(base + '/me')).status).toBe(401);
  });

  it('rejects bad emails, reused links and tampered cookies', async () => {
    expect((await post('/auth/request', { email: 'nope' })).status).toBe(400);
    await post('/auth/request', { email: 'a@b.co' });
    const token = new URL(links[0]).searchParams.get('token');
    expect((await fetch(`${base}/auth/verify?token=${token}`)).status).toBe(200);
    expect((await fetch(`${base}/auth/verify?token=${token}`)).status).toBe(400);
    expect((await fetch(base + '/me', { headers: { cookie: 'oja_session=forged.value' } })).status).toBe(401);
  });

  it('creates the account in the background on first login', async () => {
    await login();
    await new Promise((r) => setTimeout(r, 20));
    expect(created).toHaveLength(1);
  });

  it('answers a trade instantly and settles it later', async () => {
    const cookie = await login();
    await new Promise((r) => setTimeout(r, 20));
    const r = await post('/trade/send', { to: 'bisi', item: 'iron', units: 5 }, cookie);
    expect(r.status).toBe(202);
    expect(transfers).toHaveLength(0); // the chain has not been touched yet
    expect(await app.flush()).toBe(1);
    expect(transfers[0]).toMatchObject({ to: 'bisi.run.oja.testnet', item: 'iron', units: 5 });
  });

  it('keeps trades queued, not lost, while the chain is down', async () => {
    const cookie = await login();
    await new Promise((r) => setTimeout(r, 20));
    slowChain = true;
    await post('/trade/send', { to: 'bisi', item: 'iron', units: 2 }, cookie);
    expect(await app.flush()).toBe(0);
    expect(app.queueLength()).toBe(1);
    slowChain = false;
    expect(await app.flush()).toBe(1);
    expect(app.queueLength()).toBe(0);
  });

  it('validates trades', async () => {
    const cookie = await login();
    for (const bad of [{ to: 'nobody', item: 'iron', units: 1 }, { to: 'bisi', item: 'gold', units: 1 }, { to: 'bisi', item: 'iron', units: 0 }, { to: 'bisi', item: 'iron', units: 1.5 }]) {
      expect((await post('/trade/send', bad, cookie)).status).toBe(400);
    }
  });

  it('never shows the player any wallet vocabulary', async () => {
    const cookie = await login();
    await new Promise((r) => setTimeout(r, 20));
    const bodies = [
      await (await post('/auth/request', { email: 'ada@example.com' })).text(),
      await (await fetch(base + '/me', { headers: { cookie } })).text(),
      await (await post('/trade/send', { to: 'bisi', item: 'iron', units: 1 }, cookie)).text(),
      await (await post('/trade/send', { to: 'x', item: 'iron', units: 1 }, cookie)).text(),
      await (await fetch(base + '/nope', { headers: { cookie } })).text(),
    ];
    for (const b of bodies) expect(b).not.toMatch(WALLET_WORDS);
  });
});

describe('game routes', () => {
  it('serves state and applies actions for a logged-in player, and rejects strangers', async () => {
    const { Game } = await import('./game');
    server.close();
    const dir = mkdtempSync(join(tmpdir(), 'oja-api2-'));
    const master = randomHex(32);
    const a2 = createApp({
      auth: new Auth(randomHex(32)),
      store: new AccountStore(join(dir, 'a.json'), 'oja.testnet', master),
      chain: { createPlayerAccount: async () => {}, transferItem: async () => {}, itemBalance: async () => 0 },
      mailer: { sendLoginLink: async (_e, link) => void links.push(link) },
      baseUrl: 'http://localhost:0',
      merchantParent: 'run.oja.testnet',
      game: new Game(3),
      devLinks: true,
    });
    server = await a2.listen(0);
    base = `http://localhost:${(server.address() as { port: number }).port}`;

    expect((await fetch(base + '/game/state')).status).toBe(401);
    const r = await (await post('/auth/request', { email: 'ada@example.com' })).json();
    expect(r.devLink).toContain('/auth/verify?token=');
    const login = await fetch(r.devLink.replace('http://localhost:0', base));
    const cookie = login.headers.get('set-cookie')!.split(';')[0];

    const state = await (await fetch(base + '/game/state', { headers: { cookie } })).json();
    expect(state.stalls).toHaveLength(8);
    const got = await (await post('/game/gather', { item: 'iron' }, cookie)).json();
    expect(got.ok).toBe(true);
    expect(got.state.you.carrying).toBeGreaterThan(0);
    const bad = await post('/game/sell', { merchant: 'bisi', item: 'iron', units: 1 }, cookie);
    expect(bad.status).toBe(400);
    expect(JSON.stringify([state, got])).not.toMatch(WALLET_WORDS);
  });
});


describe('ownership routes', () => {
  it('buys shares, opens a stall and dismisses the away summary over HTTP', async () => {
    const { Game } = await import('./game');
    server.close();
    const dir = mkdtempSync(join(tmpdir(), 'oja-api3-'));
    const game = new Game(3);
    const a3 = createApp({
      auth: new Auth(randomHex(32)),
      store: new AccountStore(join(dir, 'a.json'), 'oja.testnet', randomHex(32)),
      chain: { createPlayerAccount: async () => {}, transferItem: async () => {}, itemBalance: async () => 0 },
      mailer: { sendLoginLink: async (_e, link) => void links.push(link) },
      baseUrl: 'http://localhost:0',
      merchantParent: 'run.oja.testnet',
      game,
      devLinks: true,
    });
    server = await a3.listen(0);
    base = `http://localhost:${(server.address() as { port: number }).port}`;
    const r = await (await post('/auth/request', { email: 'ada@example.com' })).json();
    const cookie = (await fetch(r.devLink.replace('http://localhost:0', base))).headers.get('set-cookie')!.split(';')[0];
    game.playerFor('ada@example.com').cash = 20_000;

    const bought = await (await post('/game/shares/buy', { merchant: 'wale', shares: 5 }, cookie)).json();
    expect(bought.ok).toBe(true);
    expect(bought.state.business.shares[0].shares).toBe(5);
    expect((await post('/game/shares/buy', { merchant: 'wale', shares: 999 }, cookie)).status).toBe(400);

    const opened = await (await post('/game/stall/open', { market: 'fabric' }, cookie)).json();
    expect(opened.state.business.stall.market).toBe('fabric');
    const priced = await post('/game/stall/price', { item: 'thread', buy: 90, sell: 130 }, cookie);
    expect(priced.status).toBe(200);
    expect((await post('/game/stall/price', { item: 'thread', buy: 1, sell: 130 }, cookie)).status).toBe(400);

    expect((await post('/game/ajo', { merchant: 'wale', amount: 500 }, cookie)).status).toBe(400); // wale is open
    expect((await post('/game/ack', {}, cookie)).status).toBe(200);
    expect((await post('/game/nope', {}, cookie)).status).toBe(404);
    expect(JSON.stringify(opened)).not.toMatch(WALLET_WORDS);
  });
});


describe('fast-forward route', () => {
  it('needs no login, clamps hostile input, and caches identical runs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oja-api4-'));
    server.close();
    const a4 = createApp({
      auth: new Auth(randomHex(32)),
      store: new AccountStore(join(dir, 'a.json'), 'oja.testnet', randomHex(32)),
      chain: { createPlayerAccount: async () => {}, transferItem: async () => {}, itemBalance: async () => 0 },
      mailer: { sendLoginLink: async () => {} },
      baseUrl: 'http://localhost:0',
      merchantParent: 'run.oja.testnet',
      fastForwardGapMs: 0,
    });
    server = await a4.listen(0);
    base = `http://localhost:${(server.address() as { port: number }).port}`;

    const r = await post('/sim/fastforward', { days: 3, seed: 2 }); // no cookie
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.hours).toBe(72);
    expect(Object.keys(body.prices)).toHaveLength(8);

    const wild = await (await post('/sim/fastforward', { days: 100000, seed: 'x', gatherers: -4 })).json();
    expect(wild.params.days).toBe(14);
    expect(wild.params.gatherers).toBe(0);

    const again = await (await post('/sim/fastforward', { days: 3, seed: 2 })).json();
    expect(again).toEqual(body);
    // 'seed' here is the simulation's random seed, not a wallet phrase, so it is allowed on this route
    expect(JSON.stringify(body)).not.toMatch(/mnemonic|private key|wallet|\bgas\b|yocto|\.testnet|signature/i);
  });

  it('spaces out new runs instead of letting anyone hammer the server', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oja-api5-'));
    server.close();
    const a5 = createApp({
      auth: new Auth(randomHex(32)),
      store: new AccountStore(join(dir, 'a.json'), 'oja.testnet', randomHex(32)),
      chain: { createPlayerAccount: async () => {}, transferItem: async () => {}, itemBalance: async () => 0 },
      mailer: { sendLoginLink: async () => {} },
      baseUrl: 'http://localhost:0',
      merchantParent: 'run.oja.testnet',
      fastForwardGapMs: 60_000,
    });
    server = await a5.listen(0);
    base = `http://localhost:${(server.address() as { port: number }).port}`;
    expect((await post('/sim/fastforward', { days: 2, seed: 1 })).status).toBe(200);
    expect((await post('/sim/fastforward', { days: 2, seed: 2 })).status).toBe(429); // a different run, too soon
    expect((await post('/sim/fastforward', { days: 2, seed: 1 })).status).toBe(200); // a cached one is free
  });
});
