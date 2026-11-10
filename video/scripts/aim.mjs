// Works out where to aim the 3D camera so a point in the town lands at a chosen pixel on the 1920x1080 screen.
// The side drawer covers the right third of the map when it is open, so the video aims its subject at the left-centre.
//   node scripts/aim.mjs
const MAP = { x: 348, y: 109, w: 1572, h: 908 };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

/** Pixel of world point p for a camera at pos looking along forward vector f. */
function pixel(pos, f, fov, p) {
  const right = norm(cross(f, [0, 1, 0]));
  const up = cross(right, f);
  const v = sub(p, pos);
  const d = dot(v, f);
  const tan = Math.tan((fov * Math.PI) / 360);
  return [MAP.x + ((dot(v, right) / (d * tan * (MAP.w / MAP.h))) * 0.5 + 0.5) * MAP.w, MAP.y + (0.5 - (dot(v, up) / (d * tan)) * 0.5) * MAP.h];
}
/** Turn forward vector f by `yaw` about the vertical and `pitch` up. */
function turn(f, yaw, pitch) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let g = [f[0] * c + f[2] * s, f[1], -f[0] * s + f[2] * c];
  const right = norm(cross(g, [0, 1, 0]));
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const up = cross(right, g);
  g = add(mul(g, cp), mul(up, sp));
  return norm(g);
}
export function aim(pos, fov, world, want) {
  const base = norm(sub(world, pos));
  let a = 0, b = 0;
  for (let i = 0; i < 60; i++) {
    const at = (y, p) => pixel(pos, turn(base, y, p), fov, world);
    const [px, py] = at(a, b);
    const ex = want[0] - px, ey = want[1] - py;
    if (Math.hypot(ex, ey) < 0.5) break;
    const h = 1e-4;
    const [x1, y1] = at(a + h, b), [x2, y2] = at(a, b + h);
    const J = [[(x1 - px) / h, (x2 - px) / h], [(y1 - py) / h, (y2 - py) / h]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    a += (ex * J[1][1] - ey * J[0][1]) / det;
    b += (-ex * J[1][0] + ey * J[0][0]) / det;
  }
  const f = turn(base, a, b);
  const look = add(pos, mul(f, 10));
  return { pos, look: look.map((x) => Math.round(x * 1000) / 1000), fov, check: pixel(pos, f, fov, world).map(Math.round) };
}

/** The video's 2D camera (a zoom and pan of the whole screen, see Screen.tsx): where does a point in the unzoomed screen end up? */
const css = (z, cx, cy) => {
  const tx = Math.min(0, Math.max(1920 - 1920 * z, 960 - cx * z)), ty = Math.min(0, Math.max(1080 - 1080 * z, 540 - cy * z));
  return (fx, fy) => [(fx - tx) / z, (fy - ty) / z]; // final screen pixel -> pixel before the zoom
};
const px = (x) => (x - 500) / 50, pz = (y) => (y - 340) / 50;
const COTTON = [px(890), 0.9, pz(470)], LENA = [px(685), 0.9, pz(140)], FAB = [px(790), 0.8, pz(140)];
const KAI = [px(700), 0.9, pz(384)], DIEGO = [px(690), 0.8, pz(522)];
// aim(position, fov, world point, where it should land on the FINAL picture, given the zoom in force)
const A = (pos, fov, world, zoomCam, final) => aim(pos, fov, world, css(...zoomCam)(...final));
const cams = {
  EAST: A([12.2, 4.6, 9.6], 38, COTTON, [1.2, 1300, 540], [760, 560]),
  EAST_B: A([11.6, 4.4, 10.2], 38, COTTON, [1.2, 1300, 540], [740, 560]),
  LENA: A([2.8, 3.2, 2.4], 42, LENA, [1.45, 1560, 520], [560, 650]),
  LENA2: A([4.6, 3.4, 2.7], 42, LENA, [1.45, 1560, 520], [540, 640]),
  LENA3: A([3.4, 3.0, 2.2], 42, LENA, [1.35, 1300, 800], [540, 600]),
  FABRIC: A([5.6, 5.8, 6.8], 44, FAB, [1.45, 1550, 420], [600, 560]),
  FABRIC2: A([3.0, 6.0, 7.2], 44, FAB, [1.45, 1550, 420], [620, 560]),
  WIDE_A: aim([-1.2, 9.2, 11.6], 38, [0, 0.3, -0.6], [820, 560]),
  WIDE_B: aim([2.6, 8.8, 11.8], 38, [0, 0.3, -0.6], [800, 560]),
  KAI1: A([5.6, 5.8, 6.8], 44, KAI, [1, 960, 540], [720, 560]),
  KAI2: A([4.0, 4.6, 5.4], 40, KAI, [1.3, 1300, 480], [640, 540]),
  SCRAP: A([2.6, 4.6, 11.4], 42, DIEGO, [1, 960, 540], [820, 600]),
  SCRAP2: A([1.6, 3.6, 9.0], 42, DIEGO, [1.45, 1550, 500], [560, 600]),
};
for (const [k, v] of Object.entries(cams)) console.log(k.padEnd(8), `{ pos: ${JSON.stringify(v.pos)}, look: ${JSON.stringify(v.look)}, fov: ${v.fov} }`, '// lands at', v.check);
