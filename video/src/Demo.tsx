import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BODY, C, Glass, HEAD, MONO, Words, clamp, ease, fmt } from './ui';
import { Chain, Hook, Outro } from './cards';
import { FPS, SCENES, SRC_H, SRC_W, TOTAL_FRAMES, facts, scene, sceneFrameOf, type Focus, type Scene } from './timeline';

export { FPS, TOTAL_FRAMES };

// The recording (1920x1080) is shown in a 1440x810 screen, so the picture is sharp even at 1.33x zoom.
const SCREEN_W = 1440, SCREEN_H = 810, CHROME = 44, S = SCREEN_W / SRC_W;
const WIN_W = SCREEN_W, WIN_H = SCREEN_H + CHROME, WIN_X = (1920 - WIN_W) / 2, WIN_Y = 40;
const FIRST = scene('signin'), CHAIN = scene('chain');

/** Camera: every scene lists views; ease from the last view to the next over ~0.8 s. */
const KEYS: { at: number; focus: Focus }[] = SCENES.filter((s) => s.footage).flatMap((s) => s.focus.map(([fr, focus]) => ({ at: s.from + Math.round(fr * s.frames), focus })));
function useCamera(): Focus {
  const frame = useCurrentFrame();
  let i = 0;
  for (let k = 0; k < KEYS.length; k++) if (frame >= KEYS[k].at) i = k;
  const cur = KEYS[i], prev = KEYS[i - 1] ?? cur;
  const t = ease(interpolate(frame - cur.at, [0, 26], [0, 1], clamp));
  const mix = (a: number, b: number) => a + (b - a) * t;
  return { x: mix(prev.focus.x, cur.focus.x), y: mix(prev.focus.y, cur.focus.y), zoom: mix(prev.focus.zoom, cur.focus.zoom) * (1 + Math.sin(frame / 80) * 0.004) };
}

const Background: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 800px at 15% 10%, #16328a 0%, transparent 60%), radial-gradient(1000px 700px at 90% 100%, #1b3fb5 0%, transparent 55%), ${C.navy}` }}>
      <AbsoluteFill style={{ backgroundImage: 'linear-gradient(rgba(127,176,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(127,176,255,.07) 1px, transparent 1px)', backgroundSize: '64px 64px', backgroundPosition: `${f * 0.25}px ${f * 0.15}px`, maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 78%)' }} />
    </AbsoluteFill>
  );
};

/** The footage, retimed to each spoken line: sped up or slowed a little to fit, and held on its last frame if the voice runs on. */
const Footage: React.FC<{ s: Scene }> = ({ s }) => {
  const startFrom = Math.round(s.a * FPS);
  const last = Math.max(0, Math.round(s.b * FPS) - 1);
  return (
    <>
      <Sequence from={s.from} durationInFrames={Math.max(1, s.playFrames)} layout="none">
        <OffthreadVideo src={staticFile('raw.mp4')} muted startFrom={startFrom} playbackRate={s.rate} style={{ width: SRC_W, height: SRC_H }} />
      </Sequence>
      {s.playFrames < s.frames && (
        <Sequence from={s.from + s.playFrames} durationInFrames={s.frames - s.playFrames} layout="none">
          <OffthreadVideo src={staticFile('raw.mp4')} muted startFrom={last} endAt={last + 1} style={{ width: SRC_W, height: SRC_H }} />
        </Sequence>
      )}
    </>
  );
};

// ---------- callouts that sit on the screen ----------
const Pill: React.FC<{ at: number; hold: number; children: React.ReactNode; top?: number }> = ({ at, hold, children, top = 26 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = spring({ frame: f - at, fps, config: { damping: 15, stiffness: 140 } });
  const out = interpolate(f, [at + hold, at + hold + 10], [1, 0], clamp);
  if (f < at) return null;
  return <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: inn * out, transform: `translateY(${(1 - inn) * -30}px) scale(${0.92 + inn * 0.08})` }}>{children}</div>;
};

const Stat: React.FC<{ label: string; from: number; to: number; at: number; sign?: boolean; gain?: boolean }> = ({ label, from, to, at, sign, gain }) => {
  const f = useCurrentFrame();
  const v = from + (to - from) * interpolate(f, [at, at + 34], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  const delta = to - from;
  return (
    <Glass style={{ padding: '16px 34px', display: 'flex', alignItems: 'center', gap: 26 }}>
      <div style={{ font: `700 20px ${BODY}`, color: C.mute, letterSpacing: 3 }}>{label}</div>
      {gain
        ? <div style={{ font: `700 54px/1 ${MONO}`, color: C.green }}>+{fmt(v)} <span style={{ fontSize: 28, color: C.mute }}>coins</span></div>
        : <><div style={{ font: `700 54px/1 ${MONO}`, color: C.ink }}>{fmt(v)}</div>
          <div style={{ font: `700 32px ${MONO}`, color: C.green }}>{sign ? '+' : ''}{fmt(delta)}</div></>}
    </Glass>
  );
};

const Quote: React.FC<{ text: string; at: number; hold: number }> = ({ text, at, hold }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = spring({ frame: f - at, fps, config: { damping: 16, stiffness: 100 } });
  const out = interpolate(f, [at + hold, at + hold + 12], [1, 0], clamp);
  if (f < at) return null;
  const words = text.split(' ');
  return (
    <div style={{ position: 'absolute', left: 36, bottom: 40, width: 640, opacity: inn * out, transform: `translateY(${(1 - inn) * 40}px)` }}>
      <Glass style={{ padding: '26px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 46, background: '#27b36a', display: 'grid', placeItems: 'center', font: `700 24px ${HEAD}`, color: '#fff' }}>L</div>
          <div><div style={{ font: `700 24px ${BODY}`, color: C.ink }}>Lena's Textiles</div><div style={{ font: `600 15px ${BODY}`, color: C.green, letterSpacing: 2 }}>● AI AGENT, IN ITS OWN WORDS</div></div>
        </div>
        <div style={{ font: `500 27px/1.38 ${BODY}`, color: C.ink }}>
          <span style={{ color: C.gold, font: `700 44px ${HEAD}`, marginRight: 6, verticalAlign: -10 }}>“</span>
          {words.map((w, i) => { const o = interpolate(f, [at + 10 + i * 2.2, at + 16 + i * 2.2], [0, 1], clamp); return <span key={i} style={{ opacity: 0.15 + o * 0.85 }}>{w} </span>; })}
          <span style={{ color: C.gold, font: `700 44px ${HEAD}`, verticalAlign: -10 }}>”</span>
        </div>
      </Glass>
    </div>
  );
};

const Chips: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame();
  const items = ['No wallet', 'No seed phrase', 'No gas'];
  return (
    <div style={{ position: 'absolute', top: 30, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14 }}>
      {items.map((t, i) => {
        const at = s.from + s.delay + s.voiceFrames * (0.52 + i * 0.1);
        const o = interpolate(f, [at, at + 9], [0, 1], clamp) * interpolate(f, [s.from + s.frames - 24, s.from + s.frames - 8], [1, 0], clamp);
        return <div key={t} style={{ opacity: o, transform: `translateY(${(1 - o) * -22}px)`, padding: '11px 24px', borderRadius: 99, background: 'rgba(9,18,46,.88)', border: '1.5px solid rgba(59,224,143,.6)', font: `700 26px ${BODY}`, color: C.ink, boxShadow: '0 10px 30px rgba(0,0,0,.4)' }}><span style={{ color: C.green, marginRight: 10 }}>✕</span>{t}</div>;
      })}
    </div>
  );
};

const Overlays: React.FC = () => {
  const sale = scene('sale'), order = scene('order'), filled = scene('filled'), tip = scene('tooltip'), sim = scene('sim'), signin = scene('signin');
  const f = useCurrentFrame();
  const num = (k: string) => Number(facts[k]);
  const quote = String(facts.tooltip).replace(/^.*says\s*/, '').replace(/[“”]/g, '');
  const saleAt = sale.from + sceneFrameOf('sale', num('mSale')) + 8;
  const orderAt = order.from + sceneFrameOf('order', num('mOrder')) + 4;
  const fillAt = filled.from + Math.max(2, sceneFrameOf('filled', num('mFill')));
  return (
    <div style={{ position: 'absolute', left: 0, top: CHROME, width: SCREEN_W, height: SCREEN_H, overflow: 'hidden', pointerEvents: 'none' }}>
      <Chips s={signin} />
      <Quote text={quote} at={tip.from + Math.round(tip.frames * 0.2)} hold={Math.round(tip.frames * 0.7)} />
      <Pill at={saleAt} hold={sale.from + sale.frames - saleAt - 8}><Stat label="CASH" from={num('cashBefore')} to={num('cashAfterSale')} at={saleAt} sign /></Pill>
      <Pill at={orderAt} hold={Math.max(40, order.from + order.frames - orderAt - 6)}>
        <Glass style={{ padding: '16px 34px', display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ font: `700 20px ${BODY}`, color: C.gold, letterSpacing: 3 }}>ORDER PLACED</div>
          <div style={{ font: `600 30px ${BODY}`, color: C.ink }}>{String(facts.orderUnits)} cotton, not below <b style={{ fontFamily: MONO }}>{fmt(num('orderMin'))}</b> each</div>
        </Glass>
      </Pill>
      <Pill at={fillAt} hold={filled.from + filled.frames - fillAt - 6}><Stat label="ORDER FILLED" from={0} to={num('cashAfterOrder') - num('cashBeforeOrder')} at={fillAt} gain /></Pill>
      <Pill at={sim.from + 16} hold={90} top={700}>
        <Glass style={{ padding: '14px 32px', font: `700 30px ${BODY}`, color: C.ink }}>A whole week of the market, in seconds</Glass>
      </Pill>
      <span style={{ display: 'none' }}>{f}</span>
    </div>
  );
};

const Window: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam = useCamera();
  const enter = spring({ frame: frame - (FIRST.from - 10), fps, config: { damping: 18, stiffness: 90, mass: 0.9 } });
  const exit = interpolate(frame, [CHAIN.from - 8, CHAIN.from + 18], [0, 1], { ...clamp, easing: ease });
  if (frame < FIRST.from - 12 || frame > CHAIN.from + 20) return null;
  const z = cam.zoom * S;
  const tx = Math.min(0, Math.max(SCREEN_W - SRC_W * z, SCREEN_W / 2 - cam.x * z));
  const ty = Math.min(0, Math.max(SCREEN_H - SRC_H * z, SCREEN_H / 2 - cam.y * z));
  return (
    <div style={{ position: 'absolute', left: WIN_X, top: WIN_Y, width: WIN_W, height: WIN_H, transform: `translateY(${(1 - enter) * 1100 + exit * 60}px) scale(${(0.94 + enter * 0.06) * (1 - exit * 0.06)})`, opacity: 1 - exit, borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: '0 50px 120px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.14), 0 0 160px rgba(47,107,255,.35)' }}>
      <div style={{ height: CHROME, background: 'linear-gradient(#1a2547,#131c3a)', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 9 }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 13, background: c }} />)}
        <div style={{ marginLeft: 22, flex: 1, maxWidth: 520, height: 26, borderRadius: 8, background: 'rgba(255,255,255,.08)', color: C.mute, font: `500 14px ${BODY}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><span style={{ opacity: 0.7 }}>🔒</span> nims.game</div>
      </div>
      <div style={{ position: 'absolute', left: 0, top: CHROME, width: SCREEN_W, height: SCREEN_H, overflow: 'hidden', background: '#0d1f4a' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: SRC_W, height: SRC_H, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
          {SCENES.filter((s) => s.footage).map((s) => <Footage key={s.key} s={s} />)}
        </div>
      </div>
      <Overlays />
    </div>
  );
};

const Caption: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 8, s.frames - 10, s.frames], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: 'absolute', left: 170, right: 170, top: WIN_Y + WIN_H + 14, height: 168, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: o }}>
      <div style={{ font: `700 19px ${BODY}`, color: C.gold, letterSpacing: 4, textTransform: 'uppercase' }}>{s.chapter}</div>
      <Words text={s.text} start={s.delay} frames={s.voiceFrames} size={s.text.length > 110 ? 33 : 38} />
    </div>
  );
};

const Progress: React.FC = () => {
  const f = useCurrentFrame();
  return <div style={{ position: 'absolute', left: 0, bottom: 0, height: 5, width: `${(f / TOTAL_FRAMES) * 100}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.gold})` }} />;
};

export const Demo: React.FC<{ voice: boolean }> = ({ voice }) => {
  const sale = scene('sale'), filled = scene('filled'), order = scene('order');
  const sfx = (name: string, at: number, volume: number) => <Sequence key={name + at} from={Math.max(0, at)} durationInFrames={FPS * 2}><Audio src={staticFile(`sfx/${name}`)} volume={volume} /></Sequence>;
  return (
    <AbsoluteFill style={{ background: C.navy, fontFamily: BODY }}>
      <Background />
      <Window />
      {SCENES.filter((s) => s.footage || s.key === 'chain').map((s) => (
        <Sequence key={s.key} from={s.from} durationInFrames={s.frames} layout="none">{s.footage ? <Caption s={s} /> : null}</Sequence>
      ))}
      <Sequence from={scene('hook').from} durationInFrames={scene('hook').frames}><Hook /></Sequence>
      <Sequence from={CHAIN.from} durationInFrames={CHAIN.frames}><Chain /></Sequence>
      <Sequence from={scene('outro').from} durationInFrames={scene('outro').frames}><Outro /></Sequence>
      <Progress />

      {/* sound: a quiet bed, a whoosh into each scene, a ping when money lands, a tick when the order is placed */}
      <Audio src={staticFile('sfx/bed.mp3')} volume={(f) => 0.07 * interpolate(f, [0, 60, TOTAL_FRAMES - 90, TOTAL_FRAMES], [0, 1, 1, 0], clamp)} />
      {SCENES.map((s) => sfx('whoosh.wav', s.from - 4, 0.16))}
      {sfx('ping.wav', sale.from + sceneFrameOf('sale', Number(facts.mSale)) + 8, 0.5)}
      {sfx('tick.wav', order.from + sceneFrameOf('order', Number(facts.mOrder)), 0.6)}
      {sfx('ping.wav', filled.from + Math.max(2, sceneFrameOf('filled', Number(facts.mFill))), 0.5)}
      {voice && SCENES.map((s) => (
        <Sequence key={'v' + s.key} from={s.from + s.delay} durationInFrames={s.voiceFrames + 20}><Audio src={staticFile(`vo/${s.key}.mp3`)} /></Sequence>
      ))}
    </AbsoluteFill>
  );
};
