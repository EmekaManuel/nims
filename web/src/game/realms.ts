import type { Item, MarketId, RealmId } from '../api';

/**
 * Where things are in each realm, on the same 1000 x 680 canvas the town is drawn on (2D) and projected from (3D).
 * The town's own tables live in Map.tsx and paths.ts; this is the harbour's, plus the road signs between the two.
 */
export const REALM_OF: Record<MarketId, RealmId> = { produce: 'town', fabric: 'town', scrap: 'town', harbour: 'saltmere', woods: 'timberfell', mine: 'gemhollow', vale: 'sunvale' };

export const HARBOUR = {
  zone: { x: 200, y: 40, w: 600, h: 270, label: 'Saltmere Harbour', plate: 196 },
  stalls: { pike: [310, 150], marlow: [500, 150], zara: [690, 150] } as Record<string, [number, number]>,
  sources: { fish: [330, 420], salt: [690, 420] } as Partial<Record<Item, [number, number]>>,
  /** Where you stand at the harbour. */
  you: [500, 350] as [number, number],
  /** The waterline: everything below is sea. */
  shore: 500,
  boats: [[160, 590, 0.2], [470, 610, -0.15], [820, 585, 0.1]] as [number, number, number][],
};

/** The road sign in each realm, and where it leads first (the travel panel lists every road). */
export const ROAD_SIGN: Record<RealmId, { at: [number, number]; to: RealmId; label: string }> = {
  town: { at: [845, 655], to: 'saltmere', label: 'Roads out of town' },
  saltmere: { at: [90, 200], to: 'town', label: 'To Nims' },
  timberfell: { at: [930, 625], to: 'town', label: 'To Nims' },
  gemhollow: { at: [930, 625], to: 'town', label: 'To Nims' },
  sunvale: { at: [930, 625], to: 'town', label: 'To Nims' },
};

export type FrontierId = 'timberfell' | 'gemhollow' | 'sunvale';
export const isFrontier = (r: RealmId): r is FrontierId => r === 'timberfell' || r === 'gemhollow' || r === 'sunvale';

/** How each frontier looks: its ground, its market's colours, its own good, and what grows or stands around it. */
export const FRONTIER: Record<FrontierId, { market: MarketId; label: string; ground: string; zone: string; canopy: [string, string]; source: Item; decor: 'trees' | 'rocks' | 'vines' }> = {
  timberfell: { market: 'woods', label: 'Timberfell', ground: '#cfdcc0', zone: '#e2ead5', canopy: ['#6b4a2f', '#f3ead9'], source: 'timber', decor: 'trees' },
  gemhollow: { market: 'mine', label: 'Gem Hollow', ground: '#d3cdd6', zone: '#e6e1ea', canopy: ['#6250d6', '#f0edfb'], source: 'gems', decor: 'rocks' },
  sunvale: { market: 'vale', label: 'Sunvale', ground: '#ecdfb4', zone: '#f4ecd0', canopy: ['#8a2846', '#fbeef2'], source: 'wine', decor: 'vines' },
};

/**
 * One layout for every frontier: the source on the left, 8 plots in two rows (plot 0 is nearest the source, so the dearest),
 * the road out at the bottom right. Plots are stall-sized, so a business built on one fills it exactly.
 */
export const FRONTIER_LAYOUT = {
  zone: { x: 160, y: 40, w: 830, h: 520, plate: 150 },
  plots: [[290, 200], [290, 420], [470, 200], [470, 420], [650, 200], [650, 420], [830, 200], [830, 420]] as [number, number][],
  source: [108, 310] as [number, number],
  you: [560, 610] as [number, number],
};
