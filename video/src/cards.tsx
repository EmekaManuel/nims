import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BODY, C, HEAD, MONO, Mark, Words, clamp, ease, fmt, useRamp } from './ui';
import { FPS, scene } from './timeline';
import chain from './data/chain.json';

// ---------- 1. Hook: a spreadsheet economy, then a living one ----------
const MERCHANTS = [
  { n: 'Mira', shop: 'Greens', c: '#e0527a', base: 91 },
  { n: 'Lena', shop: 'Textiles', c: '#27b36a', base: 1150 },
  { n: 'Anil', shop: 'Metals', c: '#2fa3a8', base: 206 },
  { n: 'Ruth', shop: 'Salvage', c: '#e8873a', base: 372 },
];

export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = scene('hook');
  // Sentence boundaries from letter counts, so the visuals land with the voice.
  const sentences = s.text.match(/[^.]+\./g)!.map((t) => t.trim());
  const total = sentences.reduce((n, t) => n + t.length, 0);
  let acc = 0;
  const marks = sentences.map((t) => { const at = s.delay + (acc / total) * s.voiceFrames * 0.96; acc += t.length; return at; });
  const phaseB = marks[3] - 8;
  const out = interpolate(f, [s.frames - 18, s.frames], [1, 0], { ...clamp });

  const sheet = interpolate(f, [0, 14, phaseB - 6, phaseB + 14], [0, 1, 1, 0], clamp);
  const line = (i: number, t: string, big = false) => {
    const a = marks[i], bEnd = i < 2 ? marks[i + 1] : phaseB;
    const o = interpolate(f, [a, a + 8, bEnd - 8, bEnd], [0, 1, 1, 0], clamp);
    return <div key={i} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: o, transform: `translateY(${(1 - o) * 24}px)` }}>
      <div style={{ font: `700 ${big ? 92 : 112}px/1.1 ${HEAD}`, color: C.ink, textAlign: 'center', maxWidth: 1500, textShadow: '0 6px 40px rgba(0,0,0,.6)' }}>{t}</div>
    </div>;
  };
  const strike = interpolate(f, [marks[1] + 14, marks[1] + 30], [0, 100], clamp);

  const pop = spring({ frame: f - phaseB, fps, config: { damping: 13, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ opacity: out }}>
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
      {line(0, sentences[0])}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: interpolate(f, [marks[1], marks[1] + 8, marks[2] - 8, marks[2]], [0, 1, 1, 0], clamp), transform: `translateY(${(1 - interpolate(f, [marks[1], marks[1] + 8], [0, 1], clamp)) * 24}px)` }}>
        <div style={{ font: `700 112px/1.1 ${HEAD}`, color: C.ink, position: 'relative', textShadow: '0 6px 40px rgba(0,0,0,.6)' }}>
          {sentences[1].replace('.', '')}
          <div style={{ position: 'absolute', left: -10, top: '54%', height: 10, width: `${strike}%`, minWidth: 0, background: '#ff5b6e', borderRadius: 6, boxShadow: '0 0 30px #ff5b6e' }} />
        </div>
      </div>
      {line(2, sentences[2])}

      {/* Phase B: Nims, with living merchants */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: interpolate(f, [phaseB, phaseB + 10], [0, 1], clamp) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, transform: `scale(${0.72 + pop * 0.28})`, marginBottom: 56 }}>
          <Mark size={150} />
          <div style={{ font: `700 190px/1 ${HEAD}`, color: C.ink, letterSpacing: -4 }}>Nims</div>
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          {MERCHANTS.map((m, i) => {
            const t = spring({ frame: f - phaseB - 14 - i * 7, fps, config: { damping: 14, stiffness: 110 } });
            const wob = 1 + Math.sin(f / 11 + i * 1.7) * 0.07 + Math.sin(f / 5 + i) * 0.02;
            const price = Math.round(m.base * wob);
            const up = Math.cos(f / 11 + i * 1.7) > 0;
            return (
              <div key={m.n} style={{ width: 330, padding: '22px 24px', borderRadius: 22, background: 'rgba(9,18,46,.82)', border: '1.5px solid rgba(127,176,255,.35)', opacity: t, transform: `translateY(${(1 - t) * 50}px)`, boxShadow: '0 20px 50px rgba(0,0,0,.45)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 54, height: 54, borderRadius: 54, background: m.c, display: 'grid', placeItems: 'center', font: `700 28px ${HEAD}`, color: '#fff' }}>{m.n[0]}</div>
                  <div><div style={{ font: `700 28px ${BODY}`, color: C.ink }}>{m.n}'s {m.shop}</div><div style={{ font: `600 17px ${BODY}`, color: C.green, letterSpacing: 1.5 }}>● AI AGENT</div></div>
                </div>
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ font: `700 44px ${MONO}`, color: C.ink }}>{fmt(price)}</div>
                  <div style={{ font: `600 20px ${BODY}`, color: up ? C.green : '#ff7a8a' }}>{up ? '▲' : '▼'} coins</div>
                </div>
                <div style={{ marginTop: 4, font: `500 18px ${BODY}`, color: C.mute }}>its own cash · its own stock</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- 2. Chain: real numbers from the live contract ----------
const Count: React.FC<{ to: number; at: number; label: string; suffix?: string; decimals?: number }> = ({ to, at, label, suffix = '', decimals = 0 }) => {
  const f = useCurrentFrame();
  const o = useRamp(at, 14);
  const v = to * useRamp(at, 54, (x) => 1 - Math.pow(1 - x, 3));
  return (
    <div style={{ opacity: o, transform: `translateY(${(1 - o) * 26}px)`, flex: 1, padding: '26px 30px', borderRadius: 22, background: 'rgba(9,18,46,.86)', border: '1.5px solid rgba(127,176,255,.35)' }}>
      <div style={{ font: `700 78px/1 ${MONO}`, color: C.gold }}>{decimals ? v.toFixed(decimals) : fmt(v)}<span style={{ fontSize: 34, color: C.mute }}>{suffix}</span></div>
      <div style={{ marginTop: 12, font: `600 24px ${BODY}`, color: C.ink }}>{label}</div>
      <span style={{ display: 'none' }}>{f}</span>
    </div>
  );
};

export const Chain: React.FC = () => {
  const f = useCurrentFrame();
  const s = scene('chain');
  const out = interpolate(f, [s.frames - 14, s.frames], [1, 0], clamp);
  const a = useRamp(0, 20);
  const nodes = [
    { t: 'The game', sub: 'trades apply instantly', c: C.blue },
    { t: 'A batch', sub: 'queued, never blocking', c: '#8a5cff' },
    { t: 'Relayer', sub: 'pays every fee', c: '#e8873a' },
    { t: 'NEAR testnet', sub: 'NEP-245 contract', c: C.green },
  ];
  const nodeAt = (i: number) => 30 + i * 22;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out, padding: '0 150px' }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 24}px)`, textAlign: 'center' }}>
        <div style={{ font: `700 24px ${BODY}`, color: C.green, letterSpacing: 4 }}>● LIVE ON NEAR TESTNET</div>
        <div style={{ font: `700 104px/1.05 ${HEAD}`, color: C.ink, marginTop: 14 }}>Every good is a real token</div>
        <div style={{ font: `500 36px ${MONO}`, color: C.sky, marginTop: 22 }}>{chain.contract}</div>
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 52, width: '100%' }}>
        <Count to={chain.settlementBatches} at={s.delay + 14} label="settlement batches on chain" />
        <Count to={chain.blockHeight} at={s.delay + 26} label="read at block height" />
        <Count to={chain.balanceNear} at={s.delay + 38} label="NEAR held by the contract" decimals={2} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 56, width: '100%', justifyContent: 'center' }}>
        {nodes.map((n, i) => {
          const o = useRamp(nodeAt(i) + 50, 14);
          return (
            <div key={n.t} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ opacity: o, transform: `scale(${0.9 + o * 0.1})`, padding: '18px 30px', borderRadius: 18, background: 'rgba(9,18,46,.9)', border: `2px solid ${n.c}`, boxShadow: `0 0 40px ${n.c}44`, minWidth: 250, textAlign: 'center' }}>
                <div style={{ font: `700 32px ${HEAD}`, color: C.ink }}>{n.t}</div>
                <div style={{ font: `500 20px ${BODY}`, color: C.mute, marginTop: 4 }}>{n.sub}</div>
              </div>
              {i < nodes.length - 1 && (
                <div style={{ position: 'relative', width: 120, height: 4, background: 'rgba(127,176,255,.3)', opacity: o }}>
                  <div style={{ position: 'absolute', top: -7, left: `${((f * 1.6 + i * 40) % 100)}%`, width: 18, height: 18, borderRadius: 18, background: C.gold, boxShadow: `0 0 18px ${C.gold}` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 40, font: `500 22px ${BODY}`, color: C.mute, opacity: useRamp(s.delay + 190, 16) }}>Read from the testnet RPC on {chain.fetchedAt}. The player never sees any of this.</div>
    </AbsoluteFill>
  );
};

// ---------- 3. Outro ----------
export const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = scene('outro');
  const a = useRamp(0, 20);
  const pop = spring({ frame: f - 6, fps, config: { damping: 14, stiffness: 110 } });
  const tags = [['AGENT NPCS', 'Every merchant decides for itself'], ['SOCIAL LOGIN', 'Email in, no wallet'], ['NEP-245', 'One contract, every item'], ['INTENTS-STYLE ORDERS', 'Outcome and a price limit']];
  const out = interpolate(f, [s.frames - 10, s.frames], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: a * out }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 30, transform: `scale(${0.85 + pop * 0.15})` }}>
        <Mark size={140} />
        <div style={{ font: `700 190px/1 ${HEAD}`, color: C.ink, letterSpacing: -3 }}>Nims</div>
      </div>
      <div style={{ font: `600 52px ${BODY}`, color: C.ink, marginTop: 30 }}>The economy is the game.</div>
      <div style={{ display: 'flex', gap: 20, marginTop: 56 }}>
        {tags.map(([t, d], i) => {
          const o = useRamp(s.delay + 30 + i * 22, 14);
          return (
            <div key={t} style={{ opacity: o, transform: `translateY(${(1 - o) * 18}px)`, padding: '18px 26px', borderRadius: 20, border: '1.5px solid rgba(127,176,255,.5)', background: 'rgba(47,107,255,.16)', textAlign: 'center' }}>
              <div style={{ font: `700 24px ${BODY}`, color: C.gold, letterSpacing: 2.5 }}>{t}</div>
              <div style={{ font: `500 20px ${BODY}`, color: C.mute, marginTop: 6 }}>{d}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
