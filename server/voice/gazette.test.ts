import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../accounts/accounts';
import { createApp } from '../http/api';
import { Auth } from '../http/auth';
import { randomHex } from '../accounts/crypto';
import { Game } from '../game/game';
import { accept, createGazette, prompt, type GazetteFacts } from './gazette';
import { createChat, type Chat } from './llm';

const facts: GazetteFacts = {
  events: [
    { hour: 153, text: 'Shock: festive season for 24h.' },
    { hour: 143, text: "Lena's Textiles paid 124 coins in dividends to its shareholders." },
    { hour: 124, text: "Mira's Greens reopened thanks to a community fund." },
  ],
};
const GOOD = "Festive season lifts the town for 24h\nLena's Textiles pays 124 coins to shareholders\nMira's Greens reopens thanks to a community fund";

const chatSaying = (reply: string | null) => {
  const seen = { calls: 0, user: [] as string[] };
  const chat: Chat = { async complete(_s, u) { seen.calls++; seen.user.push(u); return reply; } };
  return { chat, seen };
};

describe('gazette accept (the guardrail)', () => {
  it('keeps headlines whose numbers all come from the events, and cleans bullets and quotes', () => {
    expect(accept(GOOD, facts)).toHaveLength(3);
    expect(accept('- "Festive season lifts the town for 24h"\n2. Lena\'s Textiles pays 124 coins out', facts)).toEqual(['Festive season lifts the town for 24h', "Lena's Textiles pays 124 coins out"]);
  });
  it('drops a headline with a changed or invented number, and keeps the good ones', () => {
    const out = accept("Lena's Textiles pays 999 coins to shareholders\nFestive season lifts the town for 24h", facts);
    expect(out).toEqual(['Festive season lifts the town for 24h']);
  });
  it('drops lines that mention wallets, the chain, tokens or AI, and too-short or rambling ones', () => {
    expect(accept('Shareholders get 124 coins on the blockchain today\nAI says the town is booming nicely\nShort\n' + 'word '.repeat(40), facts)).toBeNull();
  });
  it('returns null when nothing passes, and keeps at most three', () => {
    expect(accept('', facts)).toBeNull();
    expect(accept('Festive season lifts the whole town\nThe town celebrates the festive season\nA festive season for everyone\nAnother festive season headline', facts)).toHaveLength(3);
  });
});

describe('gazette prompt', () => {
  it('lists only world events with their day and hour', () => {
    const p = prompt(facts);
    expect(p.user).toContain('Day 7, 09:00: Shock: festive season for 24h.');
    expect(p.system).toContain('Never invent events');
  });
});

describe('createGazette', () => {
  it('returns headlines, caches them, and shares one call between simultaneous requests', async () => {
    const { chat, seen } = chatSaying(GOOD);
    const g = createGazette({ chat });
    const r = await Promise.all([g.headlines(facts), g.headlines(facts)]);
    expect(r[0]).toHaveLength(3);
    expect(await g.headlines(facts)).toHaveLength(3);
    expect(seen.calls).toBe(1);
  });
  it('asks again when the events change', async () => {
    const { chat, seen } = chatSaying(GOOD);
    const g = createGazette({ chat });
    await g.headlines(facts);
    await g.headlines({ events: [{ hour: 160, text: 'Shock: fuel queue for 12h.' }, ...facts.events] });
    expect(seen.calls).toBe(2);
  });
  it('returns null with no events, on a failed call, and does not hammer a failing call', async () => {
    const { chat, seen } = chatSaying(null);
    const g = createGazette({ chat });
    expect(await g.headlines({ events: [] })).toBeNull();
    expect(seen.calls).toBe(0);
    expect(await g.headlines(facts)).toBeNull();
    expect(await g.headlines(facts)).toBeNull();
    expect(seen.calls).toBe(1);
  });
  it('shares the credit budget with other features through one chat connection', async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: GOOD } }] }), { status: 200 }); }) as unknown as typeof fetch;
    const chat = createChat({ apiKey: 'k', fetchImpl, maxPerMinute: 1 });
    const g = createGazette({ chat });
    expect(await g.headlines(facts)).not.toBeNull();
    expect(await g.headlines({ events: [{ hour: 1, text: 'Shock: rain for 6h.' }] })).toBeNull(); // budget spent
    expect(calls).toBe(1);
  });
});

describe('Game.gazetteFacts and /game/gazette', () => {
  it('uses only world events, newest first', () => {
    const g = new Game(3);
    for (let i = 0; i < 120; i++) g.tickOnce();
    const f = g.gazetteFacts();
    expect(f.events.length).toBeGreaterThan(0);
    expect(f.events.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < f.events.length; i++) expect(f.events[i - 1].hour).toBeGreaterThanOrEqual(f.events[i].hour);
  });

  it('needs a login, returns headlines, and returns null when the gazette is off', async () => {
    const setup = async (gazette?: Parameters<typeof createApp>[0]['gazette']) => {
      const links: string[] = [];
      const dir = mkdtempSync(join(tmpdir(), 'nims-gaz-'));
      const game = new Game(3);
      for (let i = 0; i < 60; i++) game.tickOnce();
      const app = createApp({
        auth: new Auth(randomHex(32)),
        store: new AccountStore(join(dir, 'a.json'), 'oja.testnet', randomHex(32)),
        chain: { createPlayerAccount: async () => {}, transferItem: async () => {}, itemBalance: async () => 0 },
        mailer: { sendLoginLink: async (_e, l) => void links.push(l) },
        baseUrl: 'http://localhost:0',
        merchantParent: 'run.oja.testnet',
        game,
        devLinks: true,
        gazette,
      });
      const server = await app.listen(0);
      const base = `http://localhost:${(server.address() as { port: number }).port}`;
      const r = await (await fetch(base + '/auth/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })).json();
      const cookie = (await fetch(r.devLink.replace('http://localhost:0', base))).headers.get('set-cookie')!.split(';')[0];
      return { server, base, cookie };
    };
    const on = await setup({ headlines: async () => ['The town is quiet today'] });
    expect((await fetch(on.base + '/game/gazette')).status).toBe(401);
    expect(await (await fetch(on.base + '/game/gazette', { headers: { cookie: on.cookie } })).json()).toEqual({ headlines: ['The town is quiet today'] });
    on.server.close();
    const off = await setup();
    expect(await (await fetch(off.base + '/game/gazette', { headers: { cookie: off.cookie } })).json()).toEqual({ headlines: null });
    off.server.close();
  });
});
