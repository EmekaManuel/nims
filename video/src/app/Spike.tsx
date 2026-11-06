import { AbsoluteFill } from 'remotion';
import '../../../web/src/styles.css';
import fixture from '../../../web/src/test/fixture.json';
import type { GameState } from '../../../web/src/api';
import { DistrictMap } from '../../../web/src/game/Map';
import { Hud } from '../../../web/src/game/Hud';
import { Mission } from '../../../web/src/game/Mission';
import { Dock } from '../../../web/src/game/Dock';
import { IconSprite } from '../../../web/src/art/icons';

const state = fixture as unknown as GameState;
const noop = () => {};
const act = new Proxy({}, { get: () => noop }) as never;

/** Spike: the real game screen, drawn by Remotion from a state object. */
export const Spike: React.FC = () => (
  <AbsoluteFill style={{ background: '#fff' }}>
    <IconSprite />
    <div className="shell" style={{ width: 1920, height: 1080 }}>
      <Hud state={state} act={act} onHelp={noop} sound onSound={noop} peakWorth={state.you.netWorth} />
      <main className="stage">
        <div className="viewport">
          <div className="mapscroll"><DistrictMap state={state} selected={null} onSelect={noop} popups={[]} /></div>
          <Mission state={state} onFocus={noop} onPickGoal={noop} />
        </div>
      </main>
      <Dock tab={null} onTab={noop} newsCount={0} />
    </div>
  </AbsoluteFill>
);
