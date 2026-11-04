import { describe, it, expect } from 'vitest';
import { MerchantAgent } from './agent';

const agent = (held: Record<string, number>) => new MerchantAgent('mira', 'mira.oja.testnet', (t) => held[t] ?? 0);

describe('merchant agent', () => {
  it('approves legs it can cover and tracks what it has already promised', async () => {
    const r = await agent({ iron: 10 }).review([
      { to: 'a', tokenId: 'iron', amount: 6 },
      { to: 'b', tokenId: 'iron', amount: 6 },
      { to: 'c', tokenId: 'iron', amount: 4 },
    ]);
    expect(r.approved.map((l) => l.to)).toEqual(['a', 'c']);
    expect(r.refused[0].reason).toContain('only hold 4 iron');
  });

  it('refuses nonsense legs', async () => {
    const r = await agent({ iron: 10 }).review([
      { to: 'a', tokenId: 'iron', amount: 0 },
      { to: 'a', tokenId: 'iron', amount: 1.5 },
      { to: 'mira.oja.testnet', tokenId: 'iron', amount: 1 },
      { to: 'a', tokenId: 'lace', amount: 1 },
    ]);
    expect(r.approved).toHaveLength(0);
    expect(r.refused).toHaveLength(4);
  });
});
