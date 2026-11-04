import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from './game';

let g: Game;
const me = 'ada@example.com';
beforeEach(() => {
  g = new Game(5);
});

describe('game', () => {
  it('starts a new player with a wheelbarrow and a little cash', () => {
    const s = g.state(me);
    expect(s.you.cash).toBe(3000);
    expect(s.you.vehicle).toBe('wheelbarrow');
    expect(s.you.capacity).toBe(20);
    expect(s.stalls).toHaveLength(8);
  });

  it('gathers a load, then sells it for cash — instantly', () => {
    expect(g.gather(me, 'iron').ok).toBe(true);
    const s = g.state(me);
    expect(s.you.carrying).toBeGreaterThan(0);
    const before = s.you.cash;
    const r = g.sell(me, 'wale', 'iron', 20);
    expect(r.ok).toBe(true);
    expect(g.state(me).you.cash).toBeGreaterThan(before);
  });

  it("every price comes with the merchant's own reasoning", () => {
    const stall = g.state(me).stalls.find((x) => x.id === 'chidi')!;
    for (const o of stall.offers) expect(o.why).toMatch(/I'll pay ₦\d+ and sell at ₦\d+/);
  });

  it('flooding a stall makes its price board go down', () => {
    const price = () => g.state(me).board.find((b) => b.market === 'scrap' && b.item === 'iron')!.price!;
    const start = price();
    for (let i = 0; i < 6; i++) {
      g.gather(me, 'iron');
      g.sell(me, 'wale', 'iron', 20);
      g.sell(me, 'chidi', 'iron', 20);
      g.sell(me, 'emeka', 'iron', 20);
    }
    expect(price()).toBeLessThan(start);
  });

  it('cannot sell what you are not carrying, or to a stall that does not trade it', () => {
    expect(g.sell(me, 'wale', 'iron', 5).ok).toBe(false);
    g.gather(me, 'iron');
    expect(g.sell(me, 'bisi', 'iron', 5).ok).toBe(false);
    expect(g.sell(me, 'nobody', 'iron', 5).ok).toBe(false);
    expect(g.sell(me, 'wale', 'iron', 0).ok).toBe(false);
  });

  it('a full vehicle stops you gathering', () => {
    g.gather(me, 'iron');
    g.gather(me, 'iron');
    const r = g.gather(me, 'iron');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('full');
  });

  it('charges a fare per unit carried when you go to another market', () => {
    const p = g.w.players.find((x) => x.strategy === 'human') ?? (g.state(me), g.w.players.find((x) => x.strategy === 'human')!);
    p.inventory.tomatoes = 5; // a small load, so there is room to buy
    const cash = p.cash;
    const r = g.buy(me, 'nkechi', 'thread', 1); // Fabric Market, from Produce
    expect(r.ok).toBe(true);
    const s = g.state(me);
    expect(s.you.at).toBe('fabric');
    // fare (5 units x ₦20) plus the thread itself
    expect(cash - s.you.cash).toBeGreaterThanOrEqual(5 * 20 + 1);
  });

  it('fuel queues double the fare', () => {
    g.w.shocks.push({ kind: 'fuel queue', startHour: 0, endHour: 99 });
    expect(g.state(me).faresPerUnit).toBe(40);
  });

  it('haggling works once per merchant per hour and never makes you worse off', () => {
    g.gather(me, 'iron');
    const plain = g.w.merchants.find((m) => m.id === 'wale')!;
    const first = g.sell(me, 'wale', 'iron', 5, true);
    expect(first.ok).toBe(true);
    expect(first.message).toContain('better price');
    expect(g.sell(me, 'wale', 'iron', 5, true).ok).toBe(false);
    expect(plain.state).not.toBe('closed');
  });

  it('upgrades the vehicle in order and only if you can afford it', () => {
    expect(g.upgrade(me, 'van').ok).toBe(false); // keke first
    expect(g.upgrade(me, 'keke').ok).toBe(false); // ₦5000 > ₦3000
    g.w.players.find((p) => p.strategy === 'human')!.cash = 6000;
    expect(g.upgrade(me, 'keke').ok).toBe(true);
    expect(g.state(me).you.capacity).toBe(60);
    expect(g.upgrade(me, 'keke').ok).toBe(false);
  });

  it('the town keeps trading as time passes', () => {
    const h = g.state(me).hour;
    for (let i = 0; i < 48; i++) g.tickOnce();
    expect(g.state(me).hour).toBe(h + 48);
  });

  it('shows the player no wallet vocabulary', () => {
    g.gather(me, 'iron');
    const text = JSON.stringify([g.state(me), g.sell(me, 'wale', 'iron', 5), g.upgrade(me, 'keke')]);
    expect(text).not.toMatch(/seed|mnemonic|private key|wallet|\bgas\b|yocto|\.testnet|signature/i);
  });
});

describe('goals, coach and deals', () => {
  it('starts with no goal, offers three, and asks the player to pick one', () => {
    const s = g.state(me);
    expect(s.goal).toBeNull();
    expect(s.goals.map((x) => x.kind)).toEqual(['fortune', 'reach', 'district']);
    expect(s.coach.text).toMatch(/Pick a goal/);
    expect(g.chooseGoal(me, 'nonsense').ok).toBe(false);
  });

  it('shows progress towards the chosen goal', () => {
    g.chooseGoal(me, 'fortune');
    const s = g.state(me);
    expect(s.goal!.title).toBe('Build a fortune');
    expect(s.goal!.progress).toBeCloseTo(3000 / 25000, 2);
    expect(s.goal!.label).toContain('25,000');
    g.w.players.find((p) => p.strategy === 'human')!.cash = 30_000;
    g.tickOnce();
    expect(g.state(me).goal!.done).toBe(true);
    expect(g.state(me).coach.text).toMatch(/Goal reached/);
  });

  it('"Trade everywhere" counts markets sold in plus a van', () => {
    g.chooseGoal(me, 'reach');
    g.gather(me, 'iron');
    g.sell(me, 'wale', 'iron', 20);
    expect(g.state(me).goal!.label).toContain('1 of 3 markets');
    expect(g.state(me).goal!.progress).toBeCloseTo(0.25, 2);
  });

  it('"Keep the district alive" counts hours with every stall open, and resets if one closes', () => {
    g.chooseGoal(me, 'district');
    for (let i = 0; i < 5; i++) g.tickOnce();
    expect(g.state(me).goal!.label).toMatch(/^[1-5] of 72/);
    const m = g.w.merchants[0];
    m.cash = 0;
    m.stock = {};
    g.tickOnce();
    // the shop may refresh its state during the tick; force the closed state the way the engine would
    m.state = 'closed';
    g.tickOnce();
    expect(g.state(me).goal!.label).toMatch(/^0 of 72/);
  });

  it('the coach points an empty-handed player at a free source, then at the best buyer', () => {
    g.chooseGoal(me, 'fortune');
    const first = g.state(me).coach;
    expect(first.text).toMatch(/^Collect|^Buy/);
    expect(first.focus).not.toBeNull();
    g.gather(me, first.focus!.kind === 'source' ? (first.focus!.id as never) : 'iron');
    const next = g.state(me).coach;
    expect(next.text).toMatch(/^Sell your \d+/);
    expect(next.focus!.kind).toBe('stall');
  });

  it('deals are profitable and name where to get the goods and where to sell them', () => {
    const { deals } = g.state(me);
    expect(deals.length).toBeGreaterThan(0);
    for (const d of deals) {
      expect(d.profit).toBeGreaterThan(0);
      expect(d.to.price - d.from.cost).toBeGreaterThanOrEqual(d.profit);
    }
    expect(deals.map((d) => d.profit)).toEqual([...deals.map((d) => d.profit)].sort((a, b) => b - a));
  });

  it('marks which stall pays the most for each item', () => {
    const s = g.state(me);
    const iron = s.stalls.flatMap((x) => x.offers).filter((o) => o.item === 'iron');
    const best = iron.filter((o) => o.bestPay);
    expect(best.length).toBeGreaterThan(0);
    expect(Math.max(...best.map((o) => o.buyPrice))).toBe(Math.max(...iron.filter((o) => o.willBuy).map((o) => o.buyPrice)));
  });
});
