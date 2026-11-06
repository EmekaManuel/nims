/**
 * Chart plumbing for the fast-forward dashboard: colours, scales, ticks and time labels.
 *
 * Colours are the validated reference palette (run through validate_palette.js against the paper
 * surface #fbfaf3: all hard checks pass; slots 3-5 sit below 3:1 contrast, which obliges visible
 * direct labels and a table view, and both ship). Slots are assigned to ENTITIES in a fixed order and
 * never cycled, so an item or a shop keeps its colour whatever else is on screen.
 */
import type { Item } from '../api';

/** Categorical slots 1..8 (light mode). The order is the colour-vision-safety mechanism. */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;

/** Each good keeps one colour everywhere. Consecutive slots within a market, so neighbours were validated together. */
const ITEM_SLOT: Record<Item, number> = { tomatoes: 0, pepper: 1, flour: 2, cotton: 3, lace: 4, thread: 5, iron: 6, 'copper wire': 7 };
export const itemColor = (item: Item) => SERIES[ITEM_SLOT[item]];

/** Reserved status colours: used only where the colour MEANS closed (critical) or reopened (good), always with an icon and label. */
export const STATUS = { good: '#0ca30c', critical: '#d03b3b' } as const;

/** "Round" tick values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, target = 5): number[] {
  const span = Math.max(1e-9, hi - lo);
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

/** Path through (x(i), y(v)) for i up to `upto`, with gaps for missing values. */
export function linePath(values: number[], x: (i: number) => number, y: (v: number) => number, upto = values.length - 1): string {
  let d = '';
  for (let i = 0; i <= Math.min(upto, values.length - 1); i++) d += `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(values[i]).toFixed(1)}`;
  return d;
}

export const dayOf = (hour: number) => Math.floor(hour / 24) + 1;
export const clock = (hour: number) => `${String(hour % 24).padStart(2, '0')}:00`;
export const when = (hour: number) => `Day ${dayOf(hour)}, ${clock(hour)}`;

/** "1,234 coins". */
export const coins = (n: number) => `${Math.round(n).toLocaleString('en-US')} coins`;
/** Axis style: 1,234 under 10,000, 12K above. No unit on the axis; the chart's heading says coins. */
export const compactCoins = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K` : Math.round(n).toLocaleString('en-US'));

export const SHOCK_LABEL: Record<string, string> = { rain: 'Rain', 'fuel queue': 'Fuel queue', 'festive season': 'Festive season' };
