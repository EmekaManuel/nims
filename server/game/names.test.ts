import { describe, it, expect } from 'vitest';
import { Game, nameProblem } from './game';

const me = 'nwosustephen@example.com';

describe('choosing the name others see', () => {
  it('accepts ordinary names, including ones with accents, hyphens and apostrophes', () => {
    for (const n of ['Stephen', 'Ngozi', "O'Neil", 'Ada-Eze', 'Zoë', 'Mary Jo', 'Dickson', 'Fagbemi']) expect(nameProblem(n), n).toBeNull();
  });

  it('refuses names that are too short, too long, not letters, an email, or rude', () => {
    expect(nameProblem('A')).toMatch(/2 to 16/);
    expect(nameProblem('Abcdefghijklmnopq')).toMatch(/2 to 16/);
    expect(nameProblem('ada@x.io')).toMatch(/letters/);
    expect(nameProblem('Ada99')).toMatch(/letters/);
    expect(nameProblem(' Ada')).toMatch(/letters/);
    expect(nameProblem('Fuckface')).toMatch(/different/);
    expect(nameProblem('Admin')).toMatch(/different/);
  });

  it('a chosen name shows everywhere others see you: your stall, the news, the town board', () => {
    const g = new Game(5);
    g.state(me);
    g.w.players[g.w.players.length - 1].cash = 50_000;
    expect(g.openStall(me, 'fabric').ok).toBe(true);
    g.gather(me, 'tomatoes');
    g.sell(me, 'mira', 'tomatoes', 1);
    expect(g.state(me).you.name).toBe('N.');
    expect(g.setName(me, '  Stephen  ')).toMatchObject({ ok: true });
    const s = g.state(me);
    expect(s.you.name).toBe('Stephen');
    expect(s.business.stall!.name).toBe("Stephen's stall");
    expect(g.publicStats().leaders[0].name).toBe('Stephen');
    expect(g.w.events.some((e) => e.text.includes("N.'s stall"))).toBe(false);
  });

  it('renames only whole words in the news', () => {
    const g = new Game(5);
    const e = 'ada.obi@example.com';
    g.state(e);
    g.w.events.push({ hour: 1, type: 'state', text: 'Ada sold to Adaeze.' });
    g.setName(e, 'Amara');
    expect(g.w.events.at(-1)!.text).toBe('Amara sold to Adaeze.');
  });

  it('refuses a bad name and keeps the old one', () => {
    const g = new Game(5);
    g.state(me);
    expect(g.setName(me, 'x@y.z')).toMatchObject({ ok: false });
    expect(g.state(me).you.name).toBe('N.');
  });

  it('a chosen name survives a save, and loading never puts the email-based name back', () => {
    const g = new Game(5);
    g.state(me);
    g.setName(me, 'Stephen');
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.state(me).you.name).toBe('Stephen');
  });
});
