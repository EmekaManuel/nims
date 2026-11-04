/**
 * A merchant agent owns its wallet and signs its own settlements. Before it signs anything it
 * checks the batch against what it actually holds, and refuses legs it cannot cover. The chain
 * enforces the same rule, but an agent that checks first never wastes a transaction on a bad batch.
 */
export interface Leg {
  to: string;
  tokenId: string;
  amount: number;
}

export interface Review {
  approved: Leg[];
  refused: { leg: Leg; reason: string }[];
}

export class MerchantAgent {
  constructor(
    readonly id: string,
    readonly accountId: string,
    /** How many units of a token this merchant holds (injected: books in the sim, a chain view live). */
    private holdings: (tokenId: string) => number | Promise<number>,
  ) {}

  /** Approve legs in order while the merchant can still cover them. */
  async review(legs: Leg[]): Promise<Review> {
    const left = new Map<string, number>();
    const out: Review = { approved: [], refused: [] };
    for (const leg of legs) {
      if (!(leg.amount > 0) || !Number.isInteger(leg.amount)) {
        out.refused.push({ leg, reason: 'amount must be a positive whole number' });
        continue;
      }
      if (leg.to === this.accountId) {
        out.refused.push({ leg, reason: 'cannot send to myself' });
        continue;
      }
      if (!left.has(leg.tokenId)) left.set(leg.tokenId, await this.holdings(leg.tokenId));
      const have = left.get(leg.tokenId)!;
      if (have < leg.amount) {
        out.refused.push({ leg, reason: `I only hold ${have} ${leg.tokenId}` });
        continue;
      }
      left.set(leg.tokenId, have - leg.amount);
      out.approved.push(leg);
    }
    return out;
  }
}
