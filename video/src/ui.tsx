import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';

// One plain sans-serif for everything.
export const BODY = loadInter('normal', { weights: ['500', '600', '700'] }).fontFamily;
export const HEAD = BODY;
export const MONO = BODY;

export const C = { navy: '#081230', deep: '#0d1f4a', blue: '#2f6bff', sky: '#7fb0ff', gold: '#ffc83d', ink: '#f4f7ff', mute: '#a9b8e0', green: '#3be08f' };
export const ease = Easing.bezier(0.65, 0, 0.25, 1);
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** 0 -> 1 over `dur` frames starting at `at`. */
export const useRamp = (at: number, dur: number, easing = ease) => interpolate(useCurrentFrame(), [at, at + dur], [0, 1], { ...clamp, easing });

/** Words that fade in as the voice reaches them (spread over ~85% of the line by letter count). */
export const Words: React.FC<{ text: string; start?: number; frames: number; size: number; color?: string; family?: string; weight?: number; width?: number }> = ({ text, start = 0, frames, size, color = C.ink, family = BODY, weight = 600, width }) => {
  const f = useCurrentFrame();
  const words = text.split(' ');
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let acc = 0;
  return (
    <div style={{ font: `${weight} ${size}px/1.3 ${family}`, color, textAlign: 'center', textWrap: 'balance' as never, width }}>
      {words.map((w, i) => {
        const at = start + (acc / total) * frames * 0.85;
        acc += w.length + 1;
        const o = interpolate(f, [at, at + 7], [0, 1], clamp);
        return <span key={i} style={{ display: 'inline-block', marginRight: '0.27em', opacity: o, transform: `translateY(${(1 - o) * 9}px)`, filter: `blur(${(1 - o) * 3}px)` }}>{w}</span>;
      })}
    </div>
  );
};

/** The game's own mascot, Nim (same drawing as web/src/Mascot.tsx), floating gently: the logo mark everywhere in the video. */
export const Mark: React.FC<{ size: number }> = ({ size }) => {
  const f = useCurrentFrame();
  const bob = Math.sin(f / 14) * size * 0.025;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ transform: `translateY(${bob}px)`, filter: 'drop-shadow(0 14px 30px rgba(59,157,255,.45))', overflow: 'visible' }}>
      <ellipse cx="32" cy="58" rx="16" ry="3.5" fill="#000" opacity=".25" />
      <circle cx="32" cy="35" r="23" fill="#3b9dff" />
      <circle cx="32" cy="35" r="23" fill="none" stroke="#1f6fd6" strokeWidth="2" />
      <ellipse cx="24" cy="24" rx="8" ry="5" fill="#8cc8ff" opacity=".7" transform="rotate(-25 24 24)" />
      <circle cx="24.5" cy="34" r="5.6" fill="#fff" /><circle cx="39.5" cy="34" r="5.6" fill="#fff" />
      <circle cx="25.5" cy="34.5" r="2.8" fill="#14253d" /><circle cx="38.5" cy="34.5" r="2.8" fill="#14253d" />
      <circle cx="26.3" cy="33.5" r="1" fill="#fff" /><circle cx="39.3" cy="33.5" r="1" fill="#fff" />
      <circle cx="17.5" cy="42" r="3.2" fill="#ff8fa8" opacity=".75" /><circle cx="46.5" cy="42" r="3.2" fill="#ff8fa8" opacity=".75" />
      <path d="M25 44c2 5 12 5 14 0z" fill="#14253d" />
      <circle cx="32" cy="9.5" r="7" fill="#ffc21a" stroke="#c98700" strokeWidth="1.6" />
      <circle cx="32" cy="9.5" r="4.2" fill="none" stroke="#e8a300" strokeWidth="1.2" />
      <path d="M30 12V7l4 5V7" fill="none" stroke="#a86f00" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const Glass: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: 'rgba(9,18,46,.86)', border: '1.5px solid rgba(127,176,255,.35)', borderRadius: 22, boxShadow: '0 24px 70px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04) inset', backdropFilter: 'blur(14px)', ...style }}>{children}</div>
);
