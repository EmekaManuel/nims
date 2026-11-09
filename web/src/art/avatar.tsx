/**
 * Avatars: a player's chosen look, as picks from fixed palettes. The 3D town draws people from the same palettes,
 * so the figure in the creator, on the town board and in the town all match. (server/game/avatar.ts checks the picks.)
 */
export type HairStyle = 'short' | 'long' | 'bald';
export interface Avatar { skin: number; hair: number; style: HairStyle; shirt: number; hat: 'none' | 'cap' }

export const SKIN = ['#f1c9a5', '#e0a98a', '#c68863', '#a56b45', '#7b4a2e', '#5a3622'];
export const HAIR = ['#1c1410', '#3a2618', '#6b4423', '#b8862b', '#8a8a8a', '#a1311f'];
export const SHIRTS = ['#1d63d6', '#d6336c', '#2f9e5f', '#f08c00', '#7b4de0', '#0b8f8f', '#c92a2a', '#3d3d4a'];
export const STYLES: HairStyle[] = ['short', 'long', 'bald'];

/** The look a player has before choosing one: the game's usual blue trader. */
export const DEFAULT_AVATAR: Avatar = { skin: 2, hair: 0, style: 'short', shirt: 0, hat: 'cap' };

/** A flat drawing of an avatar: for the creator's preview, the town board and anywhere a small figure is needed. */
export function AvatarFigure({ a, size = 64, title }: { a: Avatar; size?: number; title?: string }) {
  const skin = SKIN[a.skin] ?? SKIN[2];
  const hair = HAIR[a.hair] ?? HAIR[0];
  const shirt = SHIRTS[a.shirt] ?? SHIRTS[0];
  return (
    <svg className="avatar-fig" width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <circle cx="32" cy="32" r="31" fill="#e8eef8" />
      {/* body */}
      <path d="M12 64c0-12 9-20 20-20s20 8 20 20z" fill={shirt} />
      <rect x="28" y="38" width="8" height="8" rx="3" fill={skin} />
      {/* long hair falls behind the head */}
      {a.style === 'long' && <path d="M17 30c0-11 7-18 15-18s15 7 15 18v13c-4 2-9 3-15 3s-11-1-15-3z" fill={hair} />}
      {/* head */}
      <circle cx="32" cy="28" r="12.5" fill={skin} />
      {a.style !== 'bald' && a.hat === 'none' && <path d="M19.5 27c0-8 5.6-13 12.5-13s12.5 5 12.5 13c-3-4-7.5-5.5-12.5-5.5s-9.5 1.5-12.5 5.5z" fill={hair} />}
      {a.hat === 'cap' && (
        <g fill={shirt} style={{ filter: 'brightness(.72)' }}>
          <path d="M19 25c0-7 5.8-12 13-12s13 5 13 12z" />
          <rect x="28" y="22.5" width="22" height="4" rx="2" />
        </g>
      )}
      <circle cx="27.5" cy="29" r="1.6" fill="#14101a" />
      <circle cx="36.5" cy="29" r="1.6" fill="#14101a" />
      <path d="M28.5 33.5q3.5 2.6 7 0" stroke="#8a3b3b" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
