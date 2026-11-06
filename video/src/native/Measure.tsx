import { useEffect } from 'react';
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from 'remotion';
import { SHOTS } from './model';
import { Screen } from './Screen';
import { measureAll } from './targets';

/** Frame i shows shot i and logs where every named element is. `npm run measure` collects these into src/data/targets.json. */
export const Measure: React.FC = () => {
  const frame = useCurrentFrame();
  const shot = SHOTS[Math.min(frame, SHOTS.length - 1)];
  useEffect(() => {
    const h = delayRender('measure');
    const t = setTimeout(() => {
      console.log('TARGETS ' + JSON.stringify({ id: shot.id, rects: measureAll() }));
      continueRender(h);
    }, 700);
    return () => clearTimeout(t);
  }, [shot.id]);
  return <AbsoluteFill><Screen shot={shot} hover /></AbsoluteFill>;
};
