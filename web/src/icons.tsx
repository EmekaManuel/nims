import type { Item } from './api';

/**
 * Hand-drawn icon set (one ink outline, flat market colours). The sprite is mounted once in <App/>;
 * <ItemIcon/> and <VehicleIcon/> reference it with <use>, so a stall can draw dozens of crates cheaply.
 */
const INK = '#2a1a12';

export const itemId = (item: Item | string) => `i-${item.replace(' ', '-')}`;

export function IconSprite() {
  const o = { stroke: INK, strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {/* ---- goods (32 x 32) ---- */}
        <symbol id="i-tomatoes" viewBox="0 0 32 32">
          <circle cx="16" cy="18" r="10" fill="#d93b2b" {...o} />
          <path d="M9 11c3 1 5 0 7-2 2 2 4 3 7 2-1 3-4 4-7 3-3 1-6 0-7-3z" fill="#2f8f4e" {...o} />
          <circle cx="12" cy="17" r="2" fill="#fff" opacity=".4" />
        </symbol>
        <symbol id="i-pepper" viewBox="0 0 32 32">
          <path d="M9 10c5-3 12 0 14 7 1 5-2 10-9 13 3-5 2-9-1-12-2-2-4-4-4-8z" fill="#e24a22" {...o} />
          <path d="M9 10c-1-3 1-5 4-5" fill="none" stroke="#2f8f4e" strokeWidth="3" strokeLinecap="round" />
          <path d="M14 13c3 1 5 4 5 7" fill="none" stroke="#fff" strokeWidth="1.6" opacity=".45" strokeLinecap="round" />
        </symbol>
        <symbol id="i-garri" viewBox="0 0 32 32">
          <path d="M9 9 7 27c0 2 3 3 9 3s9-1 9-3l-2-18z" fill="#f3e2ad" {...o} />
          <path d="M9 9c2-3 4-4 7-4s5 1 7 4c-2 1-4 1-7 1s-5 0-7-1z" fill="#e6cd85" {...o} />
          <path d="M11 19c3-2 7-2 10 0" fill="none" stroke="#b99a4a" strokeWidth="1.6" strokeLinecap="round" />
        </symbol>
        <symbol id="i-ankara" viewBox="0 0 32 32">
          <rect x="4" y="7" width="22" height="18" rx="4" fill="#1f4fc4" {...o} />
          <ellipse cx="26" cy="16" rx="3" ry="9" fill="#f2a900" {...o} />
          <circle cx="10" cy="13" r="2.4" fill="#f2a900" />
          <circle cx="17" cy="17" r="2.4" fill="#d6336c" />
          <circle cx="11" cy="21" r="1.8" fill="#fff" />
          <circle cx="20" cy="11" r="1.6" fill="#fff" />
        </symbol>
        <symbol id="i-lace" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="11.5" fill="#fffaf0" {...o} />
          <circle cx="16" cy="16" r="7.5" fill="none" stroke="#a89a82" strokeWidth="1.6" strokeDasharray="2 2.2" />
          <circle cx="16" cy="16" r="2.6" fill="#a89a82" />
        </symbol>
        <symbol id="i-thread" viewBox="0 0 32 32">
          <rect x="7" y="5" width="18" height="5" rx="1.5" fill="#d6a15f" {...o} />
          <rect x="7" y="22" width="18" height="5" rx="1.5" fill="#d6a15f" {...o} />
          <rect x="9" y="10" width="14" height="12" fill="#d6336c" {...o} />
          <path d="M9 14h14M9 18h14" stroke="#8f1d49" strokeWidth="1.4" />
        </symbol>
        <symbol id="i-iron" viewBox="0 0 32 32">
          <rect x="3" y="19" width="23" height="7" rx="1.5" fill="#7a8996" {...o} />
          <rect x="8" y="12" width="22" height="7" rx="1.5" fill="#92a1ad" {...o} />
          <rect x="4" y="5" width="20" height="7" rx="1.5" fill="#6a7885" {...o} />
          <path d="M6 8h14M11 15.5h14M5 22.5h15" stroke="#fff" strokeWidth="1.2" opacity=".45" />
        </symbol>
        <symbol id="i-copper-wire" viewBox="0 0 32 32">
          <ellipse cx="16" cy="20" rx="11.5" ry="7" fill="#b9582a" {...o} />
          <ellipse cx="16" cy="16" rx="11.5" ry="7" fill="#e07a3a" {...o} />
          <ellipse cx="16" cy="16" rx="5.5" ry="3" fill="#7a3d1b" {...o} />
          <path d="M8 14c3-2 13-2 16 0" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".5" strokeLinecap="round" />
        </symbol>

        {/* ---- vehicles (56 x 36) ---- */}
        <symbol id="v-wheelbarrow" viewBox="0 0 56 36">
          <path d="M6 10h26l-4 14H12z" fill="#2f8f4e" {...o} />
          <path d="M32 10l14-4M28 24l18 4" fill="none" {...o} />
          <circle cx="12" cy="29" r="5" fill="#3b3b3b" {...o} />
          <circle cx="12" cy="29" r="1.6" fill="#ddd" />
        </symbol>
        <symbol id="v-keke" viewBox="0 0 56 36">
          <path d="M8 24V13c0-4 3-7 7-7h19c4 0 7 3 7 7v11z" fill="#f2b705" {...o} />
          <path d="M8 13c0-4 3-7 7-7h19c4 0 7 3 7 7z" fill="#1d1d1b" {...o} />
          <rect x="16" y="12" width="12" height="8" rx="2" fill="#bfe3f5" {...o} />
          <path d="M41 24h8l-2-8h-6" fill="#f2b705" {...o} />
          <circle cx="14" cy="28" r="5" fill="#3b3b3b" {...o} /><circle cx="43" cy="28" r="5" fill="#3b3b3b" {...o} />
        </symbol>
        <symbol id="v-van" viewBox="0 0 56 36">
          <path d="M3 25V11c0-2 2-4 4-4h28l10 8v10z" fill="#f2b705" {...o} />
          <path d="M3 18h42" stroke={INK} strokeWidth="3" />
          <path d="M35 9l8 6h-8z" fill="#bfe3f5" {...o} />
          <rect x="9" y="10" width="6" height="5" rx="1" fill="#bfe3f5" {...o} /><rect x="19" y="10" width="6" height="5" rx="1" fill="#bfe3f5" {...o} />
          <circle cx="14" cy="28" r="5" fill="#3b3b3b" {...o} /><circle cx="38" cy="28" r="5" fill="#3b3b3b" {...o} />
        </symbol>

        {/* ---- small UI glyphs (24 x 24) ---- */}
        <symbol id="g-coin" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="#f2a900" {...o} />
          <circle cx="12" cy="12" r="6.6" fill="none" stroke="#b77700" strokeWidth="1.2" />
          <path d="M9 16V8l6 8V8M8 11h8M8 13.4h8" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
        </symbol>
        <symbol id="g-sun" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" fill="#ffc83d" {...o} />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="#ffc83d" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="g-moon" viewBox="0 0 24 24">
          <path d="M19 15A8 8 0 0 1 9 5a8 8 0 1 0 10 10z" fill="#dfe6ff" {...o} />
        </symbol>
      </defs>
    </svg>
  );
}

export function ItemIcon({ item, size = 22 }: { item: Item | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <use href={`#${itemId(item)}`} />
    </svg>
  );
}

export function VehicleIcon({ vehicle, size = 34 }: { vehicle: 'wheelbarrow' | 'keke' | 'van'; size?: number }) {
  return (
    <svg className="icon" width={size * 1.5} height={size} viewBox="0 0 56 36" aria-hidden="true" focusable="false">
      <use href={`#v-${vehicle}`} />
    </svg>
  );
}

export function Glyph({ name, size = 18 }: { name: 'coin' | 'sun' | 'moon'; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <use href={`#g-${name}`} />
    </svg>
  );
}
