import { describe, expect, it } from 'vitest';
import {
  distToBox, EDGES, LAMP_RADIUS, LAMPS, newWalk, NODES, PLOT_STOP, route, stepWalk, wx, wz, SOURCE_BOXES, SOURCE_STOP, STALL_BOXES, STALL_STOP, stallLamps, treeRadius, TREES, U, type Pt,
} from './paths';
import { PLOTS, STALL_POS } from './Map';

/** A person is about 0.4 units across. Keep a hand's width more than that between them and anything solid. */
const BODY = 0.2 * U;
const MARGIN = 0.1 * U;
const CLEAR = BODY + MARGIN;

const along = (a: Pt, b: Pt, step = 2): Pt[] => {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Pt);
};

describe('walkways stay clear of everything solid', () => {
  const walk = EDGES.flatMap(([a, b]) => along(NODES[a], NODES[b]).map((p) => ({ p, edge: `${a}-${b}` })));

  it('every edge joins two real places, and every edge is a straight horizontal or vertical street', () => {
    for (const [a, b] of EDGES) {
      expect(NODES[a], a).toBeDefined();
      expect(NODES[b], b).toBeDefined();
      expect(NODES[a][0] === NODES[b][0] || NODES[a][1] === NODES[b][1], `${a}-${b} is diagonal`).toBe(true);
    }
  });

  it('never goes within a body-width and a margin of a stall, plot or source', () => {
    for (const { p, edge } of walk) {
      for (const b of [...STALL_BOXES, ...SOURCE_BOXES]) {
        expect(distToBox(p, b), `${edge} at ${p.map(Math.round)} is too close to a building at ${b.cx},${b.cy}`).toBeGreaterThanOrEqual(CLEAR);
      }
    }
  });

  it('never goes through a tree or too near a lamp', () => {
    for (const { p, edge } of walk) {
      for (const [x, y, s] of TREES) expect(Math.hypot(p[0] - x, p[1] - y) - treeRadius(s), `${edge} at ${p.map(Math.round)} hits the tree at ${x},${y}`).toBeGreaterThanOrEqual(CLEAR);
      for (const [x, y] of [...LAMPS, ...stallLamps()]) expect(Math.hypot(p[0] - x, p[1] - y) - LAMP_RADIUS, `${edge} at ${p.map(Math.round)} hits a lamp at ${x},${y}`).toBeGreaterThanOrEqual(CLEAR);
    }
  });

  it('keeps the places people stand clear too', () => {
    const stops = [...Object.values(STALL_STOP), ...Object.values(PLOT_STOP), ...Object.values(SOURCE_STOP)].map((s) => NODES[s!.node]);
    for (const p of stops) for (const b of [...STALL_BOXES, ...SOURCE_BOXES]) expect(distToBox(p, b)).toBeGreaterThanOrEqual(CLEAR);
  });
});

describe('visiting places', () => {
  const stops = [...Object.entries(STALL_STOP), ...Object.entries(SOURCE_STOP), ...Object.entries(PLOT_STOP)].map(([id, s]) => ({ id, ...s! }));

  it('every stall and plot the map draws has a place to stand', () => {
    for (const id of Object.keys(STALL_POS)) expect(STALL_STOP[id], id).toBeDefined();
    for (const market of Object.keys(PLOTS)) expect(PLOT_STOP[market], market).toBeDefined();
  });

  it('every stop can be reached from every other along the walkways', () => {
    for (const a of stops) for (const b of stops) expect(route(a.node, b.node), `${a.id} -> ${b.id}`).not.toBeNull();
  });

  it('a route only uses real walkways, one street at a time', () => {
    const edges = new Set(EDGES.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
    for (const a of stops) for (const b of stops) {
      const r = route(a.node, b.node)!;
      expect(r[0]).toBe(a.node);
      expect(r.at(-1)).toBe(b.node);
      for (let i = 1; i < r.length; i++) expect(edges.has(`${r[i - 1]}|${r[i]}`), `${r[i - 1]} -> ${r[i]}`).toBe(true);
    }
  });

  it('finds the short way: Mira to June along Market St is direct', () => {
    expect(route('m255', 'm465')).toEqual(['m255', 'm360', 'm465']);
  });

  it('every stop is a few steps from the thing it visits, facing it', () => {
    // a stall: you stand south of it, between half a unit and a unit and a half from its front
    for (const [id, [x, y]] of Object.entries(STALL_POS)) {
      const [sx, sy] = NODES[STALL_STOP[id].node];
      expect(Math.abs(sx - x), `${id} sideways`).toBeLessThan(U);
      expect(sy - y, `${id} is in front (south)`).toBeGreaterThan(0.8 * U);
      expect(sy - y, `${id} is not far`).toBeLessThan(2.6 * U);
    }
  });
});

describe('people walking', () => {
  const stops = [...Object.values(STALL_STOP), ...Object.values(PLOT_STOP), ...Object.values(SOURCE_STOP)].map((s) => s!);
  /** Distance from a world point to the nearest walkway, in pixels. */
  const offWalkway = (x: number, z: number) => {
    const p: Pt = [x * U + 500, z * U + 340];
    return Math.min(...EDGES.map(([a, b]) => {
      const [x1, y1] = NODES[a], [x2, y2] = NODES[b];
      const t = Math.max(0, Math.min(1, ((p[0] - x1) * (x2 - x1) + (p[1] - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2)));
      return Math.hypot(p[0] - (x1 + t * (x2 - x1)), p[1] - (y1 + t * (y2 - y1)));
    }));
  };

  it('over ten minutes, ten walkers are always on a walkway and never in a building, tree or lamp', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = newWalk(seed * 7919 + 13, stops);
      const speed = 0.8 + (seed % 3) * 0.12;
      for (let t = 0; t < 600; t += 1 / 30) {
        stepWalk(w, stops, speed, 1 / 30);
        expect(offWalkway(w.x, w.z), `walker ${seed} left the walkway at ${w.x.toFixed(2)},${w.z.toFixed(2)}`).toBeLessThan(0.5);
        const p: Pt = [w.x * U + 500, w.z * U + 340];
        for (const b of [...STALL_BOXES, ...SOURCE_BOXES]) if (distToBox(p, b) < BODY) throw new Error(`walker ${seed} is inside a building at ${p.map(Math.round)}`);
        for (const [x, y, s] of TREES) if (Math.hypot(p[0] - x, p[1] - y) < treeRadius(s) + BODY) throw new Error(`walker ${seed} walked into a tree at ${p.map(Math.round)}`);
      }
    }
  });

  it('they really do go shopping: every stop gets visited, and they stand there a while', () => {
    const seen = new Set<string>();
    let stood = 0;
    const w = newWalk(42, stops);
    for (let t = 0; t < 3600; t += 1 / 30) {
      stepWalk(w, stops, 1, 1 / 30);
      if (w.path.length === 0 && w.goal) {
        seen.add(w.goal.node);
        if (w.dwell > 0) stood++;
      }
    }
    for (const s of stops) expect(seen.has(s.node), `never visited ${s.node}`).toBe(true);
    expect(stood).toBeGreaterThan(30 * 30); // a good few seconds of standing in all
  });

  it('after a moment of standing in front of a stall they are facing it', () => {
    const w = newWalk(5, stops);
    let standing = 0;
    let checked = 0;
    for (let t = 0; t < 600 && checked < 8; t += 1 / 30) {
      stepWalk(w, stops, 1, 1 / 30);
      if (w.path.length === 0 && w.goal && w.dwell > 0) standing += 1 / 30; else standing = 0;
      if (standing > 1.2) { // long enough to have turned round
        const diff = Math.abs(((w.yaw - w.goal!.facing + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        expect(diff).toBeLessThan(0.2);
        checked++;
        w.dwell = 0.01;
        standing = 0;
      }
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('with nowhere to go they simply wait', () => {
    const w = newWalk(1, [stops[0]]);
    for (let t = 0; t < 60; t += 1 / 30) stepWalk(w, [stops[0]], 1, 1 / 30);
    expect(w.path).toEqual([]);
    expect([w.x, w.z]).toEqual([wx(NODES[stops[0].node][0]), wz(NODES[stops[0].node][1])]);
  });
});
