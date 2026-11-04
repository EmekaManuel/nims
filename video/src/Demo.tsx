import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
import { loadFont as loadFigtree } from '@remotion/google-fonts/Figtree';
import { CUES, FPS, OUTRO, TITLE, TOTAL_FRAMES, type Cue } from './timeline';

export { FPS, TOTAL_FRAMES };

const { fontFamily: HEAD } = loadFredoka('normal', { weights: ['600', '700'] });
const { fontFamily: BODY } = loadFigtree('normal', { weights: ['500', '600', '700'] });

const C = { navy: '#081230', deep: '#0d1f4a', blue: '#2f6bff', sky: '#7fb0ff', gold: '#ffc83d', ink: '#f4f7ff', mute: '#a9b8e0' };

// Window geometry (the recording is 1280x720; it is shown at 1.125x inside a 1440x810 screen).
const S = 1.125, SCREEN_W = 1440, SCREEN_H = 810, CHROME = 44;
const WIN_W = SCREEN_W, WIN_H = SCREEN_H + CHROME;
const WIN_X = (1920 - WIN_W) / 2, WIN_Y = 44;

const ease = Easing.bezier(0.65, 0, 0.25, 1);

/** The camera: eases from the previous scene's view to this one's at the start of each line. */
function useCamera() {
  const frame = useCurrentFrame();
  let i = 0;
  for (let k = 0; k < CUES.length; k++) if (frame >= CUES[k].from) i = k;
  const cur = CUES[i].focus, prev = (CUES[i - 1] ?? CUES[i]).focus;
  const t = ease(interpolate(frame - CUES[i].from, [0, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const mix = (a: number, b: number) => a + (b - a) * t;
  // A slow drift on top, so the picture is never perfectly still.
  const drift = Math.sin(frame / 90) * 0.004;
  return { x: mix(prev.x, cur.x), y: mix(prev.y, cur.y), zoom: mix(prev.zoom, cur.zoom) * (1 + drift) };
}

const Background: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 800px at 15% 10%, #16328a 0%, transparent 60%), radial-gradient(1000px 700px at 90% 100%, #1b3fb5 0%, transparent 55%), ${C.navy}` }}>
      <AbsoluteFill style={{ backgroundImage: 'linear-gradient(rgba(127,176,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(127,176,255,.07) 1px, transparent 1px)', backgroundSize: '64px 64px', backgroundPosition: `${f * 0.25}px ${f * 0.15}px`, maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 78%)' }} />
    </AbsoluteFill>
  );
};

const Screen: React.FC = () => {
  const cam = useCamera();
  const z = cam.zoom * S;
  const tx = Math.min(0, Math.max(SCREEN_W - 1280 * z, SCREEN_W / 2 - cam.x * z));
  const ty = Math.min(0, Math.max(SCREEN_H - 720 * z, SCREEN_H / 2 - cam.y * z));
  return (
    <div style={{ position: 'absolute', left: 0, top: CHROME, width: SCREEN_W, height: SCREEN_H, overflow: 'hidden', background: '#fff' }}>
      <OffthreadVideo src={staticFile('raw.mp4')} muted style={{ position: 'absolute', left: 0, top: 0, width: 1280, height: 720, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})` }} />
    </div>
  );
};

const Window: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enterAt = TITLE.from + TITLE.frames - 26;
  const enter = spring({ frame: frame - enterAt, fps, config: { damping: 18, stiffness: 90, mass: 0.9 } });
  const exit = interpolate(frame, [OUTRO.from - 6, OUTRO.from + 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const y = (1 - enter) * 1100 + exit * 60;
  const scale = (0.94 + enter * 0.06) * (1 - exit * 0.06);
  return (
    <div style={{ position: 'absolute', left: WIN_X, top: WIN_Y, width: WIN_W, height: WIN_H, transform: `translateY(${y}px) scale(${scale})`, opacity: 1 - exit, borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: '0 50px 120px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.14), 0 0 160px rgba(47,107,255,.35)' }}>
      <div style={{ height: CHROME, background: 'linear-gradient(#1a2547,#131c3a)', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 9 }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 13, background: c }} />)}
        <div style={{ marginLeft: 22, flex: 1, maxWidth: 520, height: 26, borderRadius: 8, background: 'rgba(255,255,255,.08)', color: C.mute, font: `500 14px ${BODY}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <span style={{ opacity: 0.7 }}>🔒</span> nims.game
        </div>
      </div>
      <Screen />
    </div>
  );
};

const Words: React.FC<{ text: string; frames: number; size: number; color?: string; family?: string; weight?: number; align?: 'center' | 'left'; lead?: number }> = ({ text, frames, size, color = C.ink, family = BODY, weight = 600, align = 'center', lead = 0 }) => {
  const f = useCurrentFrame();
  const words = text.split(' ');
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let acc = 0;
  return (
    <div style={{ font: `${weight} ${size}px/1.28 ${family}`, color, textAlign: align, textWrap: 'balance' as never }}>
      {words.map((w, i) => {
        // Each word lands when the voice is roughly there: spread over ~85% of the line by letter count.
        const at = lead + (acc / total) * frames * 0.85;
        acc += w.length + 1;
        const o = interpolate(f, [at, at + 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return <span key={i} style={{ display: 'inline-block', marginRight: '0.28em', opacity: 0.18 + o * 0.82, transform: `translateY(${(1 - o) * 10}px)`, filter: `blur(${(1 - o) * 4}px)` }}>{w}</span>;
      })}
    </div>
  );
};

const Caption: React.FC<{ c: Cue }> = ({ c }) => {
  const f = useCurrentFrame();
  const dur = c.frames + 8;
  const o = interpolate(f, [0, 6, dur - 8, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 150, right: 150, top: WIN_Y + WIN_H + 30, height: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: o }}>
      <Words text={c.text} frames={c.frames} size={c.text.length > 100 ? 33 : 38} />
    </div>
  );
};

const Progress: React.FC = () => {
  const f = useCurrentFrame();
  return <div style={{ position: 'absolute', left: 0, bottom: 0, height: 5, width: `${(f / TOTAL_FRAMES) * 100}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.gold})` }} />;
};

const Mark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ width: size, height: size, borderRadius: size, background: `radial-gradient(circle at 35% 30%, #ffe08a, ${C.gold} 55%, #e0a100)`, boxShadow: `0 ${size * 0.08}px ${size * 0.4}px rgba(255,200,61,.45), inset 0 -${size * 0.06}px 0 rgba(0,0,0,.15)`, display: 'grid', placeItems: 'center', font: `700 ${size * 0.58}px ${HEAD}`, color: '#6b4500' }}>N</div>
);

const TitleScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const end = TITLE.from + TITLE.frames;
  const pop = spring({ frame: f - 4, fps, config: { damping: 12, stiffness: 120 } });
  const out = interpolate(f, [end - 30, end + 4], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  if (out <= 0) return null;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out, transform: `translateY(${(1 - out) * -80}px) scale(${0.96 + out * 0.04})` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 36, transform: `scale(${0.7 + pop * 0.3})`, opacity: pop }}>
        <Mark size={170} />
        <div style={{ font: `700 210px/1 ${HEAD}`, color: C.ink, letterSpacing: -4 }}>Nims</div>
      </div>
      <div style={{ marginTop: 70, width: 1480 }}>
        <Words text={TITLE.text.replace('Meet Nims: ', '')} frames={TITLE.frames} lead={14} size={42} color={C.mute} />
      </div>
    </AbsoluteFill>
  );
};

const OutroScene: React.FC = () => {
  const f = useCurrentFrame() - OUTRO.from;
  const { fps } = useVideoConfig();
  const a = interpolate(f, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const pop = spring({ frame: f - 6, fps, config: { damping: 14, stiffness: 110 } });
  const pills = ['No wallet', 'No seed phrase', 'No gas'];
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: a }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 30, transform: `scale(${0.85 + pop * 0.15})` }}>
        <Mark size={130} />
        <div style={{ font: `700 170px/1 ${HEAD}`, color: C.ink, letterSpacing: -3 }}>Nims</div>
      </div>
      <div style={{ font: `600 46px ${BODY}`, color: C.ink, marginTop: 34 }}>The economy is the game.</div>
      <div style={{ display: 'flex', gap: 18, marginTop: 40 }}>
        {pills.map((p, i) => {
          const o = interpolate(f, [30 + i * 10, 42 + i * 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return <div key={p} style={{ opacity: o, transform: `translateY(${(1 - o) * 14}px)`, padding: '12px 26px', borderRadius: 99, border: '1.5px solid rgba(127,176,255,.5)', background: 'rgba(47,107,255,.18)', font: `600 28px ${BODY}`, color: C.ink }}>{p}</div>;
        })}
      </div>
      <div style={{ marginTop: 60, display: 'flex', alignItems: 'center', gap: 14, opacity: interpolate(f, [70, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), font: `600 26px ${BODY}`, color: C.mute }}>
        <span style={{ width: 10, height: 10, borderRadius: 10, background: '#3be08f', boxShadow: '0 0 14px #3be08f' }} />
        Settles to NEAR testnet in the background
      </div>
    </AbsoluteFill>
  );
};

export const Demo: React.FC<{ voice: boolean }> = ({ voice }) => (
  <AbsoluteFill style={{ background: C.navy, fontFamily: BODY }}>
    <Background />
    <Window />
    {CUES.filter((c) => c.key !== 'title' && c.key !== 'outro').map((c) => (
      <Sequence key={c.key} from={c.from} durationInFrames={c.frames + 8} layout="none"><Caption c={c} /></Sequence>
    ))}
    <TitleScene />
    <OutroScene />
    <Progress />
    {voice && CUES.map((c) => (
      <Sequence key={'a' + c.key} from={Math.max(0, c.from)} durationInFrames={c.frames + 15}><Audio src={staticFile(`vo/${c.key}.mp3`)} /></Sequence>
    ))}
  </AbsoluteFill>
);
