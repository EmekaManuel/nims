import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BODY, C, HEAD, MONO, Mark, clamp, useRamp } from './ui';
import { scene } from './timeline';
import { TownBackdrop, TOWN_CAM } from './cards';

/**
 * The intro tells the problem first, the same way the old "Hook" card did - a dead spreadsheet economy,
 * struck through - then turns into the answer: a character-creation-style title card (DESIGN.md video notes),
 * where a floating gem opens to reveal Nim, the game's own mascot, standing in for "create a sim", and a row
 * of the real strategies the game's own players and agents actually play (DESIGN.md §5 / sim/players.ts)
 * slides in like a trait picker. Everything here is original art (no trademarked shapes or marks), built
 * from the same design tokens as the rest of the video.
 */
const PATHS: { label: string; blurb: string; c: string }[] = [
  { label: 'MERCHANT', blurb: 'Set your own prices', c: C.gold },
  { label: 'INVESTOR', blurb: 'Hold shares, draw dividends', c: C.green },
  { label: 'EXPLORER', blurb: 'Settle an unclaimed frontier', c: C.sky },
  { label: 'COUNCILLOR', blurb: 'Vote the market’s rules', c: '#ff8fa8' },
];

/** The gem: an original four-point mark, not the trademarked Sims plumbob - it opens like a locket to reveal Nim. */
const Gem: React.FC<{ open: number; size: number }> = ({ open, size }) => {
  const f = useCurrentFrame();
  const spin = f * 0.6;
  const haloR = size * (0.62 + open * 0.5);
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center' }}>
      <div style={{ position: 'absolute', width: haloR, height: haloR, borderRadius: haloR, background: `radial-gradient(circle, ${C.gold}55 0%, transparent 70%)`, opacity: 0.9 - open * 0.4 }} />
      {[0, 1].map((half) => (
        <svg key={half} width={size} height={size} viewBox="-50 -50 100 100" style={{
          position: 'absolute', overflow: 'visible',
          transform: `rotate(${spin}deg) scale(${1 - open * 0.08}) translateX(${(half ? 1 : -1) * open * size * 0.42}px) rotate(${(half ? 1 : -1) * open * 55}deg)`,
          transition: 'none', opacity: 1 - open * 0.92,
        }}>
          <defs>
            <linearGradient id={`gemfill${half}`} x1="0" y1="-50" x2="0" y2="50">
              <stop offset="0%" stopColor="#fff6da" />
              <stop offset="45%" stopColor={C.gold} />
              <stop offset="100%" stopColor="#c98700" />
            </linearGradient>
          </defs>
          <path
            d={half === 0 ? 'M0 -46 L-16 0 L0 46 Z' : 'M0 -46 L16 0 L0 46 Z'}
            fill={`url(#gemfill${half})`} stroke="#8a5f00" strokeWidth={1.6} strokeLinejoin="round"
          />
          <path d={half === 0 ? 'M0 -46 L-6 -8 L0 0 Z' : 'M0 -46 L6 -8 L0 0 Z'} fill="#fff" opacity={0.55} />
        </svg>
      ))}
      <div style={{ opacity: open, transform: `scale(${0.5 + open * 0.5})` }}><Mark size={size * 0.72} /></div>
    </div>
  );
};

export const SimsIntro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = scene('simsIntro');
  const out = interpolate(f, [s.frames - 16, s.frames], [1, 0], clamp);

  // Phase A: the problem, told the way the old Hook card did - a dead spreadsheet economy, sentence by
  // sentence, with "prices never move" struck through. Sentence boundaries come from letter counts, so the
  // visuals land with the voice.
  const sentences = s.text.match(/[^.]+\./g)!.map((t) => t.trim());
  const total = sentences.reduce((n, t) => n + t.length, 0);
  let acc = 0;
  const marks = sentences.map((t) => { const at = s.delay + (acc / total) * s.voiceFrames * 0.96; acc += t.length; return at; });
  const B = marks[3] - 8; // the pivot: "Nims is a town..." - the spreadsheet gives way to the gem and the title

  const sheet = interpolate(f, [0, 14, B - 6, B + 14], [0, 1, 1, 0], clamp);
  const line = (i: number) => {
    const a = marks[i], bEnd = i < 2 ? marks[i + 1] : B;
    const o = interpolate(f, [a, a + 8, bEnd - 8, bEnd], [0, 1, 1, 0], clamp);
    return <div key={i} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: o, transform: `translateY(${(1 - o) * 24}px)` }}>
      <div style={{ font: `700 112px/1.1 ${HEAD}`, color: C.ink, textAlign: 'center', maxWidth: 1500, textShadow: '0 6px 40px rgba(0,0,0,.6)' }}>{sentences[i]}</div>
    </div>;
  };
  const strike = interpolate(f, [marks[1] + 14, marks[1] + 30], [0, 100], clamp);

  // Phase B: the answer - the gem opens, the title settles, and the real strategies slide in. Timed from the
  // pivot B, not fixed frames, since the problem's length depends on the voice.
  const open = interpolate(f, [B + 6, B + 30], [0, 1], { ...clamp, easing: (t) => t * t * (3 - 2 * t) });
  const titlePop = spring({ frame: f - (B + 18), fps, config: { damping: 13, stiffness: 140 } });
  const welcome = useRamp(B - 2, 16);
  const welcomeOut = interpolate(f, [B + 12, B + 28], [1, 0], clamp);
  const tagline = useRamp(B + 36, 18);

  return (
    <AbsoluteFill style={{ opacity: out, background: `radial-gradient(ellipse at 50% 35%, ${C.deep} 0%, ${C.navy} 70%)`, alignItems: 'center', justifyContent: 'center' }}>
      {/* the real town arrives as the spreadsheet fades, with "Nims is a town..." */}
      <TownBackdrop from={B - 14} scene="simsIntro" cam={TOWN_CAM} wash={0.52} />

      {/* Phase A: a dead spreadsheet */}
      <AbsoluteFill style={{ opacity: sheet * 0.55, display: 'grid', placeItems: 'center' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 190px)', gap: 0, transform: 'perspective(1800px) rotateX(18deg) scale(1.1)', border: '1px solid rgba(127,176,255,.25)' }}>
          {Array.from({ length: 56 }, (_, i) => (
            <div key={i} style={{ height: 74, border: '1px solid rgba(127,176,255,.18)', display: 'grid', alignItems: 'center', padding: '0 14px', font: `500 26px ${MONO}`, color: i < 8 ? C.sky : C.mute, background: i < 8 ? 'rgba(47,107,255,.15)' : 'transparent' }}>
              {i < 8 ? ['Item', 'Price', 'Stock', 'Demand', 'Cash', 'Trades', 'Mood', 'Change'][i] : [(i % 8 === 0 ? 'Cotton' : i % 8 === 1 ? '100' : i % 8 === 2 ? '∞' : i % 8 === 3 ? 'fixed' : i % 8 === 4 ? '—' : i % 8 === 5 ? '0' : i % 8 === 6 ? '—' : '0%')]}
            </div>
          ))}
        </div>
      </AbsoluteFill>
      {line(0)}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: interpolate(f, [marks[1], marks[1] + 8, marks[2] - 8, marks[2]], [0, 1, 1, 0], clamp), transform: `translateY(${(1 - interpolate(f, [marks[1], marks[1] + 8], [0, 1], clamp)) * 24}px)` }}>
        <div style={{ font: `700 112px/1.1 ${HEAD}`, color: C.ink, position: 'relative', textShadow: '0 6px 40px rgba(0,0,0,.6)' }}>
          {sentences[1].replace('.', '')}
          <div style={{ position: 'absolute', left: -10, top: '54%', height: 10, width: `${strike}%`, minWidth: 0, background: '#ff5b6e', borderRadius: 6, boxShadow: '0 0 30px #ff5b6e' }} />
        </div>
      </div>
      {line(2)}

      {/* Phase B: the answer. Hidden until the pivot, so the (already-spinning) gem doesn't bleed through phase A. */}
      <AbsoluteFill style={{ opacity: interpolate(f, [B - 6, B + 6], [0, 1], clamp), alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', top: '30%', textAlign: 'center', opacity: welcome * welcomeOut }}>
          <div style={{ font: `700 26px ${BODY}`, color: C.sky, letterSpacing: 10 }}>WELCOME TO</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${-open * 70}px)` }}>
          <Gem open={open} size={220} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, opacity: Math.min(1, titlePop), transform: `scale(${0.7 + Math.min(1, titlePop) * 0.3})` }}>
            <div style={{ font: `700 150px/1 ${HEAD}`, color: C.ink, letterSpacing: -3 }}>Nims</div>
          </div>
          <div style={{ font: `600 30px ${BODY}`, color: C.mute, marginTop: 6, opacity: tagline, transform: `translateY(${(1 - tagline) * 14}px)` }}>Choose how you make your coin.</div>
        </div>

        <div style={{ position: 'absolute', bottom: '14%', display: 'flex', gap: 22 }}>
          {PATHS.map((p, i) => {
            const at = B + 56 + i * 9;
            const t = spring({ frame: f - at, fps, config: { damping: 15, stiffness: 130 } });
            return (
              <div key={p.label} style={{
                opacity: Math.min(1, t), transform: `translateY(${(1 - Math.min(1, t)) * 40}px)`,
                width: 250, padding: '20px 20px 18px', borderRadius: 20, textAlign: 'center',
                background: 'rgba(9,18,46,.82)', border: `1.5px solid ${p.c}66`, boxShadow: `0 18px 44px rgba(0,0,0,.4), 0 0 0 1px ${p.c}22 inset`,
              }}>
                <div style={{ width: 46, height: 46, margin: '0 auto 10px', borderRadius: 46, background: p.c, display: 'grid', placeItems: 'center', font: `700 22px ${HEAD}`, color: '#1a1030' }}>{p.label[0]}</div>
                <div style={{ font: `700 20px ${BODY}`, color: C.ink, letterSpacing: 1.5 }}>{p.label}</div>
                <div style={{ font: `500 16px ${BODY}`, color: C.mute, marginTop: 4 }}>{p.blurb}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
