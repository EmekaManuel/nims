import type { GameState, Item, MarketId } from './api';

export type Selection = { kind: 'stall'; id: string } | { kind: 'source'; item: Item } | null;

/** Hand-placed layout of the district (viewBox 900 x 560). */
const ZONES: Record<MarketId, { x: number; y: number; w: number; h: number; label: string }> = {
  produce: { x: 150, y: 30, w: 330, h: 230, label: 'Produce Market' },
  fabric: { x: 520, y: 30, w: 330, h: 230, label: 'Fabric Market' },
  scrap: { x: 300, y: 320, w: 360, h: 210, label: 'Scrap & Hardware' },
};

const STALL_POS: Record<string, [number, number]> = {
  bisi: [225, 125], kemi: [315, 195], tunde: [415, 125],
  nkechi: [610, 125], sade: [760, 125],
  chidi: [375, 425], wale: [480, 385], emeka: [585, 425],
};

const SOURCE_POS: Partial<Record<Item, [number, number, string]>> = {
  tomatoes: [60, 90, '🍅'],
  pepper: [60, 190, '🌶️'],
  iron: [130, 400, '🔩'],
  'copper wire': [130, 490, '➰'],
  ankara: [790, 340, '🧵'],
};

const STATE_LABEL = { open: 'Open', struggling: 'Low on cash', closed: 'Closed' } as const;
const VEHICLE = { wheelbarrow: '🛒', keke: '🛺', van: '🚐' } as const;

export function DistrictMap({ state, selected, onSelect }: { state: GameState; selected: Selection; onSelect: (s: Selection) => void }) {
  const press = (fn: () => void) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fn()),
  });

  return (
    <svg viewBox="0 0 900 560" className="map" aria-label="Map of the market district">
      {/* roads */}
      <g className="road">
        <path d="M110 90 H150 M110 190 H150" />
        <path d="M480 150 H520" />
        <path d="M315 260 V320" />
        <path d="M185 400 H300 M185 490 H300" />
        <path d="M660 430 H760 V340 H790" />
        <path d="M690 260 V340" />
      </g>

      {(Object.keys(ZONES) as MarketId[]).map((id) => {
        const z = ZONES[id];
        const here = state.you.at === id;
        return (
          <g key={id}>
            <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={18} className={`zone ${here ? 'here' : ''}`} />
            <text x={z.x + 16} y={z.y + 26} className="zone-label">{z.label}</text>
            {here && <text x={z.x + z.w - 16} y={z.y + 28} textAnchor="end" className="you-are-here">{VEHICLE[state.you.vehicle]} you are here</text>}
          </g>
        );
      })}

      {state.stalls.map((s) => {
        const [x, y] = STALL_POS[s.id];
        const on = selected?.kind === 'stall' && selected.id === s.id;
        return (
          <g key={s.id} transform={`translate(${x - 56} ${y - 34})`} className={`stall ${s.state} ${on ? 'on' : ''}`} {...press(() => onSelect({ kind: 'stall', id: s.id }))} aria-label={`${s.name}, ${STATE_LABEL[s.state]}`}>
            <rect width={112} height={68} rx={10} className="stall-body" />
            <rect width={112} height={14} rx={7} className="awning" />
            <text x={56} y={36} textAnchor="middle" className="stall-name">{s.name}</text>
            <text x={56} y={55} textAnchor="middle" className="stall-status">
              {s.state === 'closed' ? '✕ ' : s.state === 'struggling' ? '▼ ' : '● '}
              {STATE_LABEL[s.state]}
            </text>
          </g>
        );
      })}

      {state.sources.map((src) => {
        const pos = SOURCE_POS[src.item];
        if (!pos) return null;
        const [x, y, icon] = pos;
        const on = selected?.kind === 'source' && selected.item === src.item;
        return (
          <g key={src.item} transform={`translate(${x} ${y})`} className={`source ${on ? 'on' : ''} ${src.units < 5 ? 'empty' : ''}`} {...press(() => onSelect({ kind: 'source', item: src.item }))} aria-label={`${src.label}, ${src.units} available`}>
            <circle r={28} />
            <text y={8} textAnchor="middle" className="source-icon">{icon}</text>
            <text y={46} textAnchor="middle" className="source-label">{src.item}</text>
            <text y={60} textAnchor="middle" className="source-units">{src.cost > 0 ? `₦${src.cost} each` : `${src.units} left`}</text>
          </g>
        );
      })}
    </svg>
  );
}
