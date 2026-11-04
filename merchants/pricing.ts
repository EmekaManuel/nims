/**
 * Oja merchant pricing — the one readable pricing file (DESIGN.md §3).
 *
 * Rules of this file:
 *  - It is a PURE function: same inputs, same output. No clock, no RNG, no I/O.
 *  - The live game and the fast-forward sim both call `quote()`. Do not copy this
 *    economy logic anywhere else.
 *  - Personality only changes PARAMETERS (elasticity, demandWeight, margin,
 *    loyalty). The formula below is identical for every merchant.
 *  - Every term produces a plain-English line; the tooltip is those lines joined.
 *
 * The formula:
 *
 *   scarcity  = (targetStock / max(stock, 1)) ^ elasticity
 *   demand    = 1 + ((recentBuys - recentSells) / window) * demandWeight
 *   mid       = clamp(basePrice * scarcity * demand, basePrice*minMult, basePrice*maxMult)
 *   buyPrice  = mid * (1 - margin)   // what the merchant PAYS the player
 *   sellPrice = mid * (1 + margin)   // what the merchant CHARGES the player
 */

export type Personality = 'cautious' | 'greedy' | 'loyal';
export type MerchantState = 'open' | 'struggling' | 'closed';

/** The parameters a personality is allowed to change. Nothing else differs. */
export interface PricingParams {
  /** How hard prices react to stock vs. target (higher = jumpier). */
  elasticity: number;
  /** How hard prices react to recent buy/sell flow. */
  demandWeight: number;
  /** Spread either side of mid. */
  margin: number;
  /** 0..1 — how much of the margin a regular's reputation can shave off. */
  loyalty: number;
}

export const PERSONALITY_PARAMS: Record<Personality, PricingParams> = {
  // Higher margin, slow to move price.
  cautious: { elasticity: 0.35, demandWeight: 0.2, margin: 0.15, loyalty: 0 },
  // Reacts hard to scarcity.
  greedy: { elasticity: 0.9, demandWeight: 0.5, margin: 0.1, loyalty: 0 },
  // Standard reactions, but regulars get a discount.
  loyal: { elasticity: 0.6, demandWeight: 0.35, margin: 0.1, loyalty: 0.6 },
};

/** Price band: mid never leaves [basePrice*minMult, basePrice*maxMult]. */
export const MIN_MULT = 0.3;
export const MAX_MULT = 3;

export interface QuoteInput {
  itemName: string;
  basePrice: number;
  /** Units the merchant holds right now. */
  stock: number;
  /** Units the merchant likes to hold. */
  targetStock: number;
  cash: number;
  /** Below this the merchant stops buying. */
  cashFloor: number;
  /** Units players BOUGHT from the merchant in the last `window` in-game hours. */
  recentBuys: number;
  /** Units players SOLD to the merchant in the last `window` in-game hours. */
  recentSells: number;
  /** Length of the demand memory in in-game hours. */
  window: number;
  params: PricingParams;
  /** 0..1 player reputation with this merchant (only matters for loyal). */
  reputation?: number;
  /** Shock multiplier on demand for this item at this merchant (1 = no shock). */
  shockMult?: number;
  /** Shock label for the tooltip, if any. */
  shockNote?: string;
}

export interface Quote {
  mid: number;
  /** What the merchant pays the player per unit (₦). */
  buyPrice: number;
  /** What the merchant charges the player per unit (₦). */
  sellPrice: number;
  /** False when cash is under the floor or the merchant has no money at all. */
  willBuy: boolean;
  /** False when the merchant has nothing to sell. */
  willSell: boolean;
  /** Most units the merchant can afford to buy at buyPrice. */
  maxBuyUnits: number;
  /** Plain-English reasoning lines; the tooltip is these joined. */
  reasons: string[];
  tooltip: string;
}

const naira = (n: number) => `₦${Math.round(n)}`;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function quote(i: QuoteInput): Quote {
  const reasons: string[] = [];
  const { params: p } = i;

  // 1. Scarcity: holding less than I want → dearer; holding more → cheaper.
  const scarcity = Math.pow(i.targetStock / Math.max(i.stock, 1), p.elasticity);
  if (i.stock > i.targetStock * 1.2) {
    reasons.push(`I'm holding ${i.stock} ${i.itemName} and I only want ${i.targetStock}, so I'll pay less.`);
  } else if (i.stock < i.targetStock * 0.8) {
    reasons.push(`I only have ${i.stock} ${i.itemName} and I like to keep ${i.targetStock}, so it's dear.`);
  } else {
    reasons.push(`My ${i.itemName} stock (${i.stock}) is about where I want it (${i.targetStock}).`);
  }

  // 2. Demand memory: net flow over the last `window` hours.
  //    Buys = players bought FROM me (demand up). Sells = players sold TO me (supply in).
  const net = i.recentBuys - i.recentSells;
  const demand = Math.max(0.1, 1 + (net / i.window) * p.demandWeight) * (i.shockMult ?? 1);
  if (net > 0) {
    reasons.push(`People bought ${i.recentBuys} ${i.itemName} off me recently (and sold me only ${i.recentSells}), so it's moving fast.`);
  } else if (net < 0) {
    reasons.push(`People sold me ${i.recentSells} ${i.itemName} recently (and bought only ${i.recentBuys}), so I'm well supplied.`);
  }
  if (i.shockNote) reasons.push(i.shockNote);

  // 3. Mid price, clamped so it never goes absurd.
  const rawMid = i.basePrice * scarcity * demand;
  const lo = i.basePrice * MIN_MULT;
  const hi = i.basePrice * MAX_MULT;
  const mid = clamp(rawMid, lo, hi);
  if (rawMid < lo) reasons.push(`I won't go below ${naira(lo)} no matter what.`);
  if (rawMid > hi) reasons.push(`I won't go above ${naira(hi)} no matter what.`);

  // 4. Margin (reputation shaves it for loyal merchants).
  const rep = clamp(i.reputation ?? 0, 0, 1);
  const margin = p.margin * (1 - p.loyalty * rep);
  if (p.loyalty > 0 && rep > 0) reasons.push(`You're a regular, so I'm trimming my margin.`);

  const buyPrice = Math.max(1, Math.round(mid * (1 - margin)));
  const sellPrice = Math.max(buyPrice + 1, Math.round(mid * (1 + margin)));

  // 5. Cash floor: under it, I stop buying.
  const willBuy = i.cash >= i.cashFloor && i.cash >= buyPrice;
  const willSell = i.stock > 0;
  if (!willBuy) reasons.push(`My cash is low (${naira(i.cash)}), so I've stopped buying ${i.itemName}.`);
  if (!willSell) reasons.push(`I'm out of ${i.itemName}.`);

  reasons.push(`I'll pay ${naira(buyPrice)} and sell at ${naira(sellPrice)} (usual ${naira(i.basePrice)}).`);

  return {
    mid,
    buyPrice,
    sellPrice,
    willBuy,
    willSell,
    maxBuyUnits: willBuy ? Math.floor(i.cash / buyPrice) : 0,
    reasons,
    tooltip: reasons.join(' '),
  };
}

/**
 * Merchant state (DESIGN.md §3):
 *  - cash == 0 and nothing to sell → closed (investable via an ajo pool)
 *  - cash under the floor           → struggling (stops buying)
 *  - otherwise                      → open
 */
export function merchantState(cash: number, cashFloor: number, totalStockUnits: number): MerchantState {
  if (cash <= 0 && totalStockUnits <= 0) return 'closed';
  if (cash < cashFloor) return 'struggling';
  return 'open';
}

// ---------------------------------------------------------------------------------------------
// Player-owned stalls
//
// A player sets their own buy and sell prices, so there is no formula to run: the price IS the
// player's choice. It still produces the same Quote shape (and a tooltip line) so every other part
// of the game treats a player's stall like any merchant's. Prices stay inside the same band that
// the merchants' own mid price must respect, so nobody can post an absurd number.
// ---------------------------------------------------------------------------------------------

/** A player's price must sit inside [basePrice*MIN_MULT, basePrice*MAX_MULT]. */
export function clampPlayerPrice(price: number, basePrice: number): number {
  return Math.round(clamp(price, basePrice * MIN_MULT, basePrice * MAX_MULT));
}

export interface PlayerQuoteInput {
  itemName: string;
  basePrice: number;
  /** What the owner pays sellers. */
  buyPrice: number;
  /** What the owner charges buyers. */
  sellPrice: number;
  stock: number;
  cash: number;
  ownerName: string;
}

export function playerQuote(i: PlayerQuoteInput): Quote {
  const buyPrice = clampPlayerPrice(i.buyPrice, i.basePrice);
  const sellPrice = Math.max(buyPrice, clampPlayerPrice(i.sellPrice, i.basePrice));
  const willBuy = i.cash >= buyPrice;
  const willSell = i.stock > 0;
  const reasons = [`${i.ownerName} sets these prices by hand.`];
  if (!willBuy) reasons.push(`The till is down to ${naira(i.cash)}, so ${i.ownerName} can't buy ${i.itemName} right now.`);
  if (!willSell) reasons.push(`${i.ownerName} is out of ${i.itemName}.`);
  reasons.push(`Pays ${naira(buyPrice)}, sells at ${naira(sellPrice)} (usual ${naira(i.basePrice)}).`);
  return {
    mid: (buyPrice + sellPrice) / 2,
    buyPrice,
    sellPrice,
    willBuy,
    willSell,
    maxBuyUnits: willBuy ? Math.floor(i.cash / buyPrice) : 0,
    reasons,
    tooltip: reasons.join(' '),
  };
}
