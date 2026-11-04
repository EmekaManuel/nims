import { describe, it, expect } from 'vitest';
import { applyBatch, Balances, accountFor } from './settle';
import { buildAgentBatches, planRounds } from './rounds';
import { runWeek } from '../sim/run';

const P = 'oja.testnet';
const leg = (from: string, to: string, tokenId: string, amount: number) => ({ from, to, tokenId, amount });

describe('round scheduler', () => {
  it('delays a leg until its sender has received the items', () => {
    const bal: Balances = new Map([['a|iron', 5]]);
    // b can only sell on what a sends it, even though b's leg is listed second.
    const rounds = planRounds([leg('a', 'b', 'iron', 5), leg('b', 'c', 'iron', 5)], bal);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].map((c) => c.signer)).toEqual(['a']);
    expect(rounds[1].map((c) => c.signer)).toEqual(['b']);
    expect(bal.get('c|iron')).toBe(5);
  });

  it('puts independent signers in the same round', () => {
    const bal: Balances = new Map([['a|iron', 5], ['b|lace', 2]]);
    const rounds = planRounds([leg('a', 'x', 'iron', 5), leg('b', 'y', 'lace', 2)], bal);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toHaveLength(2);
  });

  it("keeps one sender's legs in order and never overdraws them", () => {
    const bal: Balances = new Map([['a|iron', 6], ['z|iron', 2]]);
    const rounds = planRounds([leg('a', 'x', 'iron', 4), leg('a', 'y', 'iron', 4), leg('z', 'a', 'iron', 2)], bal);
    // Round 1: a sends 4 to x, z sends 2 to a. Round 2: a (now holding 4) sends 4 to y.
    expect(rounds).toHaveLength(2);
    expect(rounds[1]).toEqual([{ signer: 'a', legs: [leg('a', 'y', 'iron', 4)] }]);
    expect([bal.get('x|iron'), bal.get('y|iron'), bal.get('a|iron')]).toEqual([4, 4, 0]);
  });

  it('refuses a ledger that can never be paid for', () => {
    expect(() => planRounds([leg('a', 'b', 'iron', 1)], new Map())).toThrow(/Cannot schedule/);
  });

  it('a whole sim week settles with every signer paying its own legs, in ANY order within a round', () => {
    const w = runWeek(11);
    const batches = buildAgentBatches(w.ledger, P);
    const bal: Balances = new Map();
    for (const b of batches) {
      applyBatch(bal, { mints: b.mints, transfers: [] });
      for (const round of b.rounds) {
        // Reverse order proves signers in a round don't depend on each other.
        for (const call of [...round].reverse()) {
          expect(call.legs.every((l) => l.from === call.signer)).toBe(true);
          applyBatch(bal, { mints: [], transfers: call.legs }); // throws on any overdraw
        }
      }
    }
    for (const m of w.merchants)
      for (const [item, units] of Object.entries(m.stock)) expect(bal.get(`${accountFor(m.id, P)}|${item}`) ?? 0, `${m.id} ${item}`).toBe(units);
    for (const p of w.players)
      for (const [item, units] of Object.entries(p.inventory)) expect(bal.get(`${accountFor(p.id, P)}|${item}`) ?? 0, `${p.id} ${item}`).toBe(units);
    for (const m of w.merchants) expect(bal.get(`${accountFor(m.id, P)}|coins`) ?? 0, `${m.id} coins`).toBe(m.cash);
    for (const p of w.players) expect(bal.get(`${accountFor(p.id, P)}|coins`) ?? 0, `${p.id} coins`).toBe(p.cash);
  });
});
