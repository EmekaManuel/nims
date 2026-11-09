import { SHIRTS } from '../art/avatar';
import { FRONTIER, FRONTIER_LAYOUT, HARBOUR, isFrontier, REALM_OF, ROAD_SIGN, type FrontierId } from './realms';
import type { Focus, GameState, Item, MarketId, Offer, Plot, RealmId, Stall } from '../api';
import { itemId } from '../art/icons';

export type Selection = { kind: 'stall'; id: string } | { kind: 'source'; item: Item } | { kind: 'plot'; market: MarketId } | { kind: 'road'; realm: RealmId } | { kind: 'land'; id: string } | null;

/**
 * The district, drawn. Layout is hand-placed on a 1000 x 680 canvas and exported so a test can prove
 * that nothing overlaps. A stall's crates are drawn from its real stock, so a flooded stall visibly
 * overflows, a bare one shows empty crates, and a broke one has its shutters down.
 */
/** Art is drawn at 136 x 92 and scaled up so names stay readable on a phone-sized map. */
const ART_W = 136;
const ART_H = 92;
const SCALE = 1.2;
export const STALL_W = ART_W * SCALE; // 163.2
export const STALL_H = ART_H * SCALE; // 110.4

export const ZONES: Record<MarketId, { x: number; y: number; w: number; h: number; label: string; plate: number }> = {
  produce: { x: 160, y: 30, w: 400, h: 300, label: 'Produce Market', plate: 176 },
  fabric: { x: 590, y: 30, w: 400, h: 300, label: 'Fabric Market', plate: 158 },
  scrap: { x: 200, y: 380, w: 600, h: 270, label: 'Scrap & Hardware', plate: 196 },
  harbour: HARBOUR.zone,
  woods: { x: FRONTIER_LAYOUT.zone.x, y: FRONTIER_LAYOUT.zone.y, w: FRONTIER_LAYOUT.zone.w, h: FRONTIER_LAYOUT.zone.h, plate: FRONTIER_LAYOUT.zone.plate, label: FRONTIER.timberfell.label },
  mine: { x: FRONTIER_LAYOUT.zone.x, y: FRONTIER_LAYOUT.zone.y, w: FRONTIER_LAYOUT.zone.w, h: FRONTIER_LAYOUT.zone.h, plate: FRONTIER_LAYOUT.zone.plate, label: FRONTIER.gemhollow.label },
  vale: { x: FRONTIER_LAYOUT.zone.x, y: FRONTIER_LAYOUT.zone.y, w: FRONTIER_LAYOUT.zone.w, h: FRONTIER_LAYOUT.zone.h, plate: FRONTIER_LAYOUT.zone.plate, label: FRONTIER.sunvale.label },
};

export const STALL_POS: Record<string, [number, number]> = {
  mira: [255, 140], june: [465, 140], tomas: [255, 270],
  lena: [685, 140], omar: [895, 140],
  anil: [310, 522], ruth: [500, 522], diego: [690, 522],
};

/** Free plots where a player can open a stall. Scrap & Hardware is full. */
export const PLOTS: Partial<Record<MarketId, [number, number]>> = {
  produce: [465, 270],
  fabric: [790, 270],
};

const OWNER_CANOPY: [string, string] = ['#f2b01e', '#fff8e6'];

const SOURCE_POS: Partial<Record<Item, [number, number]>> = {
  tomatoes: [82, 110], pepper: [82, 250], iron: [100, 470], 'copper wire': [100, 590], cotton: [890, 470],
};

/** Awning stripes per market. */
const CANOPY: Record<MarketId, [string, string]> = {
  produce: ['#2f9e5f', '#f1f8f3'],
  fabric: ['#2a6fdb', '#f1f6fe'],
  scrap: ['#c8622e', '#f1ede7'],
  harbour: ['#0b8f8f', '#eef8f8'],
  woods: FRONTIER.timberfell.canopy,
  mine: FRONTIER.gemhollow.canopy,
  vale: FRONTIER.sunvale.canopy,
};

const STATE_LABEL = { open: 'Open', struggling: 'Low on cash', closed: 'Closed' } as const;

/** How many crates' worth of goods to draw for a stock level (0..4). Flooded stalls get the most. */
export function crateCount(stock: number, target: number): number {
  if (stock <= 0) return 0;
  const r = stock / Math.max(target, 1);
  return r < 0.45 ? 1 : r < 0.9 ? 2 : r < 1.4 ? 3 : 4;
}

/** Light over the town for an in-game hour: night, dawn, bright day, dusk. */
export function lightAt(hour: number): { color: string; opacity: number } {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 8 && h <= 16) return { color: '#ffffff', opacity: 0 };
  if (h >= 21 || h <= 4) return { color: '#0d1b52', opacity: 0.5 };
  const table: Record<number, [string, number]> = {
    5: ['#3a2a6a', 0.34], 6: ['#ff9a6a', 0.2], 7: ['#ffc48a', 0.1],
    17: ['#ffb066', 0.1], 18: ['#ff8a4a', 0.2], 19: ['#8a3a6a', 0.24], 20: ['#1a2a6a', 0.42],
  };
  const [color, opacity] = table[h];
  return { color, opacity };
}

function Awning({ colors, dim }: { colors: [string, string]; dim: boolean }) {
  const [a, b] = colors;
  const n = 8;
  const w = ART_W / n;
  return (
    <g filter={dim ? 'url(#desat)' : undefined} opacity={dim ? 0.8 : 1}>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${i * w} 0H${(i + 1) * w}V15a${w / 2} ${w / 2} 0 0 1 -${w} 0Z`} fill={i % 2 ? b : a} stroke="#26364a" strokeWidth="1.2" strokeLinejoin="round" />
      ))}
    </g>
  );
}

function Goods({ offers }: { offers: Offer[] }) {
  const shown = offers.slice(0, 2);
  const slot = ART_W / shown.length;
  return (
    <g>
      {shown.map((o, i) => {
        const n = crateCount(o.stock, o.target);
        const x0 = i * slot + (slot - 58) / 2;
        const step = n > 1 ? (58 - 24) / (n - 1) : 0;
        return (
          <g key={o.item} transform={`translate(${x0} 0)`}>
            {Array.from({ length: n }, (_, k) => (
              <use key={k} href={`#${itemId(o.item)}`} x={n > 1 ? k * step : 17} y={n > 3 && k % 2 ? 24 : 29} width="24" height="24" />
            ))}
            <rect x="0" y="45" width="58" height="12" rx="2" fill="#d6b68a" stroke="#26364a" strokeWidth="1.2" />
            <path d="M0 51H58" stroke="#b8946a" strokeWidth="1.2" />
          </g>
        );
      })}
    </g>
  );
}

function StallArt({ s }: { s: Stall }) {
  const closed = s.state === 'closed';
  const low = s.state === 'struggling';
  return (
    <g className="stall-art">
      <ellipse cx={ART_W / 2} cy={ART_H + 1} rx={ART_W * 0.46} ry="5" fill="#14253d" opacity=".16" />
      <Awning colors={s.owner ? OWNER_CANOPY : CANOPY[s.market]} dim={closed} />
      <Goods offers={s.offers} />
      <rect x="0" y="57" width={ART_W} height="7" rx="2" fill="#c9a479" stroke="#26364a" strokeWidth="1.2" />
      {closed && (
        <g>
          <rect x="3" y="22" width={ART_W - 6} height="36" fill="#8d98a3" stroke="#26364a" strokeWidth="1.2" />
          {[28, 34, 40, 46, 52].map((y) => <path key={y} d={`M3 ${y}H${ART_W - 3}`} stroke="#6b7682" strokeWidth="1.6" />)}
        </g>
      )}
      <rect x="0" y="64" width={ART_W} height="28" rx="7" fill="#16264a" stroke="#26364a" strokeWidth="1.2" />
      <circle cx="15" cy="78" r="9.5" fill={s.owner ? '#f2b01e' : avatarColor(s.id)} stroke="#fff" strokeWidth="1.6" opacity={closed ? 0.5 : 1} />
      <text x="15" y="82" textAnchor="middle" className="avatar-initial">{s.name.charAt(0)}</text>
      <text x="29" y="76" className="stall-name">{s.name}</text>
      <text x="29" y="88" className={`stall-status ${s.state}`}>
        {closed ? '✕ Closed' : low ? '▼ Low on cash' : '● Open'}
      </text>
      {(s.shares?.yours ?? 0) > 0 && (
        <g transform="translate(12 6)">
          <circle r="11" fill="#f2a900" stroke="#26364a" strokeWidth="1.2" />
          <path d="M0-6l1.8 3.9 4.2.5-3.1 2.9.8 4.2L0 5.4l-3.7 2.1.8-4.2-3.1-2.9 4.2-.5z" fill="#26364a" />
        </g>
      )}
      {s.owner?.mine && <text x={ART_W - 8} y="-4" textAnchor="end" className="yours-tag">YOURS</text>}
      {low && (
        <g transform={`translate(${ART_W - 10} 4)`}>
          <circle r="11" fill="#d6336c" stroke="#26364a" strokeWidth="1.2" />
          <use href="#g-coin" x="-7" y="-9" width="14" height="14" />
          <path d="M-4 7h8l-4 5z" fill="#fff" />
        </g>
      )}
    </g>
  );
}

function SourceArt({ item }: { item: Item }) {
  const crop = item === 'pepper' ? '#e24a22' : '#d93b2b';
  if (item === 'timber') {
    // the lumber camp: a stack of logs
    return (
      <g>
        <rect x="-46" y="-30" width="92" height="52" rx="8" fill="#b9946b" stroke="#26364a" strokeWidth="1.6" />
        {[[-26, 8], [0, 8], [26, 8], [-13, -12], [13, -12]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="12" fill="#a87b4f" stroke="#26364a" strokeWidth="1.4" /><circle cx={x} cy={y} r="6" fill="none" stroke="#7a5534" strokeWidth="1.2" /></g>)}
      </g>
    );
  }
  if (item === 'gems') {
    // the gem seam: a rock face with crystals showing
    return (
      <g>
        <path d="M-46 22L-34 -14 -10 -30 18 -24 40 -6 46 22z" fill="#8e8a96" stroke="#26364a" strokeWidth="1.6" strokeLinejoin="round" />
        {[[-20, -2, '#6250d6'], [4, -14, '#d6336c'], [22, 2, '#0b8f8f']].map(([x, y, c], i) => <path key={i} d={`M${x} ${(y as number) - 10}l7 9-7 9-7-9z`} fill={c as string} stroke="#26364a" strokeWidth="1.2" />)}
      </g>
    );
  }
  if (item === 'wine') {
    // the vineyard: rows of vines and a barrel
    return (
      <g>
        <rect x="-46" y="-30" width="92" height="52" rx="8" fill="#9ab86a" stroke="#26364a" strokeWidth="1.6" />
        {[-18, -2, 14].map((y) => <g key={y}><path d={`M-38 ${y}H20`} stroke="#5a7a3a" strokeWidth="4" strokeLinecap="round" />{[-30, -14, 2, 16].map((x) => <circle key={x} cx={x} cy={y - 3} r="3.6" fill="#7a2846" />)}</g>)}
        <rect x="26" y="-14" width="16" height="22" rx="5" fill="#8a5a32" stroke="#26364a" strokeWidth="1.2" />
      </g>
    );
  }
  if (item === 'fish') {
    // the fishing pier: planks out over the water, crates of the catch
    return (
      <g>
        <rect x="-46" y="-30" width="92" height="52" rx="4" fill="#a87b4f" stroke="#26364a" strokeWidth="1.6" />
        {[-34, -18, -2, 14, 30].map((x) => <path key={x} d={`M${x} -30V22`} stroke="#7a5534" strokeWidth="1.2" />)}
        {[-28, 4].map((x) => <g key={x}><rect x={x} y="-20" width="26" height="20" rx="3" fill="#6b4a2f" stroke="#26364a" strokeWidth="1.2" /><use href="#i-fish" x={x + 1} y="-22" width="24" height="24" /></g>)}
      </g>
    );
  }
  if (item === 'salt') {
    // the salt pans: shallow beds with white heaps
    return (
      <g>
        <rect x="-46" y="-30" width="92" height="52" rx="8" fill="#cfe3ea" stroke="#26364a" strokeWidth="1.6" />
        <path d="M-46 -4H46M0 -30V22" stroke="#9cbfcc" strokeWidth="1.4" />
        {[[-30, -20], [8, -22], [-20, 4], [20, 2]].map(([x, y], i) => <use key={i} href="#i-salt" x={x} y={y} width="26" height="26" />)}
      </g>
    );
  }
  if (item === 'tomatoes' || item === 'pepper') {
    return (
      <g>
        <rect x="-46" y="-34" width="92" height="56" rx="8" fill="#5aa85f" stroke="#26364a" strokeWidth="1.6" />
        {[-22, -4, 14].map((y) => (
          <g key={y}>
            <path d={`M-38 ${y + 6}H38`} stroke="#3f8a47" strokeWidth="5" strokeLinecap="round" />
            {[-30, -16, -2, 12, 26].map((x) => <circle key={x} cx={x} cy={y + 2} r="4.4" fill={crop} stroke="#26364a" strokeWidth="1.2" />)}
          </g>
        ))}
      </g>
    );
  }
  if (item === 'cotton') {
    return (
      <g>
        <path d="M-46 22V-12l46-20 46 20v34z" fill="#e6ebf3" stroke="#26364a" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M-46 -12l46-20 46 20z" fill="#2a6fdb" stroke="#26364a" strokeWidth="1.6" strokeLinejoin="round" />
        {[-30, -6, 18].map((x) => <use key={x} href="#i-cotton" x={x - 12} y="-4" width="26" height="26" />)}
      </g>
    );
  }
  // scrap spot: a heap
  return (
    <g>
      <path d="M-46 22L-30 -6 -14 -22 4 -10 20 -30 38 -4 46 22z" fill="#8e99a8" stroke="#26364a" strokeWidth="1.6" strokeLinejoin="round" />
      <use href={`#${itemId(item)}`} x="-14" y="-24" width="30" height="30" />
      <use href="#i-iron" x="-42" y="-6" width="22" height="22" />
      <use href="#i-copper-wire" x="22" y="-4" width="22" height="22" />
    </g>
  );
}

/** The harbour: a quay, the sea below the shore line with gentle waves, and boats at their moorings. Decorative only. */
function HarbourScenery() {
  return (
    <g aria-hidden="true">
      <rect x="0" y={HARBOUR.shore} width="1000" height={680 - HARBOUR.shore} fill="#5f9fc4" />
      <rect x="0" y={HARBOUR.shore - 8} width="1000" height="10" fill="#8a7a66" />
      {[540, 570, 600, 630, 660].map((y, i) => <path key={y} d={`M${(i % 2) * 40} ${y} q25 -8 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0`} fill="none" stroke="#9cc8e0" strokeWidth="2" opacity=".6" />)}
      {/* the jetty out to the boats */}
      <rect x="300" y={HARBOUR.shore - 6} width="60" height="110" fill="#a87b4f" stroke="#26364a" strokeWidth="1.4" />
      {HARBOUR.boats.map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r * 30})`}>
          <path d="M-60 0h120l-18 24h-84z" fill={['#c8622e', '#2a6fdb', '#2f9e5f'][i % 3]} stroke="#26364a" strokeWidth="1.6" />
          <path d="M0 0V-62" stroke="#5a4632" strokeWidth="4" />
          <path d="M3 -58L44 -8H3z" fill="#f6f2e6" stroke="#26364a" strokeWidth="1.4" />
        </g>
      ))}
      <Tree x={50} y={420} s={0.8} /> <Tree x={955} y={300} s={0.9} />
    </g>
  );
}

/** A frontier: open ground, and the trees, rocks or vines of the place. Decorative only. */
function FrontierScenery({ realm }: { realm: FrontierId }) {
  const f = FRONTIER[realm];
  const spots: [number, number, number][] = [[40, 120, 1], [60, 520, 0.9], [970, 60, 0.8], [130, 640, 0.8], [700, 650, 0.7], [400, 640, 0.9]];
  return (
    <g aria-hidden="true">
      <rect width="1000" height="680" fill={f.ground} opacity=".85" />
      {spots.map(([x, y, s], i) => (
        f.decor === 'trees' ? <g key={i}><Tree x={x} y={y} s={s} /><Tree x={x + 30} y={y + 14} s={s * 0.8} /></g>
          : f.decor === 'rocks' ? <path key={i} d={`M${x - 30 * s} ${y + 14}l${14 * s} ${-30 * s} ${20 * s} ${-8 * s} ${26 * s} ${38 * s}z`} fill="#8e8a96" stroke="#26364a" strokeWidth="1.4" />
          : <g key={i}>{[0, 12, 24].map((d) => <path key={d} d={`M${x - 30} ${y + d}h60`} stroke="#5a7a3a" strokeWidth="4" strokeLinecap="round" />)}</g>
      ))}
    </g>
  );
}

/** A plot of frontier land: its price while it is the town's, the owner's name once bought, and an asking price when for sale. */
function LandPlot({ plot, x, y, on, ...props }: { plot: Plot; x: number; y: number; on: boolean } & React.SVGProps<SVGGElement>) {
  const forSale = !plot.owner || plot.forSale !== null;
  const price = plot.owner ? plot.forSale : plot.price;
  const top = plot.owner ? (plot.owner.mine ? 'Your land' : `${plot.owner.name}'s land`) : 'Land for sale';
  return (
    <g transform={`translate(${x - STALL_W / 2} ${y - STALL_H / 2})`} className={`land ${forSale ? 'for-sale' : 'owned'} ${plot.owner?.mine ? 'mine' : ''} ${on ? 'on' : ''}`}
      aria-label={`${top}${price ? `, ${price.toLocaleString('en-US')} coins` : ''}. Plot ${plot.n + 1}.`} {...props}>
      <rect className="chosen" x={-6} y={-6} width={STALL_W + 12} height={STALL_H + 12} rx={14} />
      <rect className="land-box" width={STALL_W} height={STALL_H} rx={12} />
      <path d={`M${STALL_W / 2 - 18} ${STALL_H / 2 - 4}v-26`} stroke="#5a4632" strokeWidth="3" />
      <rect x={STALL_W / 2 - 30} y={STALL_H / 2 - 40} width="44" height="18" rx="3" className="land-sign" />
      <text x={STALL_W / 2} y={STALL_H / 2 + 22} textAnchor="middle" className="land-top">{top}</text>
      {price !== null && <text x={STALL_W / 2} y={STALL_H / 2 + 40} textAnchor="middle" className="land-price">{price.toLocaleString('en-US')} coins</text>}
    </g>
  );
}

/** The road out of the realm: a signpost. Tap it to see the journey and set off. */
function RoadSign({ at, label, on, ...props }: { at: [number, number]; label: string; on: boolean } & React.SVGProps<SVGGElement>) {
  return (
    <g transform={`translate(${at[0]} ${at[1]})`} className={`roadsign ${on ? 'on' : ''}`} aria-label={`${label}. The road out: tap to see the journey.`} {...props}>
      <rect className="hit" x="-62" y="-60" width="124" height="96" fill="transparent" />
      <rect className="chosen" x="-66" y="-64" width="132" height="104" rx="12" />
      <path d="M0 30V-30" stroke="#5a4632" strokeWidth="6" strokeLinecap="round" />
      <path d="M-54 -46h96l14 13-14 13h-96z" fill="#f2b01e" stroke="#26364a" strokeWidth="1.6" strokeLinejoin="round" />
      <text x="-6" y="-29" textAnchor="middle" className="roadsign-text">{label}</text>
    </g>
  );
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-4" y="0" width="8" height="26" rx="2" fill="#8b6b4a" stroke="#26364a" strokeWidth="1.2" />
      <circle cx="0" cy="-8" r="20" fill="#3f9e6a" stroke="#26364a" strokeWidth="1.2" />
      <circle cx="-9" cy="-2" r="12" fill="#59b383" />
    </g>
  );
}

/** A floating "+420 coins" shown where something happened. */
export interface Popup { id: number; x: number; y: number; text: string; tone: 'gain' | 'spend' | 'info' }

/** Where a stall or source sits on the map (the point just above it), for popups and pointers. */
/** The realm being shown: the one you are in. */
export const realmShown = (state: GameState): RealmId => state.realm?.here ?? 'town';

/** Where a stall sits in the realm being shown (undefined if it is in another realm). */
export function stallPos(realm: RealmId, st: { id: string; market: MarketId }, plots: Plot[] = []): [number, number] | undefined {
  if (REALM_OF[st.market] !== realm) return undefined;
  if (isFrontier(realm)) { const plot = plots.find((x) => x.business?.id === st.id); return plot ? FRONTIER_LAYOUT.plots[plot.n] : undefined; }
  return realm === 'saltmere' ? HARBOUR.stalls[st.id] : STALL_POS[st.id] ?? PLOTS[st.market];
}

/** Where a source sits in the realm being shown. */
export const sourcePos = (realm: RealmId, item: Item): [number, number] | undefined =>
  isFrontier(realm) ? (FRONTIER[realm].source === item ? FRONTIER_LAYOUT.source : undefined) : realm === 'saltmere' ? HARBOUR.sources[item] : SOURCE_POS[item];

export function spotOf(state: GameState, target: { kind: 'stall' | 'source'; id: string }): [number, number] | null {
  const realm = realmShown(state);
  if (target.kind === 'source') {
    const p = sourcePos(realm, target.id as Item);
    return p ? [p[0], p[1] - 40] : null;
  }
  const st = state.stalls.find((x) => x.id === target.id);
  const p = st && stallPos(realm, st, state.land?.here);
  return p ? [p[0], p[1] - STALL_H / 2 + 4] : null;
}

/** Friendly, bright avatar colours for shopkeepers (abstract, not tied to anyone). */
const AVATARS = ['#2f9e5f', '#e2557b', '#7b4de0', '#eb6834', '#18a999', '#2a6fdb', '#c98a00', '#0e9fb0'];
const avatarColor = (id: string) => AVATARS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATARS.length];

/** Where your avatar stands in each market (the open plaza between the rows of stalls). */
const AVATAR_AT: Record<MarketId, [number, number]> = { produce: [340, 368], fabric: [760, 368], scrap: [560, 372], harbour: HARBOUR.you, woods: FRONTIER_LAYOUT.you, mine: FRONTIER_LAYOUT.you, vale: FRONTIER_LAYOUT.you };

/** Little town folk and a delivery truck moving along the roads. Purely decorative, and still when motion is reduced. */
const WALKERS: { path: string; dur: number; begin: number; color: string }[] = [
  { path: 'M175 356H845', dur: 34, begin: 0, color: '#e2557b' },
  { path: 'M845 356H175', dur: 40, begin: -12, color: '#7b4de0' },
  { path: 'M575 50V336', dur: 18, begin: -4, color: '#eb6834' },
  { path: 'M575 336V50', dur: 22, begin: -15, color: '#18a999' },
  { path: 'M122 60V650', dur: 46, begin: -20, color: '#2a6fdb' },
  { path: 'M122 650V60', dur: 52, begin: -30, color: '#c98a00' },
  { path: 'M945 60V330', dur: 24, begin: -9, color: '#0e9fb0' },
];
const TRUCK_PATH = 'M30 666H970';

function Bean({ color, size = 1 }: { color: string; size?: number }) {
  return (
    <g transform={`scale(${size})`}>
      <ellipse cx="0" cy="1" rx="7" ry="2.4" fill="#14253d" opacity=".2" />
      <rect x="-6" y="-17" width="12" height="17" rx="6" fill={color} stroke="#26364a" strokeWidth="1.1" />
      <circle cx="-2.2" cy="-11.5" r="1.7" fill="#fff" /><circle cx="2.2" cy="-11.5" r="1.7" fill="#fff" />
      <circle cx="-1.8" cy="-11.3" r="0.8" fill="#14253d" /><circle cx="2.6" cy="-11.3" r="0.8" fill="#14253d" />
    </g>
  );
}

function Life({ moving }: { moving: boolean }) {
  if (!moving) return null;
  return (
    <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
      {WALKERS.map((w, i) => (
        <g key={i} className="walker">
          <animateMotion dur={`${w.dur}s`} begin={`${w.begin}s`} repeatCount="indefinite" path={w.path} />
          <g className="bob"><Bean color={w.color} /></g>
        </g>
      ))}
      <g className="walker">
        <animateMotion dur="38s" begin="-8s" repeatCount="indefinite" path={TRUCK_PATH} />
        <use href="#v-pickup" x="-24" y="-26" width="48" height="31" />
      </g>
    </g>
  );
}

/** You: a blue character with your vehicle. When you go to another market you walk there. */
function You({ at, vehicle, shirt = '#1d63d6' }: { at: MarketId; vehicle: 'wheelbarrow' | 'pickup' | 'van'; shirt?: string }) {
  const [x, y] = AVATAR_AT[at];
  return (
    <g className="you" style={{ transform: `translate(${x}px, ${y}px)` }} aria-hidden="true">
      <g className="bob"><Bean color={shirt} size={1.35} /></g>
      <use href={`#v-${vehicle}`} x="12" y="-24" width="46" height="30" />
      <g transform="translate(0 -34)">
        <rect x="-15" y="-9" width="30" height="16" rx="8" className="you-tag" />
        <text y="3" textAnchor="middle" className="you-text">You</text>
      </g>
    </g>
  );
}

/** What the active shocks look like on the map. Decorative only (the HUD banner and events say it in words). */
function ShockLayer({ kinds }: { kinds: string[] }) {
  const rain = kinds.includes('rain');
  const festive = kinds.includes('festive season');
  const fuel = kinds.includes('fuel queue');
  if (!rain && !festive && !fuel) return null;
  return (
    <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
      {rain && (
        <g className="rain">
          <rect width="1000" height="680" fill="#2c4a7a" opacity="0.14" />
          <g className="rain-streaks">
            {Array.from({ length: 46 }, (_, i) => {
              const x = (i * 97) % 1040;
              const y = (i * 53) % 700;
              return <line key={i} x1={x} y1={y - 700} x2={x - 14} y2={y - 664} />;
            })}
            {Array.from({ length: 46 }, (_, i) => {
              const x = (i * 97) % 1040;
              const y = (i * 53) % 700;
              return <line key={`b${i}`} x1={x} y1={y} x2={x - 14} y2={y + 36} />;
            })}
          </g>
        </g>
      )}
      {festive && (
        <g className="festive">
          {Array.from({ length: 26 }, (_, i) => (
            <circle key={i} cx={602 + ((i * 53) % 376)} cy={46 + ((i * 37) % 280)} r={2.6 + (i % 3)} fill={['#f2a900', '#d6336c', '#2a6fdb', '#2f8f4e'][i % 4]} style={{ animationDelay: `${(i % 7) * 0.3}s` }} />
          ))}
        </g>
      )}
      {fuel && (
        <g className="fuelq">
          {[0, 1, 2, 3].map((i) => <use key={i} href="#v-pickup" x={868} y={338 + i * 22} width={44} height={28} />)}
          <g transform="translate(922 352)">
            <rect width="62" height="34" rx="5" fill="#16264a" stroke="#26364a" strokeWidth="1.6" />
            <text x="31" y="14" textAnchor="middle" className="fuel-sign">FUEL</text>
            <text x="31" y="27" textAnchor="middle" className="fuel-sign">QUEUE</text>
          </g>
        </g>
      )}
    </g>
  );
}

export function DistrictMap({ state, selected, onSelect, popups = [], moving }: { state: GameState; selected: Selection; onSelect: (s: Selection) => void; popups?: Popup[]; moving?: boolean }) {
  // Town folk only move when the reader hasn't asked for less motion.
  const animate = moving ?? !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const focus: Focus = state.coach.focus;
  const light = lightAt(state.hour);
  const realm = realmShown(state);
  const town = realm === 'town';
  const sign = ROAD_SIGN[realm];
  const press = (fn: () => void) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fn()),
  });

  return (
    <svg viewBox="0 0 1000 680" className={`map realm-${realm}`} aria-label={town ? 'Map of the market district' : `Map of ${HARBOUR.zone.label}`}>
      <defs>
        <pattern id="speck" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#cdd6e3" strokeWidth="1" />
        </pattern>
        <filter id="desat"><feColorMatrix type="saturate" values="0.15" /></filter>
        <radialGradient id="glow"><stop offset="0" stopColor="#ffd98a" stopOpacity=".7" /><stop offset="1" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
      </defs>

      <rect width="1000" height="680" fill="#dfe5ee" />
      <rect width="1000" height="680" fill="url(#speck)" />

      {town ? (
        <>
          <g className="road">
            <path d="M130 110H160M130 250H160M150 470H200M150 590H200M560 190H590M360 330V380M800 500H846M890 330V430M800 655H845" />
          </g>
          <g className="road-dash">
            <path d="M130 110H160M130 250H160M150 470H200M150 590H200M560 190H590M360 330V380M800 500H846M890 330V430M800 655H845" />
          </g>
          <Tree x={44} y={372} /> <Tree x={958} y={392} s={0.9} /> <Tree x={900} y={640} s={0.8} /> <Tree x={30} y={660} s={0.7} />
        </>
      ) : isFrontier(realm) ? <FrontierScenery realm={realm} /> : <HarbourScenery />}

      {(Object.keys(ZONES) as MarketId[]).filter((id) => REALM_OF[id] === realm).map((id) => {
        const z = ZONES[id];
        const here = state.you.at === id;
        return (
          <g key={id} className={`zone zone-${id} ${here ? 'here' : ''}`}>
            <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={22} className="zone-ground" />
            <g transform={`translate(${z.x + 16} ${z.y + 14})`}>
              <rect width={z.plate} height={30} rx={7} className="zone-plate" />
              <text x={z.plate / 2} y={21} textAnchor="middle" className="zone-label">{z.label}</text>
            </g>
          </g>
        );
      })}

      {town && state.business.stallOffer && (Object.keys(PLOTS) as MarketId[]).map((mk) => {
        const [x, y] = PLOTS[mk]!;
        const on = selected?.kind === 'plot' && selected.market === mk;
        return (
          <g key={mk} transform={`translate(${x - STALL_W / 2} ${y - STALL_H / 2})`} className={`plot ${on ? 'on' : ''}`} {...press(() => onSelect({ kind: 'plot', market: mk }))} aria-label={`Free plot in the ${ZONES[mk].label}. Open your own stall here.`}>
            <rect className="plot-box" width={STALL_W} height={STALL_H} rx={14} />
            <text x={STALL_W / 2} y={STALL_H / 2 - 4} textAnchor="middle" className="plot-plus">+</text>
            <text x={STALL_W / 2} y={STALL_H / 2 + 22} textAnchor="middle" className="plot-label">Free plot</text>
          </g>
        );
      })}

      {state.stalls.map((s) => {
        const pos = stallPos(realm, s, state.land?.here);
        if (!pos) return null;
        const [x, y] = pos;
        const on = selected?.kind === 'stall' && selected.id === s.id;
        const next = focus?.kind === 'stall' && focus.id === s.id;
        return (
          <g key={s.id} transform={`translate(${x - STALL_W / 2} ${y - STALL_H / 2})`} className={`stall ${s.state} ${on ? 'on' : ''}`} {...press(() => onSelect({ kind: 'stall', id: s.id }))} aria-label={`${s.name}, ${STATE_LABEL[s.state]}${next ? ', your next step' : ''}`}>
            {/* A solid hit area over the whole stall, so the gaps between crates are clickable too. */}
            <rect className="hit" x={0} y={0} width={STALL_W} height={STALL_H} fill="transparent" />
            {next && <rect className="pulse" x={-9} y={-9} width={STALL_W + 18} height={STALL_H + 18} rx={16} />}
            <rect className="chosen" x={-6} y={-6} width={STALL_W + 12} height={STALL_H + 12} rx={14} />
            <g transform={`scale(${SCALE})`}><StallArt s={s} /></g>
          </g>
        );
      })}

      {state.sources.map((src) => {
        const pos = sourcePos(realm, src.item);
        if (!pos) return null;
        const [x, y] = pos;
        const on = selected?.kind === 'source' && selected.item === src.item;
        const next = focus?.kind === 'source' && focus.id === src.item;
        return (
          <g key={src.item} transform={`translate(${x} ${y})`} className={`source ${on ? 'on' : ''} ${src.units < 5 ? 'empty' : ''}`} {...press(() => onSelect({ kind: 'source', item: src.item }))} aria-label={`${src.label}, ${src.units} available${next ? ', your next step' : ''}`}>
            <rect className="hit" x={-52} y={-40} width={104} height={110} fill="transparent" />
            {next && <rect className="pulse" x={-60} y={-48} width={120} height={128} rx={16} />}
            <rect className="chosen" x={-56} y={-44} width={112} height={120} rx={14} />
            <g className="stall-art" transform="scale(1.12)">
              <SourceArt item={src.item} />
              <rect x="-46" y="26" width="92" height="40" rx="7" fill="#16264a" stroke="#26364a" strokeWidth="1.2" />
              <text y="43" textAnchor="middle" className="stall-name">{src.item}</text>
              <text y="58" textAnchor="middle" className="stall-status open">{src.cost > 0 ? `${src.cost} coins each` : `${src.units} free`}</text>
            </g>
          </g>
        );
      })}

      {isFrontier(realm) && (state.land?.here ?? []).filter((x) => !x.business).map((plot) => {
        const [x, y] = FRONTIER_LAYOUT.plots[plot.n];
        return <LandPlot key={plot.id} plot={plot} x={x} y={y} on={selected?.kind === 'land' && selected.id === plot.id} {...press(() => onSelect({ kind: 'land', id: plot.id }))} />;
      })}
      {town && <Life moving={animate} />}
      <RoadSign at={sign.at} label={sign.label} on={selected?.kind === 'road'} {...press(() => onSelect({ kind: 'road', realm: sign.to }))} />
      <You at={state.you.at ?? 'produce'} vehicle={state.you.vehicle} shirt={state.you.avatar ? SHIRTS[state.you.avatar.shirt] : undefined} />

      {focus && (() => {
        // The "NEXT" pill is drawn last so no stall or awning can cover it.
        const at = focus.kind === 'stall'
          ? (() => { const st = state.stalls.find((x) => x.id === focus.id); const p = st && stallPos(realm, st, state.land?.here); return p ? [p[0] + STALL_W / 2 - 40, p[1] - STALL_H / 2 + 16] : null; })()
          : (() => { const p = sourcePos(realm, focus.id as Item); return p ? [p[0], p[1] - 52] : null; })();
        return at ? (
          <g transform={`translate(${at[0]} ${at[1]})`} className="next-pill" aria-hidden="true">
            <rect x={-34} y={-11} width={68} height={22} rx={11} />
            <text y={4} textAnchor="middle">▼ NEXT</text>
          </g>
        ) : null;
      })()}

      <ShockLayer kinds={state.shocks.map((x) => x.kind)} />

      <rect width="1000" height="680" fill={light.color} opacity={light.opacity} className="daylight" style={{ pointerEvents: 'none', mixBlendMode: 'multiply' }} />

      {/* Warm lamps come on over every stall when it gets dark. */}
      {light.opacity >= 0.28 && (
        <g aria-hidden="true" style={{ pointerEvents: 'none', mixBlendMode: 'screen' }} className="lamps">
          {state.stalls.map((st) => {
            const p = stallPos(realm, st, state.land?.here);
            return p && st.state !== 'closed' ? <circle key={st.id} cx={p[0]} cy={p[1]} r="92" fill="url(#glow)" /> : null;
          })}
        </g>
      )}

      {popups.map((p) => (
        <g key={p.id} transform={`translate(${p.x} ${p.y})`} aria-hidden="true" style={{ pointerEvents: 'none' }}>
          <text className={`popup popup-${p.tone}`} textAnchor="middle">{p.text}</text>
        </g>
      ))}
    </svg>
  );
}
