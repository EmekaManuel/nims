import { describe, it, expect } from 'vitest';
import { newPlayer } from './players';
import { buyShares, tick } from './engine';
import { closingHour, isRegular, propose, seatsOf, tally, vote, MERCHANT_SEAT } from './council';
import { COINS, createWorld, MarketId, Player, World } from './world';

const nobody = () => undefined;
/** Replay the coin ledger: every account's cash must equal what the ledger says, so nothing moved off the books. */
function expectLedgerMatches(w: World) {
  const bal = new Map<string, number>();
  for (const e of w.ledger) {
    if (e.item !== COINS) continue;
    if (e.kind === 'transfer') bal.set(e.from!, (bal.get(e.from!) ?? 0) - e.units);
    bal.set(e.to, (bal.get(e.to) ?? 0) + e.units);
  }
  for (const m of w.merchants) expect(bal.get(m.id) ?? 0, m.id).toBe(m.cash);
  for (const p of w.players) expect(bal.get(p.id) ?? 0, p.id).toBe(p.cash);
}
function setup() {
  const a = newPlayer('ada', 'human', 2_000_000);
  const b = newPlayer('bo', 'human', 2_000_000);
  const w = createWorld(4, [a, b]);
  const stake = (p: Player, id: string, n: number) => buyShares(w, p, w.merchants.find((m) => m.id === id)!, n);
  return { w, a, b, stake };
}
/** Run the world to the end of the in-game day (the hour the council counts votes). */
const toDayEnd = (w: World) => { while (w.hour % 24 !== 23) tick(w, nobody); tick(w, nobody); };

describe('town council', () => {
  it('trading in a market gives you a seat there with no shares, and shares add to it', () => {
    const { w, a, stake } = setup();
    expect(isRegular(w, 'fabric', 'ada')).toBe(false);
    a.reputation.omar = 0.002; // what one completed trade with Omar does
    expect(isRegular(w, 'fabric', 'ada')).toBe(true);
    expect(seatsOf(w, 'fabric', 'ada')).toBe(1);
    expect(seatsOf(w, 'produce', 'ada')).toBe(0); // only the market you traded in
    stake(a, 'omar', 4);
    expect(seatsOf(w, 'fabric', 'ada')).toBe(5);
  });

  it('a regular with no shares can propose and vote, and a rent cut they back passes', () => {
    const { w, a } = setup();
    a.reputation.lena = 0.01;
    expect('ok' in propose(w, a, 'Ada', 'fabric', 'rent', 'low')).toBe(true); // the merchants back a cut
    expect('ok' in vote(w, a, 'fabric', true)).toBe(true);
    toDayEnd(w);
    expect(w.council.fabric.rent).toBe('low');
  });

  it('one seat cannot push through a rise the merchants oppose', () => {
    const { w, a } = setup();
    a.reputation.lena = 0.01;
    propose(w, a, 'Ada', 'fabric', 'rent', 'high');
    toDayEnd(w);
    expect(w.council.fabric.rent).toBe('normal');
  });

  it('you need a seat (trade there, or hold a share) to propose or vote', () => {
    const { w, a } = setup();
    expect(propose(w, a, 'Ada', 'fabric', 'rent', 'low')).toMatchObject({ error: expect.stringContaining('Trade in the Fabric Market') });
    expect(vote(w, a, 'fabric', true)).toMatchObject({ error: expect.any(String) });
  });

  it('refuses nonsense: unknown choices, no change, a second open vote', () => {
    const { w, a, stake } = setup();
    stake(a, 'omar', 10);
    expect('error' in propose(w, a, 'Ada', 'fabric', 'rent', 'sky-high')).toBe(true);
    expect('error' in propose(w, a, 'Ada', 'fabric', 'rent', 'normal')).toBe(true);
    expect('ok' in propose(w, a, 'Ada', 'fabric', 'rent', 'low')).toBe(true);
    expect('error' in propose(w, a, 'Ada', 'fabric', 'payout', 'lean')).toBe(true);
  });

  it('seats are your shares across the market, and the merchants hold a seat each', () => {
    const { w, a, stake } = setup();
    stake(a, 'omar', 10);
    stake(a, 'lena', 5);
    expect(seatsOf(w, 'fabric', 'ada')).toBe(15);
    expect(seatsOf(w, 'produce', 'ada')).toBe(0);
    propose(w, a, 'Ada', 'fabric', 'rent', 'high'); // merchants oppose a rise
    const t = tally(w, 'fabric', w.council.fabric.proposal!);
    const seated = w.merchants.filter((m) => m.market === 'fabric').length;
    expect(t.yes).toBe(15);
    expect(t.no).toBe(seated * MERCHANT_SEAT);
    expect(t.merchants.against).toBe(seated);
  });

  it('a vote cannot close early: it stays open at least six hours and ends at day end', () => {
    expect(closingHour(0)).toBe(23);
    expect(closingHour(20)).toBe(47); // too close to tonight, so tomorrow
    expect(closingHour(17)).toBe(23);
  });

  it('a cut that shareholders back passes, and merchants then pay less rent', () => {
    const { w, a, stake } = setup();
    stake(a, 'omar', 30);
    propose(w, a, 'Ada', 'fabric', 'rent', 'low'); // merchants back a cut too
    toDayEnd(w);
    expect(w.council.fabric.rent).toBe('low');
    expect(w.council.fabric.proposal).toBeUndefined();
    expect(w.events.some((e) => e.type === 'council' && /voted to set stall rent to low/.test(e.text))).toBe(true);
    expect(a.notes.some((n) => /voted to set stall rent to low/.test(n.text))).toBe(true);
  });

  it('a rise the merchants oppose needs more than a handful of shares', () => {
    const { w, a, stake } = setup();
    stake(a, 'omar', 3); // 3 vs. three merchant seats
    propose(w, a, 'Ada', 'fabric', 'rent', 'high');
    toDayEnd(w);
    expect(w.council.fabric.rent).toBe('normal');
    expect(w.events.some((e) => /turned down/.test(e.text))).toBe(true);
  });

  it('shareholders can outvote the merchants together, and can change their vote', () => {
    const { w, a, b, stake } = setup();
    stake(a, 'omar', 20);
    stake(b, 'lena', 20);
    propose(w, a, 'Ada', 'fabric', 'rent', 'high');
    vote(w, b, 'fabric', false);
    expect(tally(w, 'fabric', w.council.fabric.proposal!).players).toEqual({ yes: 20, no: 20 });
    vote(w, b, 'fabric', true);
    toDayEnd(w);
    expect(w.council.fabric.rent).toBe('high');
  });

  it('a tie fails', () => {
    const { w, a, b, stake } = setup();
    stake(a, 'omar', 10);
    stake(b, 'lena', 10);
    propose(w, a, 'Ada', 'fabric', 'payout', 'generous'); // merchants oppose: 24 against
    vote(w, b, 'fabric', false);
    toDayEnd(w);
    expect(w.council.fabric.payout).toBe('normal');
  });

  it('high rent moves coins from the merchants to the shareholders, and every coin stays on the ledger', () => {
    const { w, a, stake } = setup();
    stake(a, 'omar', 40);
    stake(a, 'lena', 40);
    stake(a, 'mira', 1); // a different market, to show it is untouched
    w.council.fabric.rent = 'high';
    const cash0 = a.cash;
    toDayEnd(w);
    expect(w.council.fabric.levy).toBeLessThan(100); // paid out, only rounding left
    expect(a.cash).toBeGreaterThan(cash0);
    expect(a.notes.some((n) => /rent levy paid you/.test(n.text))).toBe(true);
    expect(w.council.produce.levy).toBe(0);
    expectLedgerMatches(w);
  });

  it('a generous payout pays shareholders more than a lean one, from the same day', () => {
    const cashAfter = (payout: 'lean' | 'normal' | 'generous') => {
      const { w, a, stake } = setup();
      stake(a, 'omar', 40);
      w.council.fabric.payout = payout;
      toDayEnd(w);
      expectLedgerMatches(w);
      return a.cash;
    };
    const [lean, normal, generous] = [cashAfter('lean'), cashAfter('normal'), cashAfter('generous')];
    expect(lean).toBeLessThan(normal);
    expect(normal).toBeLessThan(generous);
  });

  it('normal rules behave exactly as the game did before the council', () => {
    const { w } = setup();
    const ids = Object.keys(w.council) as MarketId[];
    for (const id of ids) expect(w.council[id]).toEqual({ rent: 'normal', payout: 'normal', levy: 0 });
    toDayEnd(w);
    for (const id of ids) expect(w.council[id].levy).toBe(0);
  });
});
