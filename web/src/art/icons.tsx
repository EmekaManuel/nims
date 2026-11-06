import type { Item } from '../api';

/**
 * Hand-drawn icon set (one ink outline, flat market colours). The sprite is mounted once in <App/>;
 * <ItemIcon/> and <VehicleIcon/> reference it with <use>, so a stall can draw dozens of crates cheaply.
 */
const INK = '#26364a';

export const itemId = (item: Item | string) => `i-${item.replace(' ', '-')}`;

export function IconSprite() {
  const o = { stroke: INK, strokeWidth: 1.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
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
        <symbol id="i-flour" viewBox="0 0 32 32">
          <path d="M9 9 7 27c0 2 3 3 9 3s9-1 9-3l-2-18z" fill="#f3e2ad" {...o} />
          <path d="M9 9c2-3 4-4 7-4s5 1 7 4c-2 1-4 1-7 1s-5 0-7-1z" fill="#e6cd85" {...o} />
          <path d="M11 19c3-2 7-2 10 0" fill="none" stroke="#b99a4a" strokeWidth="1.6" strokeLinecap="round" />
        </symbol>
        <symbol id="i-cotton" viewBox="0 0 32 32">
          <rect x="4" y="7" width="22" height="18" rx="4" fill="#f4f8fe" {...o} />
          <path d="M9 7v18M14 7v18M19 7v18" stroke="#9dbbea" strokeWidth="2.2" />
          <ellipse cx="26" cy="16" rx="3" ry="9" fill="#cfdcf0" {...o} />
          <ellipse cx="26" cy="16" rx="1" ry="4" fill="#9dbbea" />
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
          <path d="M6 10h26l-4 14H12z" fill="#2f9e5f" {...o} />
          <path d="M32 10l14-4M28 24l18 4" fill="none" {...o} />
          <circle cx="12" cy="29" r="5" fill="#3b3b3b" {...o} />
          <circle cx="12" cy="29" r="1.6" fill="#ddd" />
        </symbol>
        <symbol id="v-pickup" viewBox="0 0 56 36">
          <path d="M3 24V15c0-1.5 1-2.5 2.5-2.5H14l5-6h12c1.4 0 2.5 1 2.5 2.5v7H53v9z" fill="#2a6fdb" {...o} />
          <path d="M33.5 12.5V9c0-1.4-1.1-2.5-2.5-2.500H20.500L16 12.500z" fill="#cfe3fb" {...o} />
          <path d="M33.5 12.500H53" stroke="#26364a" strokeWidth="1.2" />
          <rect x="36" y="14" width="15" height="7" rx="1.2" fill="#1d55b0" stroke="none" opacity=".55" />
          <circle cx="14" cy="28" r="5" fill="#33425a" {...o} /><circle cx="14" cy="28" r="1.7" fill="#dfe6f1" />
          <circle cx="43" cy="28" r="5" fill="#33425a" {...o} /><circle cx="43" cy="28" r="1.7" fill="#dfe6f1" />
        </symbol>
        <symbol id="v-van" viewBox="0 0 56 36">
          <path d="M3 25V10.500c0-2 1.5-3.5 3.5-3.500H34l12 8.500v9.500z" fill="#f4f8fe" {...o} />
          <path d="M3 19h43" stroke="#2a6fdb" strokeWidth="3.5" />
          <path d="M35 8.500l8.5 6.500H35z" fill="#cfe3fb" {...o} />
          <rect x="8" y="10" width="7" height="5.5" rx="1" fill="#cfe3fb" {...o} /><rect x="19" y="10" width="7" height="5.5" rx="1" fill="#cfe3fb" {...o} />
          <circle cx="14" cy="28" r="5" fill="#33425a" {...o} /><circle cx="14" cy="28" r="1.7" fill="#dfe6f1" />
          <circle cx="38" cy="28" r="5" fill="#33425a" {...o} /><circle cx="38" cy="28" r="1.7" fill="#dfe6f1" />
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

export function VehicleIcon({ vehicle, size = 34 }: { vehicle: 'wheelbarrow' | 'pickup' | 'van'; size?: number }) {
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
