import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../ui';

/** The blue grid behind the title cards. */
export const Background: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 800px at 15% 10%, #16328a 0%, transparent 60%), radial-gradient(1000px 700px at 90% 100%, #1b3fb5 0%, transparent 55%), ${C.navy}` }}>
      <AbsoluteFill style={{ backgroundImage: 'linear-gradient(rgba(127,176,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(127,176,255,.07) 1px, transparent 1px)', backgroundSize: '64px 64px', backgroundPosition: `${f * 0.25}px ${f * 0.15}px`, maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 78%)' }} />
    </AbsoluteFill>
  );
};
