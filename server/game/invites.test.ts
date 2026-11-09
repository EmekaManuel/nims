import { describe, it, expect } from 'vitest';
import { Game, INVITE_MAX, INVITE_REWARD } from './game';

const host = 'ada.obi@example.com';
const friend = 'bo.k@example.com';
/** Make one sale, spread over goods and buyers so no market floods: collect, then sell to whoever still buys it. */
const ROUTES: [Parameters<Game['gather']>[1], string[]][] = [['tomatoes', ['mira', 'tomas']], ['iron', ['anil', 'ruth', 'diego']], ['pepper', ['june', 'mira']], ['copper wire', ['anil', 'diego']]];
let turn = 0;
const sellOnce = (g: Game, e: string) => {
  for (let k = 0; k < ROUTES.length; k++) {
    const [item, buyers] = ROUTES[(turn + k) % ROUTES.length];
    if (!g.gather(e, item).ok) continue;
    for (const m of buyers) { const r = g.sell(e, m, item, 1); if (r.ok) { turn++; return r; } }
  }
  throw new Error('nobody would buy');
};
const cash = (g: Game, e: string) => g.state(e).you.cash;

describe('invite a friend', () => {
  it('a friend joins with your code; on their first sale you each get the reward, once', () => {
    const g = new Game(5);
    const code = g.state(host).invite.code;
    expect(code).toMatch(/^[0-9A-F]{8}$/);
    g.state(friend);
    expect(g.redeemInvite(friend, code.toLowerCase())).toMatchObject({ ok: true });
    expect(g.state(host).invite).toMatchObject({ joined: 1, rewarded: 0 });
    const hostBefore = cash(g, host);
    g.gather(friend, 'tomatoes');
    const friendBefore = cash(g, friend);
    g.sell(friend, 'mira', 'tomatoes', 1);
    expect(cash(g, host)).toBe(hostBefore + INVITE_REWARD);
    expect(cash(g, friend)).toBeGreaterThanOrEqual(friendBefore + INVITE_REWARD);
    expect(g.state(host).invite).toMatchObject({ joined: 1, rewarded: 1 });
    const again = cash(g, host);
    sellOnce(g, friend);
    expect(cash(g, host)).toBe(again); // paid once
  });

  it('refuses your own code, a bad code, a second invite, and players who have already traded', () => {
    const g = new Game(5);
    const code = g.state(host).invite.code;
    expect(g.redeemInvite(host, code)).toMatchObject({ ok: false, message: expect.stringMatching(/your own/) });
    g.state(friend);
    expect(g.redeemInvite(friend, 'NOPE1234')).toMatchObject({ ok: false });
    expect(g.redeemInvite(friend, code)).toMatchObject({ ok: true });
    expect(g.redeemInvite(friend, code)).toMatchObject({ ok: false, message: expect.stringMatching(/already joined/) });
    const vet = 'cy.l@example.com';
    g.state(vet);
    sellOnce(g, vet);
    expect(g.redeemInvite(vet, code)).toMatchObject({ ok: false, message: expect.stringMatching(/new players/) });
  });

  it(`rewards an inviter for at most ${INVITE_MAX} friends`, () => {
    const g = new Game(5);
    const code = g.state(host).invite.code;
    for (let i = 0; i < INVITE_MAX + 2; i++) {
      const e = `f${i}.x@example.com`;
      g.state(e);
      g.redeemInvite(e, code);
      sellOnce(g, e);
    }
    expect(g.state(host).invite.rewarded).toBe(INVITE_MAX);
  });

  it('an invite survives a save and still pays after it', () => {
    const g = new Game(5);
    const code = g.state(host).invite.code;
    g.state(friend);
    g.redeemInvite(friend, code);
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    const before = cash(back, host);
    sellOnce(back, friend);
    expect(cash(back, host)).toBe(before + INVITE_REWARD);
  });
});
