import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BODY, C, Glass, MONO, Words, clamp, ease, fmt } from '../ui';
import { FPS, type Scene } from '../timeline';
import type { Camera } from './Screen';

export const sec = (t: number) => t * FPS;

// ---------- keyframes ----------
export interface CursorKey { t: number; x: number; y: number; click?: boolean }
export interface CameraKey { t: number; x: number; y: number; zoom: number }

/** The camera at time `t` (seconds): ease from the previous view to the latest one over about 0.9 s. */
export function cameraAt(keys: CameraKey[], t: number): Camera {
  let i = 0;
  for (let k = 0; k < keys.length; k++) if (t >= keys[k].t) i = k;
  const cur = keys[i], prev = keys[i - 1] ?? cur;
  const e = ease(interpolate(t - cur.t, [0, 0.9], [0, 1], clamp));
  const mix = (a: number, b: number) => a + (b - a) * e;
  return { x: mix(prev.x, cur.x), y: mix(prev.y, cur.y), zoom: mix(prev.zoom, cur.zoom) };
}

/** Where the cursor is at time `t`: it glides between its keys, and rests between them. */
function cursorAt(keys: CursorKey[], t: number) {
  if (t <= keys[0].t) return { x: keys[0].x, y: keys[0].y };
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1], b = keys[i];
      const e = ease(interpolate(t, [a.t, b.t], [0, 1], clamp));
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    }
  }
  const last = keys[keys.length - 1];
  return { x: last.x, y: last.y };
}

/** A mouse pointer with a click ripple. Positions are on the 1920x1080 screen; the camera moves the cursor with the UI but not its size. */
export const Cursor: React.FC<{ keys: CursorKey[]; camera: Camera; t: number }> = ({ keys, camera, t }) => {
  const p = cursorAt(keys, t);
  const z = camera.zoom;
  const tx = Math.min(0, Math.max(1920 - 1920 * z, 1920 / 2 - camera.x * z));
  const ty = Math.min(0, Math.max(1080 - 1080 * z, 1080 / 2 - camera.y * z));
  const x = p.x * z + tx, y = p.y * z + ty;
  const clicks = keys.filter((k) => k.click);
  const press = clicks.some((k) => t >= k.t && t < k.t + 0.14);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, pointerEvents: 'none' }}>
      {clicks.map((k, i) => {
        const age = t - k.t;
        if (age < 0 || age > 0.55) return null;
        const r = interpolate(age, [0, 0.55], [8, 62], clamp);
        const kx = k.x * z + tx, ky = k.y * z + ty;
        return <div key={i} style={{ position: 'absolute', left: kx - r, top: ky - r, width: r * 2, height: r * 2, borderRadius: r * 2, border: '3px solid rgba(47,107,255,.85)', background: 'rgba(47,107,255,.18)', opacity: 1 - age / 0.55 }} />;
      })}
      <svg width="34" height="34" viewBox="0 0 24 24" style={{ position: 'absolute', left: x - 4, top: y - 3, transform: `scale(${press ? 0.86 : 1})`, transformOrigin: '4px 3px', filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.45))' }}>
        <path d="M4 2.5l15 9.2-6.5 1.5 3.6 6.6-2.7 1.4-3.5-6.7-4.6 4.4z" fill="#fff" stroke="#10182e" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// ---------- callouts ----------
export const Pill: React.FC<{ at: number; hold: number; children: React.ReactNode; top?: number }> = ({ at, hold, children, top = 26 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = spring({ frame: f - at, fps, config: { damping: 15, stiffness: 140 } });
  const out = interpolate(f, [at + hold, at + hold + 10], [1, 0], clamp);
  if (f < at) return null;
  return <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: inn * out, transform: `translateY(${(1 - inn) * -30}px) scale(${0.92 + inn * 0.08})`, pointerEvents: 'none' }}>{children}</div>;
};

export const Stat: React.FC<{ label: string; from: number; to: number; at: number; sign?: boolean }> = ({ label, from, to, at, sign }) => {
  const f = useCurrentFrame();
  const v = from + (to - from) * interpolate(f, [at, at + 34], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  const delta = to - from;
  return (
    <Glass style={{ padding: '16px 34px', display: 'flex', alignItems: 'center', gap: 26 }}>
      <div style={{ font: `700 20px ${BODY}`, color: C.mute, letterSpacing: 3 }}>{label}</div>
      <div style={{ font: `700 54px/1 ${MONO}`, color: C.ink }}>{fmt(v)}</div>
      <div style={{ font: `700 32px ${MONO}`, color: delta >= 0 ? C.green : '#ff7a90' }}>{sign && delta > 0 ? '+' : ''}{fmt(delta)}</div>
    </Glass>
  );
};

/** A simple "+N coins" callout. */
export const Gain: React.FC<{ label: string; coins: number }> = ({ label, coins }) => (
  <Glass style={{ padding: '16px 34px', display: 'flex', alignItems: 'center', gap: 26 }}>
    <div style={{ font: `700 20px ${BODY}`, color: C.mute, letterSpacing: 3 }}>{label}</div>
    <div style={{ font: `700 54px/1 ${MONO}`, color: C.green }}>+{fmt(coins)} <span style={{ fontSize: 28, color: C.mute }}>coins</span></div>
  </Glass>
);

export const Chips: React.FC<{ s: Scene; items: string[] }> = ({ s, items }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', top: 30, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14, pointerEvents: 'none' }}>
      {items.map((t, i) => {
        const at = s.delay + s.voiceFrames * (0.52 + i * 0.1);
        const o = interpolate(f, [at, at + 9], [0, 1], clamp) * interpolate(f, [s.frames - 24, s.frames - 8], [1, 0], clamp);
        return <div key={t} style={{ opacity: o, transform: `translateY(${(1 - o) * -22}px)`, padding: '11px 24px', borderRadius: 99, background: 'rgba(9,18,46,.88)', border: '1.5px solid rgba(59,224,143,.6)', font: `700 26px ${BODY}`, color: C.ink, boxShadow: '0 10px 30px rgba(0,0,0,.4)' }}><span style={{ color: C.green, marginRight: 10 }}>✕</span>{t}</div>;
      })}
    </div>
  );
};

/** The narration as a small pill above the game's own bottom bar, so the whole app stays visible. It leaves once the voice is done if a merchant is about to speak. */
export const Caption: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame();
  const endsAt = s.clip ? s.delay + s.voiceFrames + 24 : s.frames;
  const o = interpolate(f, [0, 8, endsAt - 10, endsAt], [0, 1, 1, 0], clamp);
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 96, display: 'flex', justifyContent: 'center', opacity: o, transform: `translateY(${(1 - o) * 14}px)`, pointerEvents: 'none' }}>
      <Glass style={{ padding: '14px 34px 16px', width: 1280, borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ font: `700 15px ${BODY}`, color: C.gold, letterSpacing: 3, textTransform: 'uppercase' }}>{s.chapter}</div>
        <Words text={s.text} start={s.delay} frames={s.voiceFrames} size={s.text.length > 110 ? 28 : 31} />
      </Glass>
    </div>
  );
};
