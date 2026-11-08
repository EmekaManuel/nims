import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, clamp, ease } from '../ui';
import { Chain, Hook, Outro, Record } from '../cards';
import { FPS, SCENES, TOTAL_FRAMES, type Scene } from '../timeline';
import { Background } from './Background';
import { centre, shot as getShot, TARGETS, type Shot } from './model';
import { Caption, Chips, Cursor, Gain, Pill, RuleChange, Stat, cameraAt, sec, type CameraKey, type CursorKey } from './overlays';
import { SIM_HOURS, SimDashboard } from './Sim';
import { OVERVIEW, SPOT, project, townCamAt, type CamKey, type V3 } from './town';
import { LoadingScreen, LoginScreen, Screen } from './Screen';

/** What happens on screen in a scene, in seconds from its start. Positions come from `npm run measure`, so they follow the real layout. */
interface Script {
  /** Which recorded shot is showing, and whether a tooltip is being hovered / the haggle box is ticked. */
  shots: { t: number; id: string; hover?: boolean; haggle?: boolean; dealsTab?: 'deals' | 'jobs'; /** the drawer opens at this shot: slide it in */ open?: boolean }[];
  cursor: CursorKey[];
  camera: CameraKey[];
  /** The 3D camera in the town behind the screen. */
  town: CamKey[];
  pills?: { t: number; hold: number; node: React.ReactNode }[];
  /** Short sounds: a name from public/sfx and when. */
  sounds?: { t: number; name: string; volume: number }[];
}

const C0 = (x: number, y: number) => ({ x, y });
/** Where a point in the 3D town is on the screen in a shot, with the town camera as it is at time `t` (seconds into the scene). */
const at3d = (shotId: string, keys: CamKey[], t: number, p: V3) => project(TARGETS[shotId].map3d, townCamAt(keys, t), p);

// The town camera, scene by scene. It moves slowly and eases in and out; each key is a place to be at a time.
// Aimed with scripts/aim.mjs so the subject lands in the left-centre, clear of the side drawer that covers the right third.
type Look = Pick<CamKey, 'pos' | 'look' | 'fov'>;
const EAST: Look = { pos: [12.2, 4.6, 9.6], look: [8.561, 0.433, 1.27], fov: 38 };
const EAST_B: Look = { pos: [11.6, 4.4, 10.2], look: [8.853, 0.505, 1.409], fov: 38 };
const LENA: Look = { pos: [2.8, 3.2, 2.4], look: [5.383, 0.082, -6.744], fov: 42 };
const LENA2: Look = { pos: [4.6, 3.4, 2.7], look: [4.741, 0.104, -6.74], fov: 42 };
const LENA3: Look = { pos: [3.4, 3, 2.2], look: [5.871, 1.042, -7.29], fov: 42 };
const FABRIC: Look = { pos: [5.6, 5.8, 6.8], look: [6.783, 0.566, -1.639], fov: 44 };
const FABRIC2: Look = { pos: [3, 6, 7.2], look: [5.956, 0.86, -0.852], fov: 44 };
const WIDE_A: Look = { pos: [-1.2, 9.2, 11.6], look: [1.814, 3.143, 4.236], fov: 38 };
// The collect scene opens a little further back along the same line as EAST, so the move in is a slow dolly, not a sweep across the town.
const EAST_START: Look = { pos: [13.47, 6.06, 12.52], look: [8.561, 0.433, 1.27], fov: 38 };
const WIDE_B: Look = { pos: [2.6, 8.8, 11.8], look: [3.364, 3.034, 3.665], fov: 38 };

const WIDE = { x: 960, y: 540, zoom: 1 };
const cashOf = (id: string) => (getShot(id).state as { you: { cash: number } }).you.cash;
const earned = (id: string) => Number(/earned (\d+) coins/.exec(getShot(id).toast?.text ?? '')?.[1] ?? 0);

function script(s: Scene): Script | null {
  const T = (x: number) => x; // seconds
  switch (s.key) {
    case 'collect': {
      // in to the shed, a slow drift, then across the town to Lena's stall while the narration finishes (so the next scene starts there)
      const town: CamKey[] = [{ t: 0, ...EAST_START }, { t: 1.5, ...EAST }, { t: 3.6, ...EAST_B }, { t: 7.8, ...LENA }];
      const cotton = at3d('town', town, 1.75, SPOT.cotton);
      const collect = centre('wholesaler', 'btn:collect');
      return {
        shots: [{ t: 0, id: 'town' }, { t: 1.85, id: 'wholesaler', open: true }, { t: 3.35, id: 'collected' }],
        town,
        cursor: [{ t: 0, ...C0(900, 760) }, { t: T(1.55), ...cotton }, { t: T(1.75), ...cotton, click: true }, { t: T(3.0), ...collect }, { t: T(3.25), ...collect, click: true }],
        camera: [{ t: 0, ...WIDE }, { t: 1.9, x: 1300, y: 540, zoom: 1.2 }, { t: 4.6, ...WIDE }],
        pills: [{ t: 3.4, hold: sec(2.6), node: <Stat label="CASH" from={cashOf('wholesaler')} to={cashOf('collected')} at={sec(3.4)} sign /> }],
        sounds: [{ t: 3.35, name: 'tick.wav', volume: 0.5 }],
      };
    }
    case 'tooltip': {
      const town: CamKey[] = [{ t: 0, ...LENA }, { t: 13, ...LENA2 }];
      const lena = at3d('collected', town, 1.0, SPOT.lena);
      const price = centre('stall', 'price:lena:cotton');
      const bubble = centre('hover', 'bubble');
      return {
        shots: [{ t: 0, id: 'collected' }, { t: 1.1, id: 'stall' }, { t: 2.7, id: 'hover', hover: true }],
        town,
        cursor: [{ t: 0, ...C0(1500, 760) }, { t: T(0.85), ...lena }, { t: T(1.0), ...lena, click: true }, { t: T(2.5), ...price }],
        camera: [{ t: 0, ...WIDE }, { t: 1.1, x: 1500, y: 450, zoom: 1.25 }, { t: 2.7, x: 1560, y: 520, zoom: 1.45 }],
      };
    }
    case 'sale': {
      const haggle = centre('stall', 'check:haggle');
      const sell = centre('stall', 'btn:sell:cotton');
      const price = centre('stall', 'price:lena:cotton');
      return {
        // the haggle box is ticked when the cursor clicks it, and stays ticked
        shots: [{ t: 0, id: 'stall' }, { t: 1.15, id: 'stall', haggle: true }, { t: 2.35, id: 'sold', haggle: true }, { t: s.clip ? s.clip.start / FPS : 5.6, id: 'reaction', haggle: true }],
        town: [{ t: 0, ...LENA2 }, { t: 8.8, ...LENA3 }, { t: 12.3, ...FABRIC }],
        cursor: [{ t: 0, ...price }, { t: T(0.9), ...haggle }, { t: T(1.1), ...haggle, click: true }, { t: T(2.0), ...sell }, { t: T(2.2), ...sell, click: true }],
        camera: [{ t: 0, x: 1500, y: 450, zoom: 1.4 }, { t: 5.0, x: 1300, y: 800, zoom: 1.35 }],
        pills: [{ t: 2.4, hold: sec(2.8), node: <Stat label="CASH" from={cashOf('collected')} to={cashOf('sold')} at={sec(2.4)} sign /> }],
        sounds: [{ t: 2.35, name: 'ping.wav', volume: 0.5 }],
      };
    }
    case 'council': {
      const town: CamKey[] = [{ t: 0, ...FABRIC }, { t: 11.5, ...FABRIC2 }, { t: 14.9, ...WIDE_A }];
      const business = centre('reaction', 'dock:business');
      const low = centre('council', 'btn:rent:low');
      const card = centre('council', 'council:fabric');
      const tally = (getShot('council-open').state as { council: { market: string; proposal: { yes: number; no: number } | null }[] }).council.find((c) => c.market === 'fabric')!.proposal!;
      return {
        shots: [{ t: 0, id: 'reaction', haggle: true }, { t: 2.9, id: 'council' }, { t: 6.75, id: 'council-open' }, { t: 9.25, id: 'council-done' }],
        town,
        cursor: [{ t: 0, ...C0(1500, 500) }, { t: T(2.5), ...business }, { t: T(2.7), ...business, click: true }, { t: T(6.3), ...low }, { t: T(6.5), ...low, click: true }, { t: T(7.6), ...C0(1480, 760) }],
        camera: [{ t: 0, ...WIDE }, { t: 3.0, x: 1550, y: 420, zoom: 1.45 }, { t: 12.5, x: 1550, y: 420, zoom: 1.45 }, { t: 14.4, ...WIDE }],
        pills: [{ t: 9.6, hold: sec(3.6), node: <RuleChange market="Fabric Market" rule="Stall rent" from="normal" to="low" tally={`${tally.yes} for · ${tally.no} against`} /> }],
        sounds: [{ t: 6.75, name: 'tick.wav', volume: 0.5 }, { t: 9.25, name: 'ping.wav', volume: 0.5 }],
      };
    }
    case 'broke': {
      const deals = centre('council-done', 'dock:deals');
      const scav = centre('broke', 'btn:scavenge');
      const take = centre('jobs', 'btn:take');
      const deliver = centre('job-taken', 'btn:deliver');
      return {
        town: [{ t: 0, ...WIDE_A }, { t: 11, ...WIDE_B }],
        shots: [{ t: 0, id: 'council-done' }, { t: 0.75, id: 'broke' }, { t: 2.85, id: 'scrap' }, { t: 4.2, id: 'jobs' }, { t: 5.35, id: 'job-taken' }, { t: 7.25, id: 'job-done' }].map((x) => ({ ...x, dealsTab: x.t >= 0.75 ? ('jobs' as const) : undefined })),
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
        town: [{ t: 0, ...WIDE_B }, { t: 6, ...WIDE_A }],
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
    // The real loading animation, then the real sign-in screen: the cursor points at Google, then the email is typed and sent.
    const LOAD = 1.5;
    const email = 'ada@example.com';
    const typed = email.slice(0, Math.floor(interpolate(t, [4.4, 5.9], [0, email.length], clamp)));
    const google = centre('login', 'login:google');
    const field = centre('login', 'login:email');
    const send = centre('login', 'login:send');
    const camera = cameraAt([{ t: 0, ...WIDE }, { t: LOAD, ...WIDE }, { t: LOAD + 0.2, x: 960, y: 470, zoom: 1.4 }], t);
    const cursor: CursorKey[] = [{ t: 0, x: 1300, y: 760 }, { t: 2.5, ...google }, { t: 3.9, ...google }, { t: 4.1, ...field, click: true }, { t: 6.4, ...send }, { t: 6.6, ...send, click: true }];
    const loadOpacity = interpolate(t, [LOAD - 0.1, LOAD + 0.3], [1, 0], clamp);
    const loginOpacity = interpolate(t, [LOAD - 0.1, LOAD + 0.3], [0, 1], clamp);
    return (
      <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
        {t < LOAD + 0.4 && <AbsoluteFill style={{ opacity: loadOpacity }}><LoadingScreen t={t} /></AbsoluteFill>}
        <AbsoluteFill style={{ opacity: loginOpacity }}>
          <LoginScreen email={typed} camera={camera} />
          <Cursor keys={cursor} camera={camera} t={t} />
        </AbsoluteFill>
        {t >= LOAD && <Chips s={s} items={['No wallet', 'No seed phrase', 'No gas']} />}
        {t >= LOAD && <Caption s={s} />}
      </AbsoluteFill>
    );
  }

  const sc = script(s)!;
  const current = [...sc.shots].reverse().find((x) => t >= x.t) ?? sc.shots[0];
  const camera = cameraAt(sc.camera, t);
  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      <Screen shot={getShot(current.id) as Shot} camera={camera} hover={current.hover} haggle={current.haggle} dealsTab={current.dealsTab} night drawerAge={current.open ? t - current.t : undefined}
        town={{ t: (s.from + f) / FPS, camera: townCamAt(sc.town, t), dpr: 2 }} />
      <Cursor keys={sc.cursor} camera={camera} t={t} />
      {sc.pills?.map((p, i) => <Pill key={i} at={sec(p.t)} hold={p.hold}>{p.node}</Pill>)}
      <Caption s={s} />
    </AbsoluteFill>
  );
};

/** The fast-forward week: the real dashboard, drawn from a run of the real engine, played through while it scrolls down the page. */
const SimScene: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const dur = s.frames / FPS;
  const fadeIn = interpolate(f, [0, 6], [0, 1], clamp);
  const fadeOut = interpolate(f, [s.frames - 6, s.frames], [1, 0], clamp);
  // the week plays from the start to the end of the scene, and the page scrolls: prices first, then the shops, then who did well and what happened
  const hour = interpolate(t, [0.5, dur - 1.0], [0, SIM_HOURS - 1], { ...clamp, easing: ease });
  const scroll = interpolate(t, [0, 2.0, 3.6, 5.6, 7.2, dur], [0, 0, SIM_SCROLL[0], SIM_SCROLL[0], SIM_SCROLL[1], SIM_SCROLL[1]], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut, background: '#fff' }}>
      <SimDashboard hour={hour} scroll={scroll} />
      <Caption s={s} />
    </AbsoluteFill>
  );
};
/** How far the dashboard scrolls (pixels) to show the shops, then the traders and the news. */
const SIM_SCROLL = [640, 1160];

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
          {s.key === 'hook' ? <Hook /> : s.key === 'chain' ? <Chain /> : s.key === 'record' ? <Record /> : s.key === 'outro' ? <Outro /> : s.kind === 'footage' ? <SimScene s={s} /> : <AppScene s={s} />}
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
