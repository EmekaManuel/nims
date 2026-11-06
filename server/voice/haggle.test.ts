import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../accounts/accounts';
import { createApp } from '../http/api';
import { Auth } from '../http/auth';
import { randomHex } from '../accounts/crypto';
import { Game } from '../game/game';
import { createHaggler, prompt, type HaggleFacts } from './haggle';
import { acceptLine, type Chat } from './llm';

const sold: HaggleFacts = { id: 'anil', merchant: 'Anil Metals', personality: 'greedy', item: 'iron', side: 'sold', units: 5, usual: 200, deal: 208, pct: 4 };
const GOOD = 'You drive a hard bargain, friend. 208 coins each for your iron, and not a coin more.';

describe('acceptLine', () => {
  it('keeps a short line whose numbers come from the facts', () => {
    expect(acceptLine(GOOD, 'You paid 208 coins each instead of 200. That is 4% better.')).toBe(GOOD);
  });
  it('rejects invented numbers, forbidden words, too-short and rambling replies', () => {
    const facts = 'You paid 208 coins each instead of 200.';
    expect(acceptLine('Fine, 250 coins each then, you win.', facts)).toBeNull();
    expect(acceptLine('No wallet needed, 208 coins it is.', facts)).toBeNull();
    expect(acceptLine('Hm.', facts)).toBeNull();
    expect(acceptLine('word '.repeat(80), facts)).toBeNull();
    expect(acceptLine('<think>2+2</think>"Deal at 208 coins, friend."', facts)).toBe('Deal at 208 coins, friend.');
  });
});

describe('haggle prompt and haggler', () => {
  it('describes the deal in the merchant\'s mood, for a sale and for a purchase', () => {
    const a = prompt(sold);
    expect(a.system).toContain('Anil Metals');
    expect(a.system).toContain('competitive');
    expect(a.user).toContain('sold you 5 iron');
    expect(a.user).toContain('208 coins each instead of your usual 200');
    expect(prompt({ ...sold, side: 'bought', personality: 'loyal' }).user).toContain('bought 5 iron from you');
  });
  it('returns the reaction, and null when the model fails or invents a number', async () => {
    const say = (reply: string | null): Chat => ({ complete: async () => reply });
    expect(await createHaggler({ chat: say(GOOD) }).reply(sold)).toBe(GOOD);
    expect(await createHaggler({ chat: say(null) }).reply(sold)).toBeNull();
    expect(await createHaggler({ chat: say('Alright, 999 coins each, you win.') }).reply(sold)).toBeNull();
  });
});

describe('Game: winning a haggle', () => {
  const me = 'ada@example.com';
  it('flags a won haggle and remembers its facts; a plain trade does neither', () => {
    const g = new Game(3);
    expect(g.gather(me, 'iron').ok).toBe(true);
    const plain = g.sell(me, 'anil', 'iron', 2, false);
    expect(plain.ok).toBe(true);
    expect(plain.haggled).toBeUndefined();
    expect(g.haggleFacts(me)).toBeNull();

    const r = g.sell(me, 'anil', 'iron', 2, true);
    expect(r.ok).toBe(true);
    expect(r.haggled).toMatchObject({ merchant: 'anil', name: 'Anil Metals', personality: 'greedy' });
    const f = g.haggleFacts(me)!;
    expect(f).toMatchObject({ id: 'anil', side: 'sold', item: 'iron', units: 2 });
    expect(f.deal).toBeGreaterThan(f.usual);
    expect(f.pct).toBeGreaterThanOrEqual(2);
    expect(f.pct).toBeLessThanOrEqual(8);
  });
  it('a refused second haggle leaves the stored facts alone and has no flag', () => {
    const g = new Game(3);
    g.gather(me, 'iron');
    g.sell(me, 'anil', 'iron', 2, true);
    const before = g.haggleFacts(me);
    const again = g.sell(me, 'anil', 'iron', 2, true);
    expect(again.ok).toBe(false);
    expect(again.haggled).toBeUndefined();
    expect(g.haggleFacts(me)).toEqual(before);
  });
});

describe('/game/haggle', () => {
  it('needs a login, answers from the stored deal, and gives audio when a speaker is on', async () => {
    const links: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), 'nims-haggle-'));
    const game = new Game(3);
    const heard: HaggleFacts[] = [];
    const app = createApp({
      auth: new Auth(randomHex(32)),
      store: new AccountStore(join(dir, 'a.json'), 'oja.testnet', randomHex(32)),
      chain: { createPlayerAccount: async () => {}, transferItem: async () => {}, itemBalance: async () => 0 },
      mailer: { sendLoginLink: async (_e, l) => void links.push(l) },
      baseUrl: 'http://localhost:0',
      merchantParent: 'run.oja.testnet',
      game,
      devLinks: true,
      haggler: { reply: async (f) => { heard.push(f); return 'You drive a hard bargain, friend.'; } },
      speaker: { register: () => 'abc123', audio: async () => null },
    });
    const server = await app.listen(0);
    const base = `http://localhost:${(server.address() as { port: number }).port}`;
    const r = await (await fetch(base + '/auth/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })).json();
    const cookie = (await fetch(r.devLink.replace('http://localhost:0', base))).headers.get('set-cookie')!.split(';')[0];
    const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }).then((x) => x.json());

    expect((await fetch(base + '/game/haggle')).status).toBe(401);
    expect(await (await fetch(base + '/game/haggle', { headers: { cookie } })).json()).toEqual({ text: null, audio: null }); // nothing haggled yet
    await post('/game/gather', { item: 'iron' });
    const sale = await post('/game/sell', { merchant: 'anil', item: 'iron', units: 2, haggle: true });
    expect(sale.haggled.name).toBe('Anil Metals');
    const line = await (await fetch(base + '/game/haggle', { headers: { cookie } })).json();
    expect(line).toEqual({ text: 'You drive a hard bargain, friend.', audio: '/game/voice/audio?id=abc123' });
    expect(heard[0]).toMatchObject({ id: 'anil', side: 'sold', units: 2 });
    server.close();
  });
});
