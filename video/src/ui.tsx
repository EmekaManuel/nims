import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
import { loadFont as loadFigtree } from '@remotion/google-fonts/Figtree';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

export const HEAD = loadFredoka('normal', { weights: ['600', '700'] }).fontFamily;
export const BODY = loadFigtree('normal', { weights: ['500', '600', '700'] }).fontFamily;
export const MONO = loadMono('normal', { weights: ['500', '700'] }).fontFamily;

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
        return <span key={i} style={{ display: 'inline-block', marginRight: '0.27em', opacity: 0.2 + o * 0.8, transform: `translateY(${(1 - o) * 9}px)`, filter: `blur(${(1 - o) * 3}px)` }}>{w}</span>;
      })}
    </div>
  );
};

export const Mark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ width: size, height: size, borderRadius: size, background: `radial-gradient(circle at 35% 30%, #ffe08a, ${C.gold} 55%, #e0a100)`, boxShadow: `0 ${size * 0.08}px ${size * 0.4}px rgba(255,200,61,.45), inset 0 -${size * 0.06}px 0 rgba(0,0,0,.15)`, display: 'grid', placeItems: 'center', font: `700 ${size * 0.58}px ${HEAD}`, color: '#6b4500' }}>N</div>
);

export const Glass: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: 'rgba(9,18,46,.86)', border: '1.5px solid rgba(127,176,255,.35)', borderRadius: 22, boxShadow: '0 24px 70px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04) inset', backdropFilter: 'blur(14px)', ...style }}>{children}</div>
);
