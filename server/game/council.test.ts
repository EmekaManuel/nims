import { describe, it, expect } from 'vitest';
import { Game } from './game';

const me = 'ada@example.com';
const rich = (g: Game, email: string) => { g.state(email); g.w.players[g.w.players.length - 1].cash = 500_000; };

describe('town council through the game', () => {
  it('a new player who has made one sale in a market can propose and vote there, with no shares', () => {
    const g = new Game(5);
    me && g.state(me);
    const mira = g.w.merchants.find((m) => m.id === 'mira')!;
    expect(g.state(me).council[0]).toMatchObject({ market: 'produce', seats: 0, canPropose: false });
    expect(g.gather(me, 'tomatoes').ok).toBe(true);
    expect(g.sell(me, mira.id, 'tomatoes', 1, false).ok).toBe(true);
    const after = g.state(me).council[0];
    expect(after).toMatchObject({ seats: 1, regular: true, canPropose: true });
    expect(g.state(me).council[1].canPropose).toBe(false); // the fabric market is another matter
    expect(g.councilPropose(me, 'produce', 'rent', 'low').ok).toBe(true);
    expect(g.councilVote(me, 'produce', true).ok).toBe(true);
  });

  it('every market shows its rules; you can only propose where you hold shares', () => {
    const g = new Game(5);
    const s = g.state(me);
    expect(s.council.map((c) => c.market)).toEqual(['produce', 'fabric', 'scrap', 'harbour', 'woods', 'mine', 'vale']);
    expect(s.council[1]).toMatchObject({ rent: 'normal', payout: 'normal', seats: 0, canPropose: false, proposal: null });
    expect(g.councilPropose(me, 'fabric', 'rent', 'low')).toMatchObject({ ok: false });
  });

  it('a shareholder proposes, votes, and the result shows up in the state and the news', () => {
    const g = new Game(5);
    rich(g, me);
    expect(g.buyShares(me, 'omar', 30).ok).toBe(true);
    expect(g.state(me).council[1]).toMatchObject({ seats: 30, canPropose: true });
    expect(g.councilPropose(me, 'fabric', 'rent', 'low').ok).toBe(true);
    const open = g.state(me).council[1];
    expect(open.proposal).toMatchObject({ lever: 'rent', to: 'low', yourVote: 'yes', yes: expect.any(Number) });
    expect(open.canPropose).toBe(false);
    expect(g.councilVote(me, 'fabric', false).ok).toBe(true);
    expect(g.state(me).council[1].proposal!.yourVote).toBe('no');
    expect(g.councilVote(me, 'fabric', true).ok).toBe(true);
    for (let h = 0; h < 48 && g.w.council.fabric.proposal; h++) g.tickOnce();
    const after = g.state(me);
    expect(after.council[1]).toMatchObject({ rent: 'low', proposal: null });
    expect(after.events.some((e) => /council voted to set stall rent to low/.test(e.text))).toBe(true);
  });

  it('the council survives a save, and an old save without one starts on the usual rules', () => {
    const g = new Game(5);
    rich(g, me);
    g.buyShares(me, 'omar', 30);
    g.councilPropose(me, 'fabric', 'payout', 'generous');
    const copy = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(copy.w.council.fabric.proposal).toMatchObject({ lever: 'payout', to: 'generous' });

    const old = JSON.parse(JSON.stringify(g.snapshot()));
    delete old.world.council;
    const fresh = Game.restore(old);
    expect(fresh.w.council.fabric).toEqual({ rent: 'normal', payout: 'normal', levy: 0 });
  });
});
