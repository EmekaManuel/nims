import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from './accounts';
import { createApp } from './api';
import { Auth } from './auth';
import { randomHex } from './crypto';
import { Game } from './game';
import { accept, createVoice, prompt, type VoiceFacts } from './voice';

const facts: VoiceFacts = {
  merchant: "Mira's Greens",
  personality: 'cautious',
  item: 'iron',
  pays: 180,
  charges: 240,
  reasons: ["I'm holding 140 iron and I only want 50, so I'll pay less.", 'People sold me 4 iron recently, so I am well supplied.'],
  tooltip: "I'm holding 140 iron and I only want 50, so I'll pay less. I'll pay 180 coins and sell at 240 coins.",
};
const GOOD = "I've got 140 iron and only want 50, so I'll pay 180 coins and sell at 240.";

/** A fake NEAR AI Cloud that answers with `content`, counting calls. */
function fakeAI(content: string | (() => string), status = 200) {
  const seen = { calls: 0, bodies: [] as any[], auth: [] as string[] };
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    seen.calls++;
    seen.bodies.push(JSON.parse(String(init.body)));
    seen.auth.push(String((init.headers as Record<string, string>).authorization));
    return new Response(JSON.stringify({ choices: [{ message: { content: typeof content === 'function' ? content() : content } }] }), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

describe('accept (the guardrail)', () => {
  it('passes a reply whose numbers all come from the facts', () => {
    expect(accept(GOOD, facts)).toBe(GOOD);
  });
  it('rejects a reply that changes or invents a number', () => {
    expect(accept("I'll pay 190 coins for iron today, friend.", facts)).toBeNull();
    expect(accept("I'm holding 141 iron and I'll pay 180 coins.", facts)).toBeNull();
  });
  it('rejects anything that mentions wallets, the chain, tokens or AI', () => {
    for (const bad of ['Pay me 180 coins, no wallet needed, friend.', 'Your tokens are safe with me at 180 coins.', 'As an AI I would say 180 coins is fair.', 'It costs 180 coins on the blockchain.', 'Gas is cheap, so 180 coins it is.']) {
      expect(accept(bad, facts)).toBeNull();
    }
  });
  it('rejects empty, too-short or rambling replies, and cleans quotes, spaces and think-tags', () => {
    expect(accept('', facts)).toBeNull();
    expect(accept('Hmm.', facts)).toBeNull();
    expect(accept('x '.repeat(200), facts)).toBeNull();
    expect(accept(`<think>work it out: 3+3</think>\n"${GOOD}"\n`, facts)).toBe(GOOD);
  });
  it('allows ordinary words like "near" (only the chain is off limits)', () => {
    expect(accept("I'm near my target, so I'll pay 180 coins for iron.", facts)).not.toBeNull();
  });
});

describe('prompt', () => {
  it('carries only server-built facts and the merchant personality', () => {
    const p = prompt(facts);
    expect(p.system).toContain("Mira's Greens");
    expect(p.system).toContain('careful with money');
    expect(p.user).toContain('I pay the customer: 180 coins');
    expect(p.user).toContain("I'm holding 140 iron");
  });
});

describe('createVoice', () => {
  it('returns the model text, sends the key and model, and caches the answer', async () => {
    const ai = fakeAI(GOOD);
    const v = createVoice({ apiKey: 'sk-test', model: 'm-1', fetchImpl: ai.fetchImpl });
    expect(await v.say(facts)).toBe(GOOD);
    expect(await v.say(facts)).toBe(GOOD);
    expect(ai.seen.calls).toBe(1);
    expect(ai.seen.auth[0]).toBe('Bearer sk-test');
    expect(ai.seen.bodies[0].model).toBe('m-1');
    expect(ai.seen.bodies[0].stream).toBe(false);
  });
  it('a changed price is a new question', async () => {
    const ai = fakeAI(GOOD);
    const v = createVoice({ apiKey: 'k', fetchImpl: ai.fetchImpl });
    await v.say(facts);
    await v.say({ ...facts, pays: 181 });
    expect(ai.seen.calls).toBe(2);
  });
  it('shares one call between simultaneous hovers', async () => {
    const ai = fakeAI(GOOD);
    const v = createVoice({ apiKey: 'k', fetchImpl: ai.fetchImpl });
    const r = await Promise.all([v.say(facts), v.say(facts), v.say(facts)]);
    expect(r).toEqual([GOOD, GOOD, GOOD]);
    expect(ai.seen.calls).toBe(1);
  });
  it('falls back to null on an HTTP error, a thrown error and a bad reply, and does not hammer a failing call', async () => {
    const down = fakeAI('x', 500);
    const v1 = createVoice({ apiKey: 'k', fetchImpl: down.fetchImpl });
    expect(await v1.say(facts)).toBeNull();
    expect(await v1.say(facts)).toBeNull();
    expect(down.seen.calls).toBe(1);

    const v2 = createVoice({ apiKey: 'k', fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
    expect(await v2.say(facts)).toBeNull();

    const bad = fakeAI('I will pay 999 coins.');
    expect(await createVoice({ apiKey: 'k', fetchImpl: bad.fetchImpl }).say(facts)).toBeNull();
  });
  it('gives up after the timeout instead of making the player wait', async () => {
    const slow = ((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    const v = createVoice({ apiKey: 'k', fetchImpl: slow, timeoutMs: 30 });
    expect(await v.say(facts)).toBeNull();
  });
  it('stops calling the model once the per-minute budget is spent', async () => {
    const ai = fakeAI(GOOD);
    let t = 1_000_000;
    const v = createVoice({ apiKey: 'k', fetchImpl: ai.fetchImpl, maxPerMinute: 2, now: () => t });
    await v.say({ ...facts, pays: 1 });
    await v.say({ ...facts, pays: 2 });
    expect(await v.say({ ...facts, pays: 3 })).toBeNull();
    expect(ai.seen.calls).toBe(2);
    t += 61_000; // a minute later the budget is back
    await v.say({ ...facts, pays: 4 });
    expect(ai.seen.calls).toBe(3);
  });
});

describe('Game.voiceFacts and /game/voice', () => {
  const setup = async (voice?: Parameters<typeof createApp>[0]['voice']) => {
    const links: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), 'nims-voice-'));
    const game = new Game(3);
    const app = createApp({
      auth: new Auth(randomHex(32)),
      store: new AccountStore(join(dir, 'a.json'), 'oja.testnet', randomHex(32)),
      chain: { createPlayerAccount: async () => {}, transferItem: async () => {}, itemBalance: async () => 0 },
      mailer: { sendLoginLink: async (_e, l) => void links.push(l) },
      baseUrl: 'http://localhost:0',
      merchantParent: 'run.oja.testnet',
      game,
      devLinks: true,
      voice,
    });
    const server = await app.listen(0);
    const base = `http://localhost:${(server.address() as { port: number }).port}`;
    const r = await (await fetch(base + '/auth/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })).json();
    const cookie = (await fetch(r.devLink.replace('http://localhost:0', base))).headers.get('set-cookie')!.split(';')[0];
    return { server, base, cookie, game };
  };

  it('builds facts from the real quote, and refuses unknown stalls and items', async () => {
    const { server, game } = await setup();
    const f = game.voiceFacts('ada@example.com', 'mira', 'tomatoes')!;
    expect(f.merchant).toMatch(/Mira/);
    expect(f.pays).toBeGreaterThan(0);
    expect(f.tooltip).toMatch(/I'll pay \d+ coins and sell at \d+ coins/);
    expect(game.voiceFacts('ada@example.com', 'nobody', 'tomatoes')).toBeNull();
    expect(game.voiceFacts('ada@example.com', 'mira', 'iron')).toBeNull(); // Mira's market doesn't trade iron
    server.close();
  });

  it('needs a login, returns the voice line, and returns null when the voice is off or says nothing', async () => {
    const said: VoiceFacts[] = [];
    const on = await setup({ say: async (f) => { said.push(f); return 'I only have 5 tomatoes, so it is dear.'; } });
    expect((await fetch(on.base + '/game/voice?merchant=mira&item=tomatoes')).status).toBe(401);
    const r = await (await fetch(on.base + '/game/voice?merchant=mira&item=tomatoes', { headers: { cookie: on.cookie } })).json();
    expect(r.text).toBe('I only have 5 tomatoes, so it is dear.');
    expect(said[0].merchant).toMatch(/Mira/);
    const bad = await (await fetch(on.base + '/game/voice?merchant=zzz&item=tomatoes', { headers: { cookie: on.cookie } })).json();
    expect(bad.text).toBeNull();
    on.server.close();

    const off = await setup();
    const r2 = await (await fetch(off.base + '/game/voice?merchant=mira&item=tomatoes', { headers: { cookie: off.cookie } })).json();
    expect(r2).toEqual({ text: null });
    off.server.close();
  });
});
