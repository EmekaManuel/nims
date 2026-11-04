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
