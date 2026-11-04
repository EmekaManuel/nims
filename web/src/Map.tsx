import type { Focus, GameState, Item, MarketId } from './api';

export type Selection = { kind: 'stall'; id: string } | { kind: 'source'; item: Item } | null;

/**
 * Hand-placed layout (viewBox 1000 x 620). Exported so a test can prove nothing overlaps.
 * Stalls are centred on these points; every stall is STALL_W x STALL_H.
 */
export const STALL_W = 136;
export const STALL_H = 76;

export const ZONES: Record<MarketId, { x: number; y: number; w: number; h: number; label: string }> = {
  produce: { x: 170, y: 30, w: 380, h: 262, label: 'Produce Market' },
  fabric: { x: 600, y: 30, w: 380, h: 262, label: 'Fabric Market' },
  scrap: { x: 290, y: 340, w: 470, h: 250, label: 'Scrap & Hardware' },
};

export const STALL_POS: Record<string, [number, number]> = {
  bisi: [260, 130], tunde: [460, 130], kemi: [360, 232],
  nkechi: [690, 130], sade: [890, 130],
  chidi: [377, 470], wale: [525, 470], emeka: [673, 470],
};

const SOURCE_POS: Partial<Record<Item, [number, number, string]>> = {
  tomatoes: [80, 100, '🍅'],
  pepper: [80, 225, '🌶️'],
  iron: [130, 440, '🔩'],
  'copper wire': [130, 545, '➰'],
  ankara: [880, 420, '🧵'],
};

const STATE_LABEL = { open: 'Open', struggling: 'Low on cash', closed: 'Closed' } as const;
const VEHICLE = { wheelbarrow: '🛒', keke: '🛺', van: '🚐' } as const;

export function DistrictMap({ state, selected, onSelect }: { state: GameState; selected: Selection; onSelect: (s: Selection) => void }) {
  const focus: Focus = state.coach.focus;
  const press = (fn: () => void) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fn()),
  });

  return (
    <svg viewBox="0 0 1000 620" className="map" aria-label="Map of the market district">
      <g className="road">
        <path d="M110 100 H170 M110 225 H170" />
        <path d="M160 440 H290 M160 545 H290" />
        <path d="M550 160 H600" />
        <path d="M360 292 V340" />
        <path d="M760 470 H880 V450" />
        <path d="M880 292 V390" />
      </g>

      {(Object.keys(ZONES) as MarketId[]).map((id) => {
        const z = ZONES[id];
        const here = state.you.at === id;
        return (
          <g key={id}>
            <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={20} className={`zone ${here ? 'here' : ''}`} />
            <text x={z.x + 20} y={z.y + 32} className="zone-label">{z.label}</text>
            {here && <text x={z.x + z.w - 20} y={z.y + 32} textAnchor="end" className="you-are-here">{VEHICLE[state.you.vehicle]} you are here</text>}
          </g>
        );
      })}

      {state.stalls.map((s) => {
        const [x, y] = STALL_POS[s.id];
        const on = selected?.kind === 'stall' && selected.id === s.id;
        const next = focus?.kind === 'stall' && focus.id === s.id;
        return (
          <g key={s.id} transform={`translate(${x - STALL_W / 2} ${y - STALL_H / 2})`} className={`stall ${s.state} ${on ? 'on' : ''}`} {...press(() => onSelect({ kind: 'stall', id: s.id }))} aria-label={`${s.name}, ${STATE_LABEL[s.state]}${next ? ', your next step' : ''}`}>
            {next && <rect className="pulse" x={-8} y={-8} width={STALL_W + 16} height={STALL_H + 16} rx={16} />}
            <rect width={STALL_W} height={STALL_H} rx={12} className="stall-body" />
            <rect width={STALL_W} height={16} rx={8} className="awning" />
            <text x={STALL_W / 2} y={42} textAnchor="middle" className="stall-name">{s.name}</text>
            <text x={STALL_W / 2} y={63} textAnchor="middle" className="stall-status">
              {s.state === 'closed' ? '✕ ' : s.state === 'struggling' ? '▼ ' : '● '}
              {STATE_LABEL[s.state]}
            </text>
            {next && <text x={STALL_W / 2} y={-16} textAnchor="middle" className="next-tag">NEXT</text>}
          </g>
        );
      })}

      {state.sources.map((src) => {
        const pos = SOURCE_POS[src.item];
        if (!pos) return null;
        const [x, y, icon] = pos;
        const on = selected?.kind === 'source' && selected.item === src.item;
        const next = focus?.kind === 'source' && focus.id === src.item;
        return (
          <g key={src.item} transform={`translate(${x} ${y})`} className={`source ${on ? 'on' : ''} ${src.units < 5 ? 'empty' : ''}`} {...press(() => onSelect({ kind: 'source', item: src.item }))} aria-label={`${src.label}, ${src.units} available${next ? ', your next step' : ''}`}>
            {next && <circle className="pulse" r={42} />}
            <circle r={32} />
            <text y={10} textAnchor="middle" className="source-icon">{icon}</text>
            <text y={54} textAnchor="middle" className="source-label">{src.item}</text>
            <text y={72} textAnchor="middle" className="source-units">{src.cost > 0 ? `₦${src.cost} each` : `${src.units} free`}</text>
            {next && <text y={-48} textAnchor="middle" className="next-tag">NEXT</text>}
          </g>
        );
      })}
    </svg>
  );
}
