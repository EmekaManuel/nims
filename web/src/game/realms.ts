import type { Item, MarketId, RealmId } from '../api';

/**
 * Where things are in each realm, on the same 1000 x 680 canvas the town is drawn on (2D) and projected from (3D).
 * The town's own tables live in Map.tsx and paths.ts; this is the harbour's, plus the road signs between the two.
 */
export const REALM_OF: Record<MarketId, RealmId> = { produce: 'town', fabric: 'town', scrap: 'town', harbour: 'saltmere' };

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

/** The road sign in each realm, and where it leads. */
export const ROAD_SIGN: Record<RealmId, { at: [number, number]; to: RealmId; label: string }> = {
  town: { at: [845, 655], to: 'saltmere', label: 'To Saltmere Harbour' },
  saltmere: { at: [90, 200], to: 'town', label: 'To Nims' },
};
