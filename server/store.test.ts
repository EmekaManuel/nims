import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Game } from './game';
import { loadGame, saveGame } from './store';
import { refreshState } from '../sim/engine';

const me = 'ada@example.com';

/** A game with some history: goal, shares, a stall, an fund shop, a haggle, and time passed. */
function played(): Game {
  const g = new Game(9);
  g.state(me);
  const p = g.w.players.find((x) => x.strategy === 'human')!;
  p.cash = 40_000;
  g.chooseGoal(me, 'stake');
  g.gather(me, 'iron');
  g.sell(me, 'ruth', 'iron', 20, true);
  g.buyShares(me, 'lena', 4);
  g.openStall(me, 'fabric');
  g.stallCash(me, 'deposit', 2_000);
  const m = g.w.merchants.find((x) => x.id === 'tomas')!;
  m.cash = 0; m.stock = {}; refreshState(g.w, m);
  g.contribute(me, 'tomas', 5_000);
  for (let i = 0; i < 30; i++) g.tickOnce();
  return g;
}

const roundTrip = (g: Game) => Game.restore(JSON.parse(JSON.stringify(g.snapshot())));

describe('saving and restoring the game', () => {
  it('brings a player back exactly as they were', () => {
    const g = played();
    const r = roundTrip(g);
    expect(JSON.stringify(r.state(me))).toEqual(JSON.stringify(g.state(me)));
    expect(r.state(me).business.stall).not.toBeNull();
    expect(r.state(me).business.shares.length).toBeGreaterThan(0);
    expect(r.state(me).goal!.title).toBe('A stake in every market');
  });

  it('carries on identically afterwards, because the random generator is saved too', () => {
    const g = played();
    const r = roundTrip(g);
    for (let i = 0; i < 120; i++) { g.tickOnce(); r.tickOnce(); }
    expect(JSON.stringify(r.state(me))).toEqual(JSON.stringify(g.state(me)));
    expect(r.w.hour).toBe(g.w.hour);
    expect(r.w.merchants.map((m) => Math.round(m.cash))).toEqual(g.w.merchants.map((m) => Math.round(m.cash)));
  });

  it('keeps sets and per-player details intact (markets sold in, haggle cooldown, display names)', () => {
    const g = played();
    g.w.players.find((x) => x.strategy === 'human')!.inventory.iron = 10;
    expect(g.sell(me, 'ruth', 'iron', 5, true).ok).toBe(true); // haggle in the current hour
    const r = roundTrip(g);
    // the cooldown survived the restart: a second haggle this hour is still refused
    expect(r.sell(me, 'ruth', 'iron', 5, true).ok).toBe(false);
    r.chooseGoal(me, 'reach');
    expect(r.state(me).goal!.label).toContain('1 of 3 markets'); // the Set of markets was restored
    expect(r.state(me).business.stall!.name).toBe("Ada's stall"); // the display name was restored
  });

  it('writes a file and reads it back, leaving no temp file behind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oja-save-'));
    const file = join(dir, 'game.json');
    saveGame(played(), file);
    expect(existsSync(file)).toBe(true);
    expect(existsSync(file + '.tmp')).toBe(false);
    const back = loadGame(file)!;
    expect(back.w.hour).toBeGreaterThan(0);
    expect(back.state(me).business.stall).not.toBeNull();
  });

  it('starts fresh when there is no save, and keeps a damaged save instead of deleting it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oja-save-'));
    const file = join(dir, 'game.json');
    expect(loadGame(file)).toBeNull();
    writeFileSync(file, '{"version":2,"world":');
    const msgs: string[] = [];
    expect(loadGame(file, (m) => msgs.push(m))).toBeNull();
    expect(msgs[0]).toContain('Starting fresh');
    expect(existsSync(file + '.bad')).toBe(true);
    expect(readFileSync(file + '.bad', 'utf8')).toBe('{"version":2,"world":');
    writeFileSync(file, JSON.stringify({ version: 99 }));
    expect(loadGame(file, () => {})).toBeNull();
  });

  it('keeps the live game from growing forever', () => {
    const g = new Game(2);
    for (let i = 0; i < 24 * 12; i++) g.tickOnce();
    expect(g.w.history.length).toBeLessThanOrEqual(24 * 7);
    expect(g.w.events.length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(g.snapshot()).length).toBeLessThan(5_000_000);
  });
});
