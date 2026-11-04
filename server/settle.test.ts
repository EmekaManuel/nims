import { describe, it, expect } from 'vitest';
import { applyBatch, Balances, buildBatches, accountFor } from './settle';
import { runWeek } from '../sim/run';

const P = 'oja.testnet';

describe('settlement batches', () => {
  it('replaying the batches reproduces the sim state exactly, with no overdraws', () => {
    const w = runWeek(11);
    const batches = buildBatches(w.ledger, P);
    const bal: Balances = new Map();
    for (const b of batches) applyBatch(bal, b); // throws on any overdraw

    for (const m of w.merchants) {
      for (const [item, units] of Object.entries(m.stock)) {
        expect(bal.get(`${accountFor(m.id, P)}|${item}`) ?? 0, `${m.id} ${item}`).toBe(units);
      }
    }
    for (const p of w.players) {
      for (const [item, units] of Object.entries(p.inventory)) {
        expect(bal.get(`${accountFor(p.id, P)}|${item}`) ?? 0, `${p.id} ${item}`).toBe(units);
      }
    }
    // and the coins: every merchant and player holds exactly their cash on chain
    for (const m of w.merchants) expect(bal.get(`${accountFor(m.id, P)}|coins`) ?? 0, `${m.id} coins`).toBe(m.cash);
    for (const p of w.players) expect(bal.get(`${accountFor(p.id, P)}|coins`) ?? 0, `${p.id} coins`).toBe(p.cash);
  });

  it('keeps every batch under the leg cap and merges identical neighbours', () => {
    const w = runWeek(11);
    const batches = buildBatches(w.ledger, P);
    expect(batches.every((b) => b.transfers.length <= 100)).toBe(true);
    const raw = w.ledger.filter((e) => e.kind === 'transfer').length;
    expect(batches.reduce((n, b) => n + b.transfers.length, 0)).toBeLessThan(raw);
  });
});
