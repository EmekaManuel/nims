import { PLOTS, STALL_POS } from './Map';

/**
 * The walkways of the 3D town. Townsfolk only ever move along these, and they stop in front of stalls and
 * sources, never on top of them. A test (paths.test.ts) samples every walkway and checks it stays clear of every
 * stall, plot, source, tree and lamp, so a change to the layout that would put someone through a building fails.
 *
 * Coordinates are the 2D map's pixels (a 1000 x 680 canvas); wx and wz turn them into world units (50 px = 1 unit).
 */
export const U = 50;
export const wx = (px: number) => (px - 500) / U;
export const wz = (py: number) => (py - 340) / U;

export type Pt = [number, number];

/**
 * Corners and meeting points of the walkways. The streets:
 *   west road   x=165 (down the west edge, past the field and the scrap heaps)
 *   Market St   y=205 (through the produce and fabric stalls, in front of the top row)
 *   plaza       y=352 (between the markets)
 *   scrap St    y=600 (in front of the scrap stalls)
 *   east road   x=968, and the two crossings at x=360 and x=580
 */
export const NODES: Record<string, Pt> = {
  // west road
  w110: [165, 110], w205: [165, 205], w250: [165, 250], w352: [165, 352], w470: [165, 470], w590: [165, 590], w600: [165, 600],
  // Market St
  m255: [255, 205], m360: [360, 205], m465: [465, 205], m580: [580, 205], m685: [685, 205], m790: [790, 205], m895: [895, 205], m968: [968, 205],
  // plaza
  p255: [255, 352], p360: [360, 352], p465: [465, 352], p580: [580, 352], p790: [790, 352], p968: [968, 352],
  // east road
  e470: [968, 470], e600: [968, 600],
  // scrap St
  s310: [310, 600], s500: [500, 600], s690: [690, 600],
  // standing places in front of the stalls and plots that face the plaza (a few steps off the street)
  tomas: [255, 335], plotP: [465, 335], plotF: [790, 335],
};

export const EDGES: [string, string][] = [
  ['w110', 'w205'], ['w205', 'w250'], ['w250', 'w352'], ['w352', 'w470'], ['w470', 'w590'], ['w590', 'w600'],
  ['w205', 'm255'], ['m255', 'm360'], ['m360', 'm465'], ['m465', 'm580'], ['m580', 'm685'], ['m685', 'm790'], ['m790', 'm895'], ['m895', 'm968'],
  ['w352', 'p255'], ['p255', 'p360'], ['p360', 'p465'], ['p465', 'p580'], ['p580', 'p790'], ['p790', 'p968'],
  ['m360', 'p360'], ['m580', 'p580'], ['m968', 'p968'],
  ['p968', 'e470'], ['e470', 'e600'],
  ['w600', 's310'], ['s310', 's500'], ['s500', 's690'], ['s690', 'e600'],
  ['p255', 'tomas'], ['p465', 'plotP'], ['p790', 'plotF'],
];

/** Where someone stands to visit a place, and which way they face (radians about the vertical axis: PI looks north, -PI/2 west). */
export interface Stop { node: string; facing: number }
const NORTH = Math.PI;
const WEST = -Math.PI / 2;

/**
 * In front of each stall. Every stall faces south, so a customer stands on the street south of it and looks north:
 * on Market St for the top rows, on the plaza for Tomas and the plots, and on Scrap St for the scrap stalls.
 */
export const STALL_STOP: Record<string, Stop> = {
  mira: { node: 'm255', facing: NORTH }, june: { node: 'm465', facing: NORTH }, tomas: { node: 'tomas', facing: NORTH },
  lena: { node: 'm685', facing: NORTH }, omar: { node: 'm895', facing: NORTH },
  anil: { node: 's310', facing: NORTH }, ruth: { node: 's500', facing: NORTH }, diego: { node: 's690', facing: NORTH },
};
/** A player's own stall stands on a free plot. */
export const PLOT_STOP: Partial<Record<string, Stop>> = { produce: { node: 'plotP', facing: NORTH }, fabric: { node: 'plotF', facing: NORTH } };
/** The sources are visited from the roads beside them, looking west at them (the cotton shed is west of the east road). */
export const SOURCE_STOP: Record<string, Stop> = {
  tomatoes: { node: 'w110', facing: WEST }, pepper: { node: 'w250', facing: WEST }, iron: { node: 'w470', facing: WEST }, 'copper wire': { node: 'w590', facing: WEST },
  cotton: { node: 'e470', facing: WEST },
};

export const stopForStall = (id: string, market: string): Stop | undefined => STALL_STOP[id] ?? PLOT_STOP[market];

// ---- routing --------------------------------------------------------------------------------

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const adj = new Map<string, string[]>();
for (const [a, b] of EDGES) {
  adj.set(a, [...(adj.get(a) ?? []), b]);
  adj.set(b, [...(adj.get(b) ?? []), a]);
}

/** The shortest walk between two nodes along the walkways, as a list of node names (both ends included). null if there is none. */
export function route(from: string, to: string): string[] | null {
  if (from === to) return [from];
  const best = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const todo = new Set<string>([from]);
  while (todo.size) {
    let cur = '';
    for (const n of todo) if (cur === '' || best.get(n)! < best.get(cur)!) cur = n;
    todo.delete(cur);
    if (cur === to) break;
    for (const nb of adj.get(cur) ?? []) {
      const d = best.get(cur)! + dist(NODES[cur], NODES[nb]);
      if (d < (best.get(nb) ?? Infinity)) { best.set(nb, d); prev.set(nb, cur); todo.add(nb); }
    }
  }
  if (!best.has(to)) return null;
  const out = [to];
  while (out[0] !== from) out.unshift(prev.get(out[0])!);
  return out;
}

// ---- what the walkways must stay clear of ----------------------------------------------------

export interface Box { cx: number; cy: number; hx: number; hy: number }
/** px per unit, to turn world half-sizes into the pixel coordinates used above. */
const px = (u: number) => u * U;

/** Every stall and free plot: the counter and awning together are 2.8 x 1.6 units, around its centre. */
export const STALL_BOXES: Box[] = [
  ...Object.values(STALL_POS).map(([x, y]): Box => ({ cx: x, cy: y, hx: px(1.4), hy: px(0.8) })),
  ...Object.values(PLOTS).map((p): Box => ({ cx: p![0], cy: p![1], hx: px(1.4), hy: px(0.8) })),
];

/** The sources. Crop beds and the cotton shed are boxes (the shed with its bales); the heaps are generous squares. */
export const SOURCE_POS: Record<string, Pt> = {
  tomatoes: [82, 110], pepper: [82, 250], iron: [100, 470], 'copper wire': [100, 590], cotton: [890, 470],
};
export const SOURCE_BOXES: Box[] = [
  { cx: 82, cy: 110, hx: px(1.0), hy: px(0.6) },
  { cx: 82, cy: 250, hx: px(1.0), hy: px(0.6) },
  { cx: 100, cy: 470, hx: px(0.95), hy: px(0.95) },
  { cx: 100, cy: 590, hx: px(0.95), hy: px(0.95) },
  { cx: 890, cy: 470, hx: px(1.0), hy: px(1.1) },
];

/** Trees: [x, y, scale] and the canopy radius is 0.45 units times the scale. */
export const TREES: [number, number, number][] = [
  [44, 372, 1], [1030, 392, 0.9], [900, 640, 0.8], [30, 660, 0.7], [570, 660, 0.7], [1010, 200, 0.8],
];
export const treeRadius = (s: number) => px(0.45 * s);

/** Street lamps along the roads (a thin pole), and the small lamp on the corner of every stall. */
export const LAMPS: Pt[] = [[130, 190], [130, 530], [556, 140], [556, 372], [880, 372], [330, 372]];
export const stallLamps = (): Pt[] => [...Object.values(STALL_POS), ...Object.values(PLOTS).map((p) => p!)].map(([x, y]) => [x + px(1.4), y + px(0.7)] as Pt);
export const LAMP_RADIUS = px(0.05);

/** Distance from a point to a box (0 inside it). */
export function distToBox(p: Pt, b: Box): number {
  const dx = Math.max(Math.abs(p[0] - b.cx) - b.hx, 0);
  const dy = Math.max(Math.abs(p[1] - b.cy) - b.hy, 0);
  return Math.hypot(dx, dy);
}

// ---- walking ---------------------------------------------------------------------------------

/** A tiny seeded generator, so a given walker always behaves the same way. */
export function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/** Turn `cur` toward `target` by a fraction, the short way round. */
const turn = (cur: number, target: number, k: number) => cur + ((((target - cur + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * Math.min(1, k);

/** One townsperson's state: where they are (world units), where they are headed, and how long they will stand. */
export interface Walk { at: string; path: Pt[]; goal?: Stop; dwell: number; x: number; z: number; yaw: number; rng: () => number }

export function newWalk(seed: number, stops: Stop[]): Walk {
  const rng = seeded(seed);
  const at = stops.length ? stops[Math.floor(rng() * stops.length)].node : 'm255';
  return { at, path: [], dwell: rng() * 3, x: wx(NODES[at][0]), z: wz(NODES[at][1]), yaw: Math.PI, rng };
}

/**
 * Move a walker on by `dt` seconds. They only ever travel straight along a walkway toward its next corner, so their
 * position is always on a street. Standing in front of a stall, they turn to face it.
 */
export function stepWalk(s: Walk, stops: Stop[], speed: number, dt: number) {
  if (s.path.length === 0) {
    if (s.dwell > 0) {
      s.dwell -= dt;
      if (s.goal) s.yaw = turn(s.yaw, s.goal.facing, dt * 6);
    } else {
      const options = stops.filter((o) => o.node !== s.at);
      const goal = options[Math.floor(s.rng() * options.length)];
      const r = goal ? route(s.at, goal.node) : null;
      if (goal && r) { s.goal = goal; s.path = r.slice(1).map((n) => [wx(NODES[n][0]), wz(NODES[n][1])] as Pt); }
      else s.dwell = 2; // nowhere to go right now
    }
  }
  if (s.path.length) {
    const [tx, tz] = s.path[0];
    const dx = tx - s.x, dz = tz - s.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d > 1e-6) s.yaw = turn(s.yaw, Math.atan2(dx, dz), dt * 10);
    if (d <= step) {
      s.x = tx; s.z = tz; s.path.shift();
      if (s.path.length === 0 && s.goal) { s.at = s.goal.node; s.dwell = 3 + s.rng() * 4; }
    } else { s.x += (dx / d) * step; s.z += (dz / d) * step; }
  }
}

// ---- walkers as a pure function of time (for the demo video) ---------------------------------

export interface WalkSample { x: number; z: number; yaw: number; moving: boolean }
const STEP = 1 / 30;
const trajectories = new Map<string, { w: Walk; samples: WalkSample[] }>();

/**
 * Where a walker is at time `t` seconds, always the same answer for the same seed, stops and speed. It plays the walk forward
 * in 1/30 s steps from the start and remembers the result, so any moment can be asked for in any order. The video renders its
 * frames out of order and in parallel, so it cannot keep a walker's state from one frame to the next as the live game does.
 */
export function walkAt(seed: number, stops: Stop[], speed: number, t: number): WalkSample {
  const key = `${seed}|${speed}|${stops.map((s) => `${s.node}:${s.facing.toFixed(2)}`).join(',')}`;
  let tr = trajectories.get(key);
  if (!tr) { tr = { w: newWalk(seed, stops), samples: [] }; trajectories.set(key, tr); }
  const want = Math.max(0, Math.floor(t / STEP));
  while (tr.samples.length <= want) {
    stepWalk(tr.w, stops, speed, STEP);
    tr.samples.push({ x: tr.w.x, z: tr.w.z, yaw: tr.w.yaw, moving: tr.w.path.length > 0 });
  }
  return tr.samples[want];
}
