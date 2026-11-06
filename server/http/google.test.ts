import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { AccountStore } from '../accounts/accounts';
import { randomHex } from '../accounts/crypto';
import { createApp } from './api';
import { Auth } from './auth';
import { createGoogle } from './google';
import type { ChainPort } from '../chain/relayer';

const OPTS = { clientId: 'cid', clientSecret: 'csecret', redirectUri: 'https://nims.example/auth/google/callback' };

/** A stand-in for Google's two endpoints. */
function fakeGoogle(userinfo: { email?: string; email_verified?: boolean } | null, tokenOk = true) {
  const seen: { url: string; body?: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    seen.push({ url, body: init?.body?.toString() });
    if (url.includes('oauth2.googleapis.com/token')) return tokenOk ? Response.json({ access_token: 'at' }) : new Response('no', { status: 400 });
    return userinfo ? Response.json(userinfo) : new Response('no', { status: 401 });
  }) as unknown as typeof fetch;
  return { f, seen };
}

describe('createGoogle', () => {
  it('builds the sign-in address with the client, redirect, state and only the email scope', () => {
    const u = new URL(createGoogle(OPTS).authUrl('st'));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('client_id')).toBe('cid');
    expect(u.searchParams.get('redirect_uri')).toBe(OPTS.redirectUri);
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('scope')).toBe('openid email');
  });

  it('returns the email only when Google says it is verified', async () => {
    expect(await createGoogle({ ...OPTS, fetchImpl: fakeGoogle({ email: 'a@b.co', email_verified: true }).f }).emailFor('c')).toBe('a@b.co');
    expect(await createGoogle({ ...OPTS, fetchImpl: fakeGoogle({ email: 'a@b.co', email_verified: false }).f }).emailFor('c')).toBeNull();
    expect(await createGoogle({ ...OPTS, fetchImpl: fakeGoogle({ email: 'a@b.co' }).f }).emailFor('c')).toBeNull();
    expect(await createGoogle({ ...OPTS, fetchImpl: fakeGoogle({ email_verified: true }).f }).emailFor('c')).toBeNull();
  });

  it('returns null when Google rejects the code or the lookup, and never throws', async () => {
    expect(await createGoogle({ ...OPTS, fetchImpl: fakeGoogle(null, false).f }).emailFor('c')).toBeNull();
    expect(await createGoogle({ ...OPTS, fetchImpl: fakeGoogle(null).f }).emailFor('c')).toBeNull();
    expect(await createGoogle({ ...OPTS, fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch }).emailFor('c')).toBeNull();
  });

  it('sends the code, client secret and redirect to Google, server to server', async () => {
    const g = fakeGoogle({ email: 'a@b.co', email_verified: true });
    await createGoogle({ ...OPTS, fetchImpl: g.f }).emailFor('the-code');
    const body = new URLSearchParams(g.seen[0].body);
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_secret')).toBe('csecret');
    expect(body.get('grant_type')).toBe('authorization_code');
  });
});

describe('Continue with Google, through the server', () => {
  let server: Server;
  afterEach(() => void server?.close());

  async function start(userinfo: Parameters<typeof fakeGoogle>[0], withGoogle = true) {
    const chain: ChainPort = { async createPlayerAccount() {}, async transferItem() {}, async itemBalance() { return 0; } };
    const dir = mkdtempSync(join(tmpdir(), 'nims-google-'));
    const app = createApp({
      auth: new Auth(randomHex(32)),
      store: new AccountStore(join(dir, 'a.json'), 'oja.testnet', randomHex(32)),
      chain,
      mailer: { sendLoginLink: async () => {} },
      baseUrl: 'http://localhost:0',
      merchantParent: 'run.oja.testnet',
      google: withGoogle ? createGoogle({ ...OPTS, fetchImpl: fakeGoogle(userinfo).f }) : undefined,
    });
    server = await app.listen(0);
    return `http://localhost:${(server.address() as { port: number }).port}`;
  }
  const manual = { redirect: 'manual' as const };

  /** Start the sign-in, return what the browser would hold: the state in the address and the nonce cookie. */
  async function begin(base: string) {
    const r = await fetch(`${base}/auth/google`, manual);
    expect(r.status).toBe(302);
    const state = new URL(r.headers.get('location')!).searchParams.get('state')!;
    const cookie = r.headers.get('set-cookie')!.split(';')[0];
    return { state, cookie };
  }

  it('signs a player in with a verified Google email and sends them to the game', async () => {
    const base = await start({ email: 'Ada@Example.com', email_verified: true });
    const { state, cookie } = await begin(base);
    const r = await fetch(`${base}/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`, { ...manual, headers: { cookie } });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/');
    const cookies = r.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith('nims_session='))!.split(';')[0];
    const me = await fetch(`${base}/me`, { headers: { cookie: session } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email: 'ada@example.com' });
  });

  it('refuses a callback whose state is forged, missing, or from a different browser', async () => {
    const base = await start({ email: 'a@b.co', email_verified: true });
    const { state, cookie } = await begin(base);
    for (const [s, c] of [['forged', cookie], [state, ''], [state, 'nims_oauth=someone-elses'], ['', cookie]] as const) {
      const r = await fetch(`${base}/auth/google/callback?code=abc&state=${encodeURIComponent(s)}`, { ...manual, headers: { cookie: c } });
      expect(r.headers.get('location')).toBe('/?login=failed');
      expect(r.headers.getSetCookie().some((x) => x.startsWith('nims_session='))).toBe(false);
    }
  });

  it('does not sign in an unverified Google email, or a callback with no code', async () => {
    const base = await start({ email: 'a@b.co', email_verified: false });
    const { state, cookie } = await begin(base);
    const r = await fetch(`${base}/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`, { ...manual, headers: { cookie } });
    expect(r.headers.get('location')).toBe('/?login=failed');
    const none = await fetch(`${base}/auth/google/callback?state=${encodeURIComponent(state)}`, { ...manual, headers: { cookie } });
    expect(none.headers.get('location')).toBe('/?login=failed');
  });

  it('reports which sign-in options exist, and has no Google routes when it is not set up', async () => {
    const on = await start({ email: 'a@b.co', email_verified: true });
    expect(await (await fetch(`${on}/auth/providers`)).json()).toEqual({ google: true });
    server.close();
    const off = await start(null, false);
    expect(await (await fetch(`${off}/auth/providers`)).json()).toEqual({ google: false });
    expect((await fetch(`${off}/auth/google`, manual)).status).not.toBe(302);
  });
});
