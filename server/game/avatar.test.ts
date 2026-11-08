import { describe, it, expect } from 'vitest';
import { parseAvatar } from './avatar';
import { Game } from './game';

const ok = { skin: 2, hair: 1, style: 'long', shirt: 5, hat: 'cap' };

describe('avatars', () => {
  it('accepts only picks from the palettes', () => {
    expect(parseAvatar(ok)).toEqual(ok);
    for (const bad of [null, 'x', { ...ok, skin: 6 }, { ...ok, hair: -1 }, { ...ok, shirt: 1.5 }, { ...ok, style: 'mohawk' }, { ...ok, hat: '<script>' }, { ...ok, skin: '2' }]) {
      expect(parseAvatar(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(parseAvatar({ ...ok, extra: 'ignored' })).toEqual(ok); // unknown fields are dropped
  });

  it('a new player has no look until they choose one; it shows in their state and on the board, and survives a save', () => {
    const g = new Game(5);
    const e = 'ada.obi@example.com';
    expect(g.state(e).you.avatar).toBeNull();
    expect(g.setAvatar(e, ok)).toMatchObject({ ok: true, message: expect.stringMatching(/Welcome/) });
    expect(g.setAvatar(e, { ...ok, shirt: 1 })).toMatchObject({ ok: true, message: expect.stringMatching(/new look/) });
    expect(g.setAvatar(e, { ...ok, shirt: 99 })).toMatchObject({ ok: false });
    expect(g.state(e).you.avatar).toEqual({ ...ok, shirt: 1 });
    g.gather(e, 'tomatoes');
    g.sell(e, 'mira', 'tomatoes', 1);
    expect(g.publicStats().leaders[0].avatar).toEqual({ ...ok, shirt: 1 });
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.state(e).you.avatar).toEqual({ ...ok, shirt: 1 });
  });
});
