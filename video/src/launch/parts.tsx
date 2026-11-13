// Reusable pieces for the launch video. Every size and colour comes from design.ts; every number and line of code comes from real data.
import React from 'react';
import { AbsoluteFill, Easing, Freeze, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame } from 'remotion';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { C, CAMERA_SPRING, CAPTION, EASE, FONT, FPS, GRID, H, MS, RADIUS, RISE, STROKE, T, W, WEIGHT, frames, sp } from '../../design';
import type { Beat, Sent } from './timeline';

loadFredoka('normal', { weights: ['500', '700'], subsets: ['latin'], ignoreTooManyRequestsWarning: true });
loadMono('normal', { weights: ['500', '700'], subsets: ['latin'], ignoreTooManyRequestsWarning: true });

export interface Rect { x: number; y: number; w: number; h: number }
export const FULL: Rect = { x: 0, y: 0, w: W, h: H };
export const rect16 = (x: number, y: number, w: number): Rect => ({ x, y, w, h: (w * 9) / 16 });
export const rectAspect = (x: number, y: number, w: number, aspect: number): Rect => ({ x, y, w, h: w / aspect });

/** An element enters with one motion: an 8 px rise and a fade over 300 ms. */
export const useEnter = (startSec: number) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [startSec * FPS, startSec * FPS + frames(MS.base)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  return { opacity: p, transform: `translateY(${(1 - p) * RISE}px)` } as React.CSSProperties;
};

/** Footage inside a box, with the camera moving between rectangles of the source. Aspect of each rect should match the box. */
export const Footage: React.FC<{ src: string; startSec: number; box?: Rect; keys?: { t: number; rect: Rect }[]; radius?: number; framed?: boolean; holdAtSec?: number }> = ({ src, startSec, box = FULL, keys = [{ t: 0, rect: FULL }], radius = 0, framed, holdAtSec }) => {
  const frame = useCurrentFrame();
  let cur = keys[0].rect;
  for (let i = 1; i < keys.length; i++) {
    const p = spring({ frame: frame - keys[i].t * FPS, fps: FPS, config: CAMERA_SPRING });
    if (frame >= keys[i].t * FPS) {
      const a = keys[i - 1].rect, b = keys[i].rect;
      cur = { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, w: a.w + (b.w - a.w) * p, h: a.h + (b.h - a.h) * p };
    }
  }
  const s = box.w / cur.w;
  return (
    <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, overflow: 'hidden', borderRadius: radius, border: framed ? `${STROKE}px solid ${C.line}` : undefined, background: C.panel }}>
      <div style={{ position: 'absolute', left: -cur.x * s, top: -cur.y * s, width: W * s, height: H * s }}>
        <Freeze frame={Math.round((holdAtSec ?? 1e6) * FPS)} active={holdAtSec !== undefined && frame >= holdAtSec * FPS}>
          <OffthreadVideo src={staticFile(src)} startFrom={Math.round(startSec * FPS)} muted style={{ width: '100%', height: '100%' }} />
        </Freeze>
      </div>
    </div>
  );
};

/** What a shot is, in the corner: live footage, a simulated week, or data read from the chain. */
export const Tag: React.FC<{ kind: 'LIVE' | 'SIMULATED' | 'CHAIN'; text: string; at?: number }> = ({ kind, text, at = 0 }) => (
  <div style={{ position: 'absolute', left: GRID.margin, top: GRID.margin, display: 'flex', alignItems: 'center', gap: sp(1.5), padding: `${sp(1)}px ${sp(2)}px`, borderRadius: RADIUS, background: C.scrim, border: `${STROKE}px solid ${C.line}`, fontFamily: FONT.mono, fontWeight: WEIGHT.bold, fontSize: T.small, color: C.text, letterSpacing: 1, ...useEnter(at) }}>
    <span style={{ width: sp(1.5), height: sp(1.5), borderRadius: '50%', background: kind === 'LIVE' ? C.gold : C.blue }} />
    <span style={{ color: kind === 'LIVE' ? C.gold : C.muted }}>{kind}</span>
    <span>{text}</span>
  </div>
);

/** Captions from the voice's own word timings: 4–8 words at a time, the current word in gold. */
export const Captions: React.FC<{ beat: Beat; hidden?: boolean }> = ({ beat, hidden }) => {
  const t = useCurrentFrame() / FPS;
  const words = beat.sentences.flatMap((s: Sent) => s.words.map((w) => ({ text: w.text, start: s.start + w.start, end: s.start + w.end })));
  const phrases: typeof words[] = []; let cur: typeof words = [];
  words.forEach((w, i) => { cur.push(w); const stop = /[.,:;?]$/.test(w.text); if (cur.length >= CAPTION.maxWords || (stop && cur.length >= 3) || i === words.length - 1) { phrases.push(cur); cur = []; } });
  const live = phrases.find((p) => t >= p[0].start - 0.08 && t <= p[p.length - 1].end + 0.35);
  if (hidden || !live) return null;
  const p = interpolate(t, [live[0].start - 0.08, live[0].start - 0.08 + MS.base / 1000], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  return (
    <div style={{ position: 'absolute', left: GRID.margin, right: GRID.margin, bottom: CAPTION.bottom, display: 'flex', justifyContent: 'center' }}>
      <div style={{ padding: `${sp(1.5)}px ${sp(3)}px`, borderRadius: RADIUS, background: C.scrim, fontFamily: FONT.display, fontWeight: WEIGHT.bold, fontSize: CAPTION.size, lineHeight: 1.15, color: C.text, textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * RISE}px)`, maxWidth: W - 2 * GRID.margin }}>
        {live.map((w, i) => { const next = live[i + 1]; const on = t >= w.start - 0.02 && (!next || t < next.start - 0.02); return <span key={i} style={{ color: on ? C.gold : C.text }}>{w.text}{i < live.length - 1 ? ' ' : ''}</span>; })}
      </div>
    </div>
  );
};

/** The right-hand "what is actually happening" panel: a dark terminal look so viewers always know which side is which. */
export interface TruthRow { at: number; title: string; lines: { k?: string; v: string; hi?: boolean }[] }
export const TruthPanel: React.FC<{ box: Rect; rows: TruthRow[] }> = ({ box, rows }) => (
  <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, background: C.terminal, borderRadius: RADIUS, border: `${STROKE}px solid ${C.line}`, padding: sp(3), boxSizing: 'border-box', fontFamily: FONT.mono, color: C.text, overflow: 'hidden' }}>
    <div style={{ fontSize: T.small, fontWeight: WEIGHT.bold, color: C.gold, letterSpacing: 2, marginBottom: sp(2) }}>WHAT IS ACTUALLY HAPPENING</div>
    {rows.map((r, i) => (
      <div key={i} style={{ marginBottom: sp(2.5), ...useEnter(r.at) }}>
        <div style={{ fontSize: T.small, fontWeight: WEIGHT.bold, color: C.muted, marginBottom: sp(0.5) }}>{r.title}</div>
        {r.lines.map((l, j) => (
          <div key={j} style={{ fontSize: T.small, fontWeight: l.hi ? WEIGHT.bold : WEIGHT.regular, color: l.hi ? C.gold : C.text, lineHeight: 1.35, wordBreak: 'break-word' }}>
            {l.k && <span style={{ color: C.muted }}>{l.k} </span>}{l.v}
          </div>
        ))}
      </div>
    ))}
  </div>
);

const Result: React.FC<{ text: string; at: number }> = ({ text, at }) => (
  <div style={{ paddingLeft: sp(9), color: C.gold, fontWeight: WEIGHT.bold, lineHeight: 1.5, ...useEnter(at) }}>{text}</div>
);

/** Real code from a real file, line by line, with the lines that matter lit. */
export interface CodeLine { n: number; text: string }
export const CodeReveal: React.FC<{ file: string; lines: CodeLine[]; lit: (l: CodeLine) => boolean; startSec: number; perLine?: number; results?: { match: (l: CodeLine) => boolean; text: string; at: number }[] }> = ({ file, lines, lit, startSec, perLine = 0.28, results = [] }) => (
  <div style={{ background: C.terminal, borderRadius: RADIUS, border: `${STROKE}px solid ${C.line}`, padding: `${sp(3)}px ${sp(3)}px`, fontFamily: FONT.mono, fontSize: T.small, color: C.text }}>
    <div style={{ color: C.muted, fontWeight: WEIGHT.bold, marginBottom: sp(2) }}>{file}</div>
    {lines.map((l, i) => {
      const on = lit(l); const res = results.find((r) => r.match(l));
      return (
        <div key={l.n}>
          <div style={{ display: 'flex', gap: sp(2), alignItems: 'baseline', whiteSpace: 'pre', lineHeight: 1.5, ...useEnter(startSec + i * perLine), background: on ? 'rgba(255,194,26,0.14)' : undefined, borderLeft: `${sp(0.5)}px solid ${on ? C.gold : 'transparent'}`, paddingLeft: sp(1) }}>
            <span style={{ color: C.muted, width: sp(6), textAlign: 'right' }}>{l.n}</span>
            <span style={{ color: on ? C.text : C.muted, fontWeight: on ? WEIGHT.bold : WEIGHT.regular }}>{l.text.trim()}</span>
          </div>
          {res && <Result text={res.text} at={res.at} />}
        </div>
      );
    })}
  </div>
);

export const StatCounter: React.FC<{ value: number; label: string; at: number; foot?: string }> = ({ value, label, at, foot }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at * FPS, at * FPS + frames(MS.slow) * 2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ ...useEnter(at) }}>
      <div style={{ fontFamily: FONT.display, fontWeight: WEIGHT.bold, fontSize: T.display, color: C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{Math.round(value * p).toLocaleString('en-US')}</div>
      <div style={{ fontFamily: FONT.display, fontWeight: WEIGHT.regular, fontSize: T.body, color: C.muted, marginTop: sp(1) }}>{label}</div>
      {foot && <div style={{ fontFamily: FONT.mono, fontWeight: WEIGHT.regular, fontSize: T.small, color: C.muted, marginTop: sp(0.5) }}>{foot}</div>}
    </div>
  );
};

/** The brand background: the game's navy on a quiet grid. */
export const GridBackground: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <AbsoluteFill style={{ opacity: 0.07, backgroundImage: `linear-gradient(${C.text} 1px, transparent 1px), linear-gradient(90deg, ${C.text} 1px, transparent 1px)`, backgroundSize: `${sp(6)}px ${sp(6)}px` }} />
  </AbsoluteFill>
);

/** A sequence of short shots, hard-cut. Each is real footage with a label saying what it is. */
export interface Shot { src: string; startSec: number; dur: number; hold?: number; keys?: { t: number; rect: Rect }[]; tag: { kind: 'LIVE' | 'SIMULATED' | 'CHAIN'; text: string } }
export const Montage: React.FC<{ shots: Shot[]; at?: number }> = ({ shots, at = 0 }) => {
  let cursor = at * FPS;
  return (
    <>
      {shots.map((s, i) => {
        const from = Math.round(cursor); const len = Math.round(s.dur * FPS); cursor += len;
        return (
          <Sequence key={i} from={from} durationInFrames={len} layout="none">
            <AbsoluteFill><Footage src={s.src} startSec={s.startSec} keys={s.keys} holdAtSec={s.hold} /><Tag kind={s.tag.kind} text={s.tag.text} at={0.05} /></AbsoluteFill>
          </Sequence>
        );
      })}
    </>
  );
};
