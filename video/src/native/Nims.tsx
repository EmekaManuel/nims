import { AbsoluteFill, Audio, Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, clamp } from '../ui';
import { Chain, Hook, Outro } from '../cards';
import { FPS, SCENES, TOTAL_FRAMES, type Scene } from '../timeline';
import simclip from '../data/simclip.json';
import { Background } from './Background';
import { centre, shot as getShot, type Shot } from './model';
import { Caption, Chips, Cursor, Gain, Pill, Stat, cameraAt, sec, type CameraKey, type CursorKey } from './overlays';
import { LoginScreen, Screen } from './Screen';

/** What happens on screen in a scene, in seconds from its start. Positions come from `npm run measure`, so they follow the real layout. */
interface Script {
  /** Which recorded shot is showing, and whether a tooltip is being hovered / the haggle box is ticked. */
  shots: { t: number; id: string; hover?: boolean; haggle?: boolean; dealsTab?: 'deals' | 'jobs' }[];
  cursor: CursorKey[];
  camera: CameraKey[];
  pills?: { t: number; hold: number; node: React.ReactNode }[];
  /** Short sounds: a name from public/sfx and when. */
  sounds?: { t: number; name: string; volume: number }[];
}

const C0 = (x: number, y: number) => ({ x, y });
const WIDE = { x: 960, y: 540, zoom: 1 };
const cashOf = (id: string) => (getShot(id).state as { you: { cash: number } }).you.cash;
const earned = (id: string) => Number(/earned (\d+) coins/.exec(getShot(id).toast?.text ?? '')?.[1] ?? 0);

function script(s: Scene): Script | null {
  const T = (x: number) => x; // seconds
  switch (s.key) {
    case 'collect': {
      const cotton = centre('town', 'map:cotton');
      const collect = centre('wholesaler', 'btn:collect');
      return {
        shots: [{ t: 0, id: 'town' }, { t: 1.85, id: 'wholesaler' }, { t: 3.35, id: 'collected' }],
        cursor: [{ t: 0, ...C0(1150, 820) }, { t: T(1.5), ...cotton }, { t: T(1.75), ...cotton, click: true }, { t: T(3.0), ...collect }, { t: T(3.25), ...collect, click: true }],
        camera: [{ t: 0, ...WIDE }, { t: 1.9, x: 1420, y: 470, zoom: 1.3 }, { t: 4.6, ...WIDE }],
        pills: [{ t: 3.4, hold: sec(2.6), node: <Stat label="CASH" from={cashOf('wholesaler')} to={cashOf('collected')} at={sec(3.4)} sign /> }],
        sounds: [{ t: 3.35, name: 'tick.wav', volume: 0.5 }],
      };
    }
    case 'tooltip': {
      const lena = centre('collected', 'map:lena');
      const price = centre('stall', 'price:lena:cotton');
      const bubble = centre('hover', 'bubble');
      return {
        shots: [{ t: 0, id: 'collected' }, { t: 1.1, id: 'stall' }, { t: 2.7, id: 'hover', hover: true }],
        cursor: [{ t: 0, ...C0(1500, 760) }, { t: T(0.85), ...lena }, { t: T(1.0), ...lena, click: true }, { t: T(2.5), ...price }],
        camera: [{ t: 0, ...WIDE }, { t: 1.1, x: 1500, y: 450, zoom: 1.25 }, { t: 2.7, x: (price.x + bubble.x) / 2 + 40, y: (price.y + bubble.y) / 2, zoom: 1.75 }],
      };
    }
    case 'sale': {
      const haggle = centre('stall', 'check:haggle');
      const sell = centre('stall', 'btn:sell:cotton');
      const price = centre('stall', 'price:lena:cotton');
      return {
        // the haggle box is ticked when the cursor clicks it, and stays ticked
        shots: [{ t: 0, id: 'stall' }, { t: 1.15, id: 'stall', haggle: true }, { t: 2.35, id: 'sold', haggle: true }, { t: s.clip ? s.clip.start / FPS : 5.6, id: 'reaction', haggle: true }],
        cursor: [{ t: 0, ...price }, { t: T(0.9), ...haggle }, { t: T(1.1), ...haggle, click: true }, { t: T(2.0), ...sell }, { t: T(2.2), ...sell, click: true }],
        camera: [{ t: 0, x: 1500, y: 450, zoom: 1.4 }, { t: 5.0, x: 1300, y: 800, zoom: 1.35 }],
        pills: [{ t: 2.4, hold: sec(2.8), node: <Stat label="CASH" from={cashOf('collected')} to={cashOf('sold')} at={sec(2.4)} sign /> }],
        sounds: [{ t: 2.35, name: 'ping.wav', volume: 0.5 }],
      };
    }
    case 'broke': {
      const deals = centre('stall', 'dock:deals');
      const scav = centre('broke', 'btn:scavenge');
      const take = centre('jobs', 'btn:take');
      const deliver = centre('job-taken', 'btn:deliver');
      return {
        shots: [{ t: 0, id: 'stall' }, { t: 0.75, id: 'broke' }, { t: 2.85, id: 'scrap' }, { t: 4.2, id: 'jobs' }, { t: 5.35, id: 'job-taken' }, { t: 7.25, id: 'job-done' }].map((x) => ({ ...x, dealsTab: x.t >= 0.75 ? ('jobs' as const) : undefined })),
        cursor: [{ t: 0, ...C0(1500, 400) }, { t: T(0.45), ...deals }, { t: T(0.6), ...deals, click: true }, { t: T(2.5), ...scav }, { t: T(2.7), ...scav, click: true }, { t: T(5.0), ...take }, { t: T(5.2), ...take, click: true }, { t: T(7.0), ...deliver }, { t: T(7.15), ...deliver, click: true }],
        camera: [{ t: 0, ...WIDE }, { t: 0.8, x: 1560, y: 470, zoom: 1.35 }],
        pills: [{ t: 7.3, hold: sec(2.4), node: <Gain label="JOB PAID" coins={earned('job-done')} /> }],
        sounds: [{ t: 7.25, name: 'ping.wav', volume: 0.5 }],
      };
    }
    case 'news': {
      const news = centre('job-done', 'dock:news');
      return {
        shots: [{ t: 0, id: 'job-done' }, { t: 0.95, id: 'news' }],
        cursor: [{ t: 0, ...C0(1500, 420) }, { t: T(0.6), ...news }, { t: T(0.8), ...news, click: true }],
        camera: [{ t: 0, ...WIDE }, { t: 1.2, x: 1560, y: 420, zoom: 1.55 }],
      };
    }
    default:
      return null;
  }
}

const AppScene: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const fadeIn = interpolate(f, [0, 6], [0, 1], clamp);
  const fadeOut = interpolate(f, [s.frames - 6, s.frames], [1, 0], clamp);

  if (s.key === 'signin') {
    // The real sign-in screen: the email is typed, then the button is pressed.
    const email = 'ada@example.com';
    const typed = email.slice(0, Math.floor(interpolate(t, [0.9, 2.6], [0, email.length], clamp)));
    const field = centre('login', 'login:email');
    const send = centre('login', 'login:send');
    const camera = cameraAt([{ t: 0, ...WIDE }, { t: 0.4, x: 960, y: 400, zoom: 1.45 }], t);
    const cursor: CursorKey[] = [{ t: 0, x: 1300, y: 760 }, { t: 0.6, ...field }, { t: 0.8, ...field, click: true }, { t: 3.0, ...send }, { t: 3.2, ...send, click: true }];
    return (
      <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
        <LoginScreen email={typed} camera={camera} />
        <Cursor keys={cursor} camera={camera} t={t} />
        <Chips s={s} items={['No wallet', 'No seed phrase', 'No gas']} />
        <Caption s={s} />
      </AbsoluteFill>
    );
  }

  const sc = script(s)!;
  const current = [...sc.shots].reverse().find((x) => t >= x.t) ?? sc.shots[0];
  const camera = cameraAt(sc.camera, t);
  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      <Screen shot={getShot(current.id) as Shot} camera={camera} hover={current.hover} haggle={current.haggle} dealsTab={current.dealsTab} />
      <Cursor keys={sc.cursor} camera={camera} t={t} />
      {sc.pills?.map((p, i) => <Pill key={i} at={sec(p.t)} hold={p.hold}>{p.node}</Pill>)}
      <Caption s={s} />
    </AbsoluteFill>
  );
};

/** The fast-forward week: the one screen that is footage (the replay is an animation the game plays itself). */
const SimScene: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame();
  const n = simclip.b - simclip.a;
  const rate = Math.min(1.9, Math.max(0.8, n / (s.frames / FPS - 0.2)));
  const play = Math.min(s.frames, Math.round((n / rate) * FPS));
  const last = Math.max(0, Math.round(simclip.b * FPS) - 1);
  const fadeIn = interpolate(f, [0, 6], [0, 1], clamp);
  const fadeOut = interpolate(f, [s.frames - 6, s.frames], [1, 0], clamp);
  const video = { width: 1920, height: 1080 } as const;
  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut, background: '#fff' }}>
      <Sequence from={0} durationInFrames={Math.max(1, play)} layout="none">
        <OffthreadVideo src={staticFile('raw.mp4')} muted startFrom={Math.round(simclip.a * FPS)} playbackRate={rate} style={video} />
      </Sequence>
      {play < s.frames && (
        <Sequence from={play} durationInFrames={s.frames - play} layout="none">
          <Freeze frame={0}><OffthreadVideo src={staticFile('raw.mp4')} muted startFrom={last} style={video} /></Freeze>
        </Sequence>
      )}
      <Caption s={s} />
    </AbsoluteFill>
  );
};

const Progress: React.FC = () => {
  const f = useCurrentFrame();
  return <div style={{ position: 'absolute', left: 0, bottom: 0, height: 5, width: `${(f / TOTAL_FRAMES) * 100}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.gold})` }} />;
};

export const Nims: React.FC<{ voice: boolean }> = ({ voice }) => {
  const sfx = (name: string, at: number, volume: number) => <Sequence key={name + at} from={Math.max(0, at)} durationInFrames={FPS * 2}><Audio src={staticFile(`sfx/${name}`)} volume={volume} /></Sequence>;
  return (
    <AbsoluteFill style={{ background: C.navy }}>
      <Background />
      {SCENES.map((s) => (
        <Sequence key={s.key} from={s.from} durationInFrames={s.frames}>
          {s.key === 'hook' ? <Hook /> : s.key === 'chain' ? <Chain /> : s.key === 'outro' ? <Outro /> : s.kind === 'footage' ? <SimScene s={s} /> : <AppScene s={s} />}
        </Sequence>
      ))}
      <Progress />

      {/* sound: a quiet bed, a whoosh into each scene, short sounds on the screen, the narration, and each merchant's own voice */}
      <Audio src={staticFile('sfx/bed.mp3')} volume={(f) => 0.07 * interpolate(f, [0, 60, TOTAL_FRAMES - 90, TOTAL_FRAMES], [0, 1, 1, 0], clamp)} />
      {SCENES.map((s) => sfx('whoosh.wav', s.from - 4, 0.16))}
      {SCENES.flatMap((s) => (script(s)?.sounds ?? []).map((x) => sfx(x.name, s.from + sec(x.t), x.volume)))}
      {SCENES.filter((s) => s.clip).map((s) => (
        <Sequence key={'c' + s.key} from={s.from + s.clip!.start} durationInFrames={s.clip!.frames + 20}><Audio src={staticFile(`live/${s.clip!.name}.mp3`)} /></Sequence>
      ))}
      {voice && SCENES.map((s) => (
        <Sequence key={'v' + s.key} from={s.from + s.delay} durationInFrames={s.voiceFrames + 20}><Audio src={staticFile(`vo/${s.key}.mp3`)} /></Sequence>
      ))}
    </AbsoluteFill>
  );
};
