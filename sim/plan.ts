import { PERSONALITY_PARAMS, type PricingParams } from '../merchants/pricing';
import type { Item, Merchant } from './world';

/**
 * A merchant's plan for the day: the merchant decides, the game bounds it.
 *
 * Each in-game day a merchant (on the live server, through NEAR AI Cloud) chooses, for each good it trades, whether to
 * hold more, less or the usual stock, and whether to price with a wider or narrower margin than its personality's.
 * Those choices are words, not numbers: each maps to a fixed, small adjustment here, so a plan can steer a merchant
 * but never break the economy. The pricing formula itself (merchants/pricing.ts) does not change; it is given the
 * merchant's chosen target stock and margin.
 *
 * A merchant with no plan (the fast-forward sim, a server without NEAR AI, or a reply that failed its checks) behaves
 * exactly as before.
 */
export type StockChoice = 'more' | 'less' | 'same';
export type MarginChoice = 'wider' | 'narrower' | 'same';

export interface MerchantPlan {
  /** Game day the plan was made on. */
  day: number;
  stock: Partial<Record<Item, StockChoice>>;
  margin: MarginChoice;
  /** The merchant's reason, in their own words (checked), or a plain one built from the choices. */
  reason: string;
}

/** How far a choice moves the merchant from its usual settings. Small on purpose. */
export const STOCK_MULT: Record<StockChoice, number> = { more: 1.3, less: 0.75, same: 1 };
export const MARGIN_STEP: Record<MarginChoice, number> = { wider: 0.03, narrower: -0.03, same: 0 };
export const MARGIN_MIN = 0.05;
export const MARGIN_MAX = 0.25;

/** The stock the merchant aims to hold of an item today: its usual target, adjusted by its plan. */
export function targetOf(m: Merchant, item: Item): number {
  const base = m.target[item] ?? 0;
  const choice = m.plan?.stock[item];
  return choice ? Math.round(base * STOCK_MULT[choice]) : base;
}

/** The pricing parameters the merchant uses today: its personality's, with the margin it chose (always within bounds). */
export function paramsOf(m: Merchant): PricingParams {
  const p = PERSONALITY_PARAMS[m.personality];
  if (!m.plan || m.plan.margin === 'same') return p;
  return { ...p, margin: Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, p.margin + MARGIN_STEP[m.plan.margin])) };
}

/** A plain description of a plan, used when the merchant's own words did not pass the checks. */
export function describePlan(stock: Partial<Record<Item, StockChoice>>, margin: MarginChoice): string {
  const more = Object.entries(stock).filter(([, c]) => c === 'more').map(([i]) => i);
  const less = Object.entries(stock).filter(([, c]) => c === 'less').map(([i]) => i);
  const parts: string[] = [];
  if (more.length) parts.push(`holding more ${more.join(' and ')}`);
  if (less.length) parts.push(`holding less ${less.join(' and ')}`);
  if (margin !== 'same') parts.push(margin === 'wider' ? 'pricing with a wider margin' : 'pricing with a narrower margin');
  if (!parts.length) return 'Keeping to my usual stock and prices today.';
  const s = parts.join(', ');
  return `Today I'm ${s}.`;
}

/** Whether two plans steer the merchant the same way (the reason aside). */
export function samePlan(a: MerchantPlan | undefined, b: MerchantPlan): boolean {
  if (!a || a.margin !== b.margin) return false;
  const items = new Set([...Object.keys(a.stock), ...Object.keys(b.stock)]);
  for (const i of items) if ((a.stock[i as Item] ?? 'same') !== (b.stock[i as Item] ?? 'same')) return false;
  return true;
}
