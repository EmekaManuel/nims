import { describe, it, expect } from 'vitest';
import { Game } from '../game/game';
import { BUILD_COST, PLOT_PRICES, REALMS, type Item } from '../../sim/world';
import { transferCoins } from '../../sim/engine';
import { planPrompt } from '../agents/planner';
import { prompt as voicePrompt } from './voice';
import { prompt as gazettePrompt } from './gazette';
import { prompt as hagglePrompt } from './haggle';

/**
 * The README promises that no player-typed text reaches any prompt. This plays a player who types a distinctive name
 * and a distinctive business name, makes every kind of move that writes that text into the world (first to arrive,
 * buying land, opening a business, a haggle, a trade), then builds every prompt the game can send and checks the typed
 * words are in none of them. If a new feature leaks a name into a prompt, this fails.
 */
const email = 'zeph.q@example.com';
const NAME = 'Zephyrine';
const BUSINESS = 'Quillfeather Wares';

describe('no player-typed text reaches a prompt', () => {
  it('neither a chosen name nor a business name appears in any planner, voice, gazette or haggle prompt', () => {
    const g = new Game(5);
    g.state(email);
    const p = g.w.players.find((x) => x.id === g.playerFor(email).id)!;
    expect(g.setName(email, NAME)).toMatchObject({ ok: true });
    transferCoins(g.w, 'town', p, 200_000);

    // a haggle in town, so the haggle facts exist
    const town = g.w.merchants.find((m) => !m.owner && m.market === 'produce')!;
    const item = Object.keys(town.stock)[0] as Item;
    p.inventory[item] = 5;
    g.sell(email, town.id, item, 3, true);

    // first to arrive at a frontier, then buy land and open a business with a typed name
    expect(g.travel(email, 'timberfell')).toMatchObject({ ok: true });
    for (let i = 0; i < 30 && p.journey; i++) g.tickOnce();
    expect(g.buyLand(email, 'timberfell-1')).toMatchObject({ ok: true });
    expect(g.build(email, 'timberfell-1', BUSINESS)).toMatchObject({ ok: true });
    expect(p.cash).toBeGreaterThan(PLOT_PRICES[0] + BUILD_COST - 1);
    for (let i = 0; i < 30; i++) g.tickOnce();

    // the typed words really are in the world's events, so the test is not passing for the wrong reason
    const all = g.w.events.map((e) => e.text).join('\n');
    expect(all).toContain(NAME);
    expect(all).toContain(BUSINESS);
    expect(all).toContain(REALMS.timberfell.name);

    const prompts: string[] = [];
    const add = (x: { system: string; user: string }) => prompts.push(x.system, x.user);
    add(gazettePrompt(g.gazetteFacts()));
    for (const m of g.w.merchants) {
      const facts = g.planFacts(m.id);
      if (facts) add(planPrompt(facts));
      for (const it of Object.keys(m.stock)) {
        const v = g.voiceFacts(email, m.id, it);
        if (v) add(voicePrompt(v));
      }
    }
    const h = g.haggleFacts(email);
    expect(h).not.toBeNull();
    add(hagglePrompt(h!));

    expect(prompts.length).toBeGreaterThan(10);
    for (const text of prompts) {
      expect(text).not.toContain(NAME);
      expect(text).not.toContain(BUSINESS);
      expect(text).not.toContain(email);
    }
  });
});
