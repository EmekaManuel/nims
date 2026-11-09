import { describe, it, expect, vi } from 'vitest';
import { Game } from '../game/game';
import { createPlanner, factsText, parsePlan, planPrompt, type PlanFacts } from './planner';

const facts: PlanFacts = {
  id: 'lena', merchant: "Lena's Textiles", personality: 'loyal', market: 'Fabric Market', day: 12, cash: 18_000, cashFloor: 1_500,
  items: [
    { item: 'cotton', stock: 22, usualStock: 40, boughtByPlayers: 9, soldByPlayers: 2, price: 1_040, usualPrice: 800 },
    { item: 'thread', stock: 130, usualStock: 120, boughtByPlayers: 1, soldByPlayers: 14, price: 92, usualPrice: 100 },
  ],
  shocks: ['festive season: everyone wants fabric'], rent: 'normal', payout: 'normal',
};

describe('reading a merchant plan', () => {
  it('takes the choices and the merchant\'s own reason when it only uses real numbers', () => {
    const p = parsePlan('{"stock":{"cotton":"more","thread":"less"},"margin":"wider","reason":"Festive season and only 22 cotton left: I am stocking up."}', facts);
    expect(p).toEqual({ stock: { cotton: 'more', thread: 'less' }, margin: 'wider', reason: 'Festive season and only 22 cotton left: I am stocking up.', ownWords: true });
  });

  it('copes with a fenced or chatty reply', () => {
    expect(parsePlan('Sure!\n```json\n{"stock":{"cotton":"same"},"margin":"same","reason":"Steady day."}\n```', facts)).toMatchObject({ margin: 'same', stock: {} });
  });

  it('keeps the choices but writes its own reason when the merchant invents a number or says a forbidden word', () => {
    expect(parsePlan('{"stock":{"cotton":"more"},"margin":"same","reason":"Cotton will hit 5000 coins, so I am buying."}', facts)).toMatchObject({ reason: "Today I'm holding more cotton.", ownWords: false });
    expect(parsePlan('{"stock":{"cotton":"more"},"margin":"same","reason":"My wallet says buy cotton now."}', facts)?.ownWords).toBe(false);
  });

  it('ignores a reply that is not a plan: not JSON, an unknown choice, or no margin', () => {
    expect(parsePlan(null, facts)).toBeNull();
    expect(parsePlan('I would hold more cotton.', facts)).toBeNull();
    expect(parsePlan('{"stock":{"cotton":"triple"},"margin":"same","reason":"x"}', facts)).toBeNull();
    expect(parsePlan('{"stock":{"cotton":"more"},"reason":"x"}', facts)).toBeNull();
    expect(parsePlan('{"stock":{"cotton":"more"},"margin":"double","reason":"x"}', facts)).toBeNull();
  });

  it('only plans goods the merchant trades: anything else in the reply is ignored', () => {
    expect(parsePlan('{"stock":{"cotton":"more","iron":"more","lace":"less"},"margin":"same","reason":"Busy week ahead."}', facts)?.stock).toEqual({ cotton: 'more' });
  });

  it('tells the merchant its real situation, and nothing about any player', () => {
    const t = factsText(facts);
    expect(t).toContain('cotton: you hold 22, usually 40');
    expect(t).toContain('festive season');
    const p = planPrompt(facts);
    expect(p.system).toMatch(/JSON only/);
    expect(p.user).toContain('"cotton", "thread"');
  });
});

describe('merchants planning their day in the game', () => {
  const reply = (stock: Record<string, string>, margin = 'same', reason = 'A steady day ahead.') => JSON.stringify({ stock, margin, reason });

  it('every open merchant plans once a day, one per step, and the plan shows in its stall and in the news when it changes', async () => {
    const g = new Game(5);
    g.state('ada.obi@example.com');
    const chat = { complete: vi.fn(async (_s: string, user: string) => (user.includes('cotton') ? reply({ cotton: 'more' }, 'wider', 'Festive season, so I am stocking up on cotton.') : reply({}))) };
    const planner = createPlanner({ chat, game: g });
    expect(g.merchantsToPlan()).toHaveLength(11);
    for (let i = 0; i < 11; i++) expect(await planner.step()).toBe('planned');
    expect(await planner.step()).toBe('idle');
    expect(chat.complete).toHaveBeenCalledTimes(11);
    const lena = g.state('ada.obi@example.com').stalls.find((s) => s.id === 'lena')!;
    expect(lena.plan).toMatchObject({ stock: { cotton: 'more' }, margin: 'wider', reason: 'Festive season, so I am stocking up on cotton.' });
    expect(lena.offers.find((o) => o.item === 'cotton')!.target).toBe(Math.round(40 * 1.3));
    const news = g.w.events.filter((e) => e.type === 'plan').map((e) => e.text);
    expect(news.some((t) => t.startsWith("Lena's Textiles:"))).toBe(true);
    expect(news.some((t) => t.includes('Keeping to my usual'))).toBe(false); // a plan that changes nothing is not news
    for (let h = 0; h < 24; h++) g.tickOnce();
    expect(g.merchantsToPlan()).toHaveLength(11); // a new day, a new plan
  });

  it('a failed or nonsensical reply leaves the merchant as it was, and is asked again later', async () => {
    const g = new Game(5);
    const planner = createPlanner({ chat: { complete: async () => 'not a plan' }, game: g });
    expect(await planner.step()).toBe('kept');
    expect(g.w.merchants.every((m) => m.plan === undefined)).toBe(true);
    expect(g.merchantsToPlan()).toHaveLength(11);
    const down = createPlanner({ chat: { complete: async () => null }, game: g });
    expect(await down.step()).toBe('kept');
  });

  it('steps never overlap', async () => {
    const g = new Game(5);
    let release: (v: string) => void = () => {};
    const planner = createPlanner({ chat: { complete: () => new Promise<string>((r) => { release = r; }) }, game: g });
    const first = planner.step();
    expect(await planner.step()).toBe('busy');
    release(reply({}));
    expect(await first).toBe('planned');
  });

  it('plans survive a save, and player stalls are never planned for', () => {
    const g = new Game(5);
    g.applyPlan('lena', { stock: { cotton: 'more' }, margin: 'narrower', reason: 'Plenty of buyers about.', ownWords: true });
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.w.merchants.find((m) => m.id === 'lena')!.plan).toMatchObject({ stock: { cotton: 'more' }, margin: 'narrower' });
    expect(back.merchantsToPlan()).not.toContain('lena');
    expect(back.planFacts('nobody')).toBeNull();
  });
});
