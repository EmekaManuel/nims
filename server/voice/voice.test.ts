import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../accounts/accounts';
import { createApp } from '../http/api';
import { Auth } from '../http/auth';
import { randomHex } from '../accounts/crypto';
import { Game } from '../game/game';
import { accept, createVoice, prompt, type VoiceFacts } from './voice';
import { createSpeaker } from './speaker';

const facts: VoiceFacts = {
  id: 'mira',
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
    expect(r2).toEqual({ text: null, audio: null });
    off.server.close();
  });
});

describe('spoken merchants (ElevenLabs)', () => {
  const mp3 = Buffer.from('ID3-fake-mp3-bytes');
  const fakeTTS = (status = 200) => {
    const seen = { calls: [] as { url: string; key: string; body: any }[] };
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.calls.push({ url, key: String((init.headers as Record<string, string>)['xi-api-key']), body: JSON.parse(String(init.body)) });
      return status === 200 ? new Response(mp3, { status }) : new Response('{"detail":"no"}', { status });
    }) as unknown as typeof fetch;
    return { fetchImpl, seen };
  };
  const mira = { id: 'mira', personality: 'greedy' as const };

  it('makes audio for a line the server registered, with that merchant\'s voice, model and personality', async () => {
    const t = fakeTTS();
    const sp = createSpeaker({ apiKey: 'xi-test', fetchImpl: t.fetchImpl, voices: { mira: 'VOICE_MIRA' } });
    const id = sp.register(mira, 'I only have 63 tomatoes, so it is dear.');
    expect(await sp.audio(id)).toEqual(mp3);
    expect(await sp.audio(id)).toEqual(mp3); // cached
    expect(t.seen.calls).toHaveLength(1);
    expect(t.seen.calls[0].url).toContain('/text-to-speech/VOICE_MIRA');
    expect(t.seen.calls[0].key).toBe('xi-test');
    expect(t.seen.calls[0].body.model_id).toBe('eleven_flash_v2_5');
    expect(t.seen.calls[0].body.text).toBe('I only have 63 tomatoes, so it is dear.');
    expect(t.seen.calls[0].body.voice_settings.stability).toBe(0.35); // greedy: more swing
  });

  it('never speaks text it did not register itself, and caps long lines', async () => {
    const t = fakeTTS();
    const sp = createSpeaker({ apiKey: 'k', fetchImpl: t.fetchImpl, maxChars: 40 });
    expect(await sp.audio('0123456789abcdef0123')).toBeNull();
    expect(t.seen.calls).toHaveLength(0);
    const id = sp.register(mira, 'word '.repeat(50));
    await sp.audio(id);
    expect(t.seen.calls[0].body.text.length).toBeLessThanOrEqual(40);
  });

  it('shares one call for the same line, and falls back to the default voice if a merchant voice is refused', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => { urls.push(url); return url.includes('BAD') ? new Response('no', { status: 404 }) : new Response(mp3, { status: 200 }); }) as unknown as typeof fetch;
    const sp = createSpeaker({ apiKey: 'k', fetchImpl, voices: { mira: 'BAD' }, defaultVoice: 'GOOD' });
    const id = sp.register(mira, 'A line to say today.');
    const [a, b] = await Promise.all([sp.audio(id), sp.audio(id)]);
    expect(a).toEqual(mp3);
    expect(b).toEqual(mp3);
    expect(urls.map((u) => (u.includes('BAD') ? 'BAD' : 'GOOD'))).toEqual(['BAD', 'GOOD']);
  });

  it('returns null on an HTTP error or a thrown error, and does not hammer a failing call', async () => {
    const t = fakeTTS(401);
    const sp = createSpeaker({ apiKey: 'bad', fetchImpl: t.fetchImpl });
    const id = sp.register(mira, 'Another line to say.');
    expect(await sp.audio(id)).toBeNull();
    expect(await sp.audio(id)).toBeNull();
    expect(t.seen.calls).toHaveLength(1);
    const boom = createSpeaker({ apiKey: 'k', fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
    expect(await boom.audio(boom.register(mira, 'Yet another line to say.'))).toBeNull();
  });

  it('stops making audio once the per-minute budget is spent, and resumes a minute later', async () => {
    const t = fakeTTS();
    let now = 5_000_000;
    const sp = createSpeaker({ apiKey: 'k', fetchImpl: t.fetchImpl, maxPerMinute: 2, now: () => now });
    for (const n of [1, 2]) expect(await sp.audio(sp.register(mira, `Line number ${n} for today.`))).toEqual(mp3);
    expect(await sp.audio(sp.register(mira, 'Line number 3 for today.'))).toBeNull();
    expect(t.seen.calls).toHaveLength(2);
    now += 61_000;
    expect(await sp.audio(sp.register(mira, 'Line number 4 for today.'))).toEqual(mp3);
  });
});

describe('/game/voice with audio', () => {
  it('returns the line and an audio link, serves the audio, and needs a login', async () => {
    const links: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), 'nims-audio-'));
    const mp3 = Buffer.from('ID3-route-bytes');
    const speaker = createSpeaker({ apiKey: 'k', fetchImpl: (async () => new Response(mp3, { status: 200 })) as unknown as typeof fetch });
    const app = createApp({
      auth: new Auth(randomHex(32)),
      store: new AccountStore(join(dir, 'a.json'), 'oja.testnet', randomHex(32)),
      chain: { createPlayerAccount: async () => {}, transferItem: async () => {}, itemBalance: async () => 0 },
      mailer: { sendLoginLink: async (_e, l) => void links.push(l) },
      baseUrl: 'http://localhost:0',
      merchantParent: 'run.oja.testnet',
      game: new Game(3),
      devLinks: true,
      voice: { say: async () => 'I only have 5 tomatoes, so it is dear.' },
      speaker,
    });
    const server = await app.listen(0);
    const base = `http://localhost:${(server.address() as { port: number }).port}`;
    const r = await (await fetch(base + '/auth/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })).json();
    const cookie = (await fetch(r.devLink.replace('http://localhost:0', base))).headers.get('set-cookie')!.split(';')[0];

    const v = await (await fetch(base + '/game/voice?merchant=mira&item=tomatoes', { headers: { cookie } })).json();
    expect(v.text).toBe('I only have 5 tomatoes, so it is dear.');
    expect(v.audio).toMatch(/^\/game\/voice\/audio\?id=[0-9a-f]+$/);
    expect((await fetch(base + v.audio)).status).toBe(401);
    const a = await fetch(base + v.audio, { headers: { cookie } });
    expect(a.status).toBe(200);
    expect(a.headers.get('content-type')).toBe('audio/mpeg');
    expect(Buffer.from(await a.arrayBuffer())).toEqual(mp3);
    expect((await fetch(base + '/game/voice/audio?id=nope', { headers: { cookie } })).status).toBe(404);
    server.close();
  });
});
