import { Composition } from 'remotion';
import { Banner } from './Banner';
import { Demo, FPS, TOTAL_FRAMES } from './Demo';

export const Root: React.FC = () => (
  <>
    <Composition id="Demo" component={Demo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ voice: true }} />
    {/* Same picture, no narration track: for laying your own voice over. */}
    <Composition id="DemoSilent" component={Demo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ voice: false }} />
    <Composition id="Banner" component={Banner} durationInFrames={1} fps={FPS} width={1600} height={640} />
  </>
);
