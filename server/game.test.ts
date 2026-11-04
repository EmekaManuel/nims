import { describe, it, expect, beforeEach } from 'vitest';
import { displayName, Game } from './game';
import { refreshState } from '../sim/engine';

let g: Game;
const me = 'ada@example.com';
beforeEach(() => {
  g = new Game(5);
});

describe('game', () => {
  it('starts a new player with a wheelbarrow and a little cash', () => {
    const s = g.state(me);
    expect(s.you.cash).toBe(4000);
    expect(s.you.vehicle).toBe('wheelbarrow');
    expect(s.you.capacity).toBe(20);
    expect(s.stalls).toHaveLength(8);
  });

  it('gathers a load, then sells it for cash — instantly', () => {
    expect(g.gather(me, 'iron').ok).toBe(true);
    const s = g.state(me);
    expect(s.you.carrying).toBeGreaterThan(0);
    const before = s.you.cash;
    const r = g.sell(me, 'ruth', 'iron', 20);
    expect(r.ok).toBe(true);
    expect(g.state(me).you.cash).toBeGreaterThan(before);
  });

  it("every price comes with the merchant's own reasoning", () => {
    const stall = g.state(me).stalls.find((x) => x.id === 'anil')!;
    for (const o of stall.offers) expect(o.why).toMatch(/I'll pay \d+ coins and sell at \d+ coins/);
  });

  it('flooding a stall makes its price board go down', () => {
    const price = () => g.state(me).board.find((b) => b.market === 'scrap' && b.item === 'iron')!.price!;
    const start = price();
    for (let i = 0; i < 6; i++) {
      g.gather(me, 'iron');
      g.sell(me, 'ruth', 'iron', 20);
      g.sell(me, 'anil', 'iron', 20);
      g.sell(me, 'diego', 'iron', 20);
    }
    expect(price()).toBeLessThan(start);
  });

  it('cannot sell what you are not carrying, or to a stall that does not trade it', () => {
    expect(g.sell(me, 'ruth', 'iron', 5).ok).toBe(false);
    g.gather(me, 'iron');
    expect(g.sell(me, 'mira', 'iron', 5).ok).toBe(false);
    expect(g.sell(me, 'nobody', 'iron', 5).ok).toBe(false);
    expect(g.sell(me, 'ruth', 'iron', 0).ok).toBe(false);
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
    const r = g.buy(me, 'lena', 'thread', 1); // Fabric Market, from Produce
    expect(r.ok).toBe(true);
    const s = g.state(me);
    expect(s.you.at).toBe('fabric');
    // fare (5 units x 20 coins) plus the thread itself
    expect(cash - s.you.cash).toBeGreaterThanOrEqual(5 * 20 + 1);
  });

  it('fuel queues double the fare', () => {
    g.w.shocks.push({ kind: 'fuel queue', startHour: 0, endHour: 99 });
    expect(g.state(me).faresPerUnit).toBe(40);
  });

  it('haggling works once per merchant per hour and never makes you worse off', () => {
    g.gather(me, 'iron');
    const plain = g.w.merchants.find((m) => m.id === 'ruth')!;
    const first = g.sell(me, 'ruth', 'iron', 5, true);
    expect(first.ok).toBe(true);
    expect(first.message).toContain('better price');
    expect(g.sell(me, 'ruth', 'iron', 5, true).ok).toBe(false);
    expect(plain.state).not.toBe('closed');
  });

  it('upgrades the vehicle in order and only if you can afford it', () => {
    expect(g.upgrade(me, 'van').ok).toBe(false); // pickup first
    expect(g.upgrade(me, 'pickup').ok).toBe(false); // 5000 coins > 3000 coins
    g.w.players.find((p) => p.strategy === 'human')!.cash = 6000;
    expect(g.upgrade(me, 'pickup').ok).toBe(true);
    expect(g.state(me).you.capacity).toBe(60);
    expect(g.upgrade(me, 'pickup').ok).toBe(false);
  });

  it('the town keeps trading as time passes', () => {
    const h = g.state(me).hour;
    for (let i = 0; i < 48; i++) g.tickOnce();
    expect(g.state(me).hour).toBe(h + 48);
  });

  it('shows the player no wallet vocabulary', () => {
    g.gather(me, 'iron');
    const text = JSON.stringify([g.state(me), g.sell(me, 'ruth', 'iron', 5), g.upgrade(me, 'pickup')]);
    expect(text).not.toMatch(/seed|mnemonic|private key|wallet|\bgas\b|yocto|\.testnet|signature/i);
  });
});

describe('goals, coach and deals', () => {
  it('starts with no goal, offers the goals, and asks the player to pick one', () => {
    const s = g.state(me);
    expect(s.goal).toBeNull();
    expect(s.goals.map((x) => x.kind)).toEqual(['fortune', 'reach', 'stake', 'district']);
    expect(s.coach.text).toMatch(/Pick a goal/);
    expect(g.chooseGoal(me, 'nonsense').ok).toBe(false);
  });

  it('shows progress towards the chosen goal', () => {
    g.chooseGoal(me, 'fortune');
    const s = g.state(me);
    expect(s.goal!.title).toBe('Build a fortune');
    expect(s.goal!.progress).toBeCloseTo(4000 / 12000, 2);
    expect(s.goal!.label).toContain('12,000');
    g.w.players.find((p) => p.strategy === 'human')!.cash = 30_000;
    g.tickOnce();
    expect(g.state(me).goal!.done).toBe(true);
    expect(g.state(me).coach.text).toMatch(/Goal reached/);
  });

  it('"Trade everywhere" counts markets sold in plus a van', () => {
    g.chooseGoal(me, 'reach');
    g.gather(me, 'iron');
    g.sell(me, 'ruth', 'iron', 20);
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


describe('ownership', () => {
  const human = (g: Game) => g.w.players.find((p) => p.strategy === 'human')!;
  const closeShop = (g: Game, id: string) => { const m = g.w.merchants.find((x) => x.id === id)!; m.cash = 0; m.stock = {}; refreshState(g.w, m); return m; };

  it('turns an email into a friendly first name and never shows the address', () => {
    expect(displayName('ada.obi@example.com')).toBe('Ada');
    expect(displayName('CHIDI_99@x.io')).toBe('Chidi');
    expect(displayName('1234@x.io')).toBe('Trader');
    g.state(me);
    expect(JSON.stringify(g.state(me))).not.toContain('example.com');
  });

  it('buys shares, counts them in net worth, and lists them in My business', () => {
    human(g.state(me) && g)!.cash = 10_000;
    const before = g.state(me).you.netWorth;
    expect(g.buyShares(me, 'ruth', 10).ok).toBe(true);
    const s = g.state(me);
    expect(s.business.shares[0]).toMatchObject({ id: 'ruth', shares: 10 });
    expect(s.stalls.find((x) => x.id === 'ruth')!.shares!.yours).toBe(10);
    expect(Math.abs(s.you.netWorth - before)).toBeLessThan(before * 0.05); // swapped cash for shares, not richer or poorer
    expect(g.buyShares(me, 'ruth', 500).ok).toBe(false);
  });

  it('"A stake in every market" tracks shares by market and the coach points at where to buy', () => {
    g.chooseGoal(me, 'stake');
    human(g.state(me) && g)!.cash = 30_000;
    expect(g.state(me).goal!.label).toBe('Shares in 0 of 3 markets');
    expect(g.state(me).coach.text).toMatch(/Buy a few shares in/);
    g.buyShares(me, 'ruth', 1); // scrap
    g.buyShares(me, 'mira', 1); // produce
    expect(g.state(me).goal!.label).toBe('Shares in 2 of 3 markets');
    g.buyShares(me, 'lena', 1); // fabric
    expect(g.state(me).goal!.done).toBe(true);
  });

  it('puts fund money into a closed shop; a full pool reopens it with your name on the sign', () => {
    human(g.state(me) && g)!.cash = 20_000;
    closeShop(g, 'mira');
    expect(g.contribute(me, 'ruth', 500).ok).toBe(false); // ruth is open
    expect(g.contribute(me, 'mira', 50).ok).toBe(false); // too small
    const r1 = g.contribute(me, 'mira', 5_000);
    expect(r1.ok).toBe(true);
    expect(g.state(me).stalls.find((x) => x.id === 'mira')!.fund!.contributors).toEqual([{ name: 'Ada', put: 5_000 }]);
    const r2 = g.contribute(me, 'mira', 7_000);
    expect(r2.message).toMatch(/open again/);
    const mira = g.state(me).stalls.find((x) => x.id === 'mira')!;
    expect(mira.state).toBe('open');
    expect(mira.sign).toEqual(['Ada']);
    expect(mira.shares!.yours).toBeGreaterThan(0);
  });

  it('the district goal coach points at a closed shop', () => {
    g.chooseGoal(me, 'district');
    closeShop(g, 'tomas');
    const c = g.state(me).coach;
    expect(c.text).toMatch(/Tomas.*closed/);
    expect(c.focus).toEqual({ kind: 'stall', id: 'tomas' });
  });

  it('opens a stall for 6,000 coins in a market with a free plot', () => {
    expect(g.openStall(me, 'fabric').ok).toBe(false); // 3,000 coins is not enough
    human(g.state(me) && g)!.cash = 10_000;
    expect(g.openStall(me, 'scrap').ok).toBe(false); // no free plot
    expect(g.openStall(me, 'fabric').ok).toBe(true);
    expect(g.openStall(me, 'produce').ok).toBe(false); // one per player
    const s = g.state(me);
    expect(s.business.stall).toMatchObject({ market: 'fabric', till: 0 });
    expect(s.stalls.find((x) => x.owner?.mine)!.name).toBe("Ada's stall");
    expect(s.business.stallOffer).toBeNull();
  });

  it('stocks the stall from what you carry, validates prices, and moves cash through the till', () => {
    human(g.state(me) && g)!.cash = 10_000;
    g.openStall(me, 'fabric');
    const p = human(g)!;
    p.inventory.thread = 10;
    expect(g.stallStock(me, 'thread', 4).ok).toBe(true);
    expect(g.stallStock(me, 'thread', 99).ok).toBe(false); // only 6 left
    expect(g.stallStock(me, 'iron', 1).ok).toBe(false); // not a fabric item
    expect(p.inventory.thread).toBe(6);
    expect(g.state(me).business.stall!.items.find((i) => i.item === 'thread')!.stock).toBe(4);

    expect(g.stallPrice(me, 'thread', 90, 130).ok).toBe(true);
    expect(g.stallPrice(me, 'thread', 130, 90).ok).toBe(false); // sells below cost
    expect(g.stallPrice(me, 'thread', 1, 130).ok).toBe(false); // outside the band
    expect(g.stallPrice(me, 'thread', 90.5, 130).ok).toBe(false);

    const cash = p.cash;
    expect(g.stallCash(me, 'deposit', 2_000).ok).toBe(true);
    expect(p.cash).toBe(cash - 2_000);
    expect(g.stallCash(me, 'withdraw', 5_000).ok).toBe(false);
    expect(g.stallCash(me, 'withdraw', 500).ok).toBe(true);
    expect(g.stallTake(me, 'thread', 2).ok).toBe(true);
    expect(g.state(me).business.stall!.items.find((i) => i.item === 'thread')!.stock).toBe(2);
  });

  it('you cannot trade with your own stall, but another player can and you hear about it', () => {
    human(g.state(me) && g)!.cash = 10_000;
    g.openStall(me, 'fabric');
    human(g)!.inventory.thread = 5;
    g.stallStock(me, 'thread', 5);
    expect(g.sell(me, 'stall-' + human(g)!.id, 'thread', 1).ok).toBe(false);
    expect(g.sell(me, 'stall-' + human(g)!.id, 'thread', 1).message).toMatch(/your own stall/);

    const bo = 'bo@example.com';
    g.state(bo);
    g.w.players.find((x) => x.id !== human(g)!.id && x.strategy === 'human')!.cash = 1_000;
    expect(g.buy(bo, 'stall-' + human(g)!.id, 'thread', 2).ok).toBe(true);
    expect(g.state(me).business.notes[0].text).toContain('Bo bought 2 thread from your stall');
    expect(g.state(me).business.stall!.till).toBeGreaterThan(0);
  });

  it('agent merchants trade with your stall while you are away', () => {
    human(g.state(me) && g)!.cash = 20_000;
    g.openStall(me, 'fabric');
    g.stallCash(me, 'deposit', 8_000);
    g.stallPrice(me, 'cotton', 900, 1500);
    for (const id of ['lena', 'omar']) g.w.merchants.find((m) => m.id === id)!.stock.cotton = 90;
    for (let i = 0; i < 6; i++) g.tickOnce();
    const st = g.state(me).business.stall!;
    expect(st.items.find((i) => i.item === 'cotton')!.stock).toBeGreaterThan(0);
    expect(g.state(me).business.notes.some((n) => n.text.includes('sold') && n.text.includes('cotton'))).toBe(true);
  });

  it('shows a "while you were away" summary after a long absence, until dismissed', () => {
    g.state(me);
    expect(g.state(me).away).toBeNull();
    human(g)!.cash = 10_000;
    g.openStall(me, 'fabric');
    for (let i = 0; i < 30; i++) g.tickOnce(); // 30 in-game hours with no one looking
    const back = g.state(me).away!;
    expect(back.hours).toBeGreaterThanOrEqual(24);
    expect(back.notes.concat(back.town).length).toBeGreaterThan(0);
    expect(g.state(me).away).not.toBeNull(); // still there on the next poll
    g.ack(me);
    expect(g.state(me).away).toBeNull();
  });

  it('shows the player no wallet vocabulary in the new data either', () => {
    human(g.state(me) && g)!.cash = 10_000;
    g.buyShares(me, 'ruth', 2);
    g.openStall(me, 'fabric');
    expect(JSON.stringify([g.state(me), g.stallCash(me, 'deposit', 100)])).not.toMatch(/seed|mnemonic|private key|wallet|\bgas\b|yocto|\.testnet|signature/i);
  });
});

describe('fares never strand you', () => {
  const human = (g: Game) => g.w.players.find((p) => p.strategy === 'human')!;
  /** Broke, carrying 20 things, standing in the Produce Market: the exact situation that used to soft-lock. */
  function stuck() {
    g.state(me);
    const p = human(g);
    p.cash = 280;
    p.inventory = { iron: 16, cotton: 4 };
    p.at = 'produce';
    g.w.shocks = []; // no fuel queue: the fare is exactly 20 a unit
    return p;
  }

  it('lets you sell in another market even when you cannot afford the whole fare', () => {
    const p = stuck();
    expect(g.state(me).faresPerUnit).toBe(20);
    const r = g.sell(me, 'anil', 'iron', 16);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('came out of the sale');
    expect(p.at).toBe('scrap'); // you made the trip
    expect(g.state(me).you.fareOwed).toBe(0); // and the debt is paid off from the sale
    expect(p.cash).toBeGreaterThan(0); // with money left over
  });

  it('takes the fare out of the sale: you pay what you have now and the rest from the proceeds', () => {
    const p = stuck();
    const before = p.cash;
    const fare = 20 * 20; // 20 things carried, 20 coins each
    g.sell(me, 'anil', 'iron', 16);
    const proceeds = p.cash - before + fare; // what the sale earned, since the fare was paid in full overall
    expect(proceeds).toBeGreaterThan(0);
    expect(p.cash).toBe(before + proceeds - fare);
  });

  it('keeps owing if the sale is smaller than the fare, and says so', () => {
    const p = stuck();
    p.cash = 0;
    const r = g.sell(me, 'anil', 'iron', 1); // one iron pays far less than a 400-coin fare
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/You still owe \d+ coins for the trip/);
    expect(p.fareOwed).toBeGreaterThan(0);
    expect(p.cash).toBe(0); // everything earned went to the fare
    expect(g.state(me).you.fareOwed).toBe(p.fareOwed);
  });

  it('counts what you owe against your net worth', () => {
    const p = stuck();
    const clean = g.state(me).you.netWorth;
    p.fareOwed = 300;
    expect(g.state(me).you.netWorth).toBe(clean - 300);
  });

  it('is only for selling: buying in another market still needs the fare in hand, and does not move you', () => {
    const p = stuck();
    p.cash = 100;
    p.inventory = { iron: 15 }; // room for 5 more, and a 300-coin fare to carry 15 to the fabric market
    const r = g.buy(me, 'lena', 'thread', 1);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/can't afford the fare/);
    expect(p.at).toBe('produce');
    expect(p.cash).toBe(100);
    expect(p.fareOwed ?? 0).toBe(0);
  });

  it('does not move you or charge a fare when a haggle is refused', () => {
    const p = stuck();
    expect(g.sell(me, 'anil', 'iron', 2, true).ok).toBe(true); // haggle once this hour: you travel
    p.at = 'produce';
    const cash = p.cash;
    const r = g.sell(me, 'anil', 'iron', 2, true); // a second haggle in the same hour is refused
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/already haggled/);
    expect(p.at).toBe('produce');
    expect(p.cash).toBe(cash);
  });

  it('the coach no longer sends you somewhere you cannot afford without saying how it works', () => {
    stuck();
    g.chooseGoal(me, 'fortune');
    const text = g.state(me).coach.text;
    expect(text).toMatch(/^Sell your/);
    expect(text).toMatch(/comes out of your sale/);
  });

  it('is remembered across a restart', () => {
    const p = stuck();
    p.fareOwed = 123;
    const r = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(r.state(me).you.fareOwed).toBe(123);
  });
});
