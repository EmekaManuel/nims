/**
 * A player's look: picks from fixed palettes (the same ones the 3D town draws people with), so a stored avatar is a
 * handful of small numbers and can never inject anything into the page.
 */
export const AVATAR_LIMITS = { skin: 6, hair: 6, shirt: 8 } as const;
export type HairStyle = 'short' | 'long' | 'bald';
export type Hat = 'none' | 'cap';

export interface Avatar {
  skin: number;
  hair: number;
  style: HairStyle;
  shirt: number;
  hat: Hat;
}

const STYLES: readonly HairStyle[] = ['short', 'long', 'bald'];
const HATS: readonly Hat[] = ['none', 'cap'];
const inRange = (n: unknown, max: number): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < max;

/** The avatar if every part is one of the allowed picks, otherwise null. */
export function parseAvatar(raw: unknown): Avatar | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (!inRange(a.skin, AVATAR_LIMITS.skin) || !inRange(a.hair, AVATAR_LIMITS.hair) || !inRange(a.shirt, AVATAR_LIMITS.shirt)) return null;
  if (!STYLES.includes(a.style as HairStyle) || !HATS.includes(a.hat as Hat)) return null;
  return { skin: a.skin, hair: a.hair, style: a.style as HairStyle, shirt: a.shirt, hat: a.hat as Hat };
}
