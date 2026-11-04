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
