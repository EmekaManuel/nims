import { interpolate } from 'remotion';
import { ease, clamp } from '../ui';
import { wx, wz } from '../../../web/src/game/paths';
import type { Rect } from './model';

export type V3 = [number, number, number];
export interface CamKey { t: number; pos: V3; look: V3; fov: number }
export interface Cam { position: V3; target: V3; fov: number }

/** The 3D camera at time `t`: it moves smoothly (ease in, ease out) from each key to the next, and rests after the last. */
export function townCamAt(keys: CamKey[], t: number): Cam {
  if (t <= keys[0].t) return { position: keys[0].pos, target: keys[0].look, fov: keys[0].fov };
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1], b = keys[i];
      const e = ease(interpolate(t, [a.t, b.t], [0, 1], clamp));
      const mix = (p: V3, q: V3): V3 => [p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e, p[2] + (q[2] - p[2]) * e];
      return { position: mix(a.pos, b.pos), target: mix(a.look, b.look), fov: a.fov + (b.fov - a.fov) * e };
    }
  }
  const l = keys[keys.length - 1];
  return { position: l.pos, target: l.look, fov: l.fov };
}

/** Where a point in the 3D town lands on the 1920x1080 screen, for the cursor to point at. `map` is the canvas's rectangle on that screen. */
export function project(map: Rect, cam: Cam, p: V3): { x: number; y: number } {
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
  const f = norm(sub(cam.target, cam.position));
  const right = norm(cross(f, [0, 1, 0]));
  const up = cross(right, f);
  const v = sub(p, cam.position);
  const depth = dot(v, f);
  const tan = Math.tan((cam.fov * Math.PI) / 360);
  const ndcX = dot(v, right) / (depth * tan * (map.w / map.h));
  const ndcY = dot(v, up) / (depth * tan);
  return { x: map.x + (ndcX * 0.5 + 0.5) * map.w, y: map.y + (0.5 - ndcY * 0.5) * map.h };
}

/** Places in the town, as points on the stall or shed that a person would click. */
export const SPOT = {
  cotton: [wx(890), 0.9, wz(470)] as V3,
  lena: [wx(685), 0.8, wz(140)] as V3,
  diego: [wx(690), 0.8, wz(522)] as V3,
  kai: [wx(700), 0.9, wz(384)] as V3,
};

export const OVERVIEW: CamKey = { t: 0, pos: [0, 9.5, 11], look: [0, 0, -0.5], fov: 38 };
