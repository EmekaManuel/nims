/** A player's rank, from net worth. Gives a sense of progress between goals (like an XP bar). */
export const RANKS = [
  { min: 0, title: 'Street vendor' },
  { min: 6_000, title: 'Stall keeper' },
  { min: 14_000, title: 'Trader' },
  { min: 30_000, title: 'Merchant' },
  { min: 70_000, title: 'Tycoon' },
] as const;

export interface Rank {
  level: number;
  title: string;
  /** 0..1 of the way to the next rank (1 at the top). */
  progress: number;
  next?: { title: string; at: number };
}

export function rankOf(worth: number): Rank {
  let i = 0;
  while (i + 1 < RANKS.length && worth >= RANKS[i + 1].min) i++;
  const cur = RANKS[i];
  const nxt = RANKS[i + 1];
  return {
    level: i + 1,
    title: cur.title,
    progress: nxt ? Math.max(0, Math.min(1, (worth - cur.min) / (nxt.min - cur.min))) : 1,
    next: nxt ? { title: nxt.title, at: nxt.min } : undefined,
  };
}
