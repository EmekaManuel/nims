import { useEffect } from 'react';
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from 'remotion';
import { SHOTS } from './model';
import { LoginScreen, Screen } from './Screen';
import { measureAll } from './targets';

/** Frame i shows shot i and logs where every named element is. `npm run measure` collects these into src/data/targets.json. */
export const Measure: React.FC = () => {
  const frame = useCurrentFrame();
  const isLogin = frame >= SHOTS.length;
  const shot = SHOTS[Math.min(frame, SHOTS.length - 1)];
  const id = isLogin ? 'login' : shot.id;
  useEffect(() => {
    const h = delayRender('measure');
    const t = setTimeout(() => {
      console.log('TARGETS ' + JSON.stringify({ id, rects: measureAll() }));
      continueRender(h);
    }, 700);
    return () => clearTimeout(t);
  }, [id]);
  return <AbsoluteFill>{isLogin ? <LoginScreen /> : <Screen shot={shot} hover night town={{ t: 0, camera: { position: [0, 9.5, 11], target: [0, 0, -0.5], fov: 38 } }} />}</AbsoluteFill>;
};
