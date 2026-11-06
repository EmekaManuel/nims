import { useRef, useState } from 'react';
import type { GameState } from '../api';
import { Deals } from './Mission';
import type { Actions } from './Panels';
import { Recovery, recoveryView } from './Recovery';

export type Which = 'deals' | 'jobs';
type Focus = Parameters<React.ComponentProps<typeof Deals>['onFocus']>[0];

/**
 * The Deals drawer: a switch between the best trades right now and the odd jobs board. It opens on the jobs tab
 * when you need it (nearly broke, or holding a job) and on the deals otherwise; after that the choice is yours.
 */
export function DealsDrawer({ state, act, onFocus, forceTab }: { state: GameState; act: Pick<Actions, 'scavenge' | 'takeJob' | 'deliverJob' | 'dropJob'>; onFocus: (f: Focus) => void; forceTab?: Which }) {
  const r = recoveryView(state);
  const [chosen, setTab] = useState<Which>(r.urgent ? 'jobs' : 'deals');
  // `forceTab` pins the tab from outside (the demo video does, because a frame-by-frame render cannot carry a choice from frame to frame).
  const tab = forceTab ?? chosen;
  const refs = { deals: useRef<HTMLButtonElement>(null), jobs: useRef<HTMLButtonElement>(null) };
  const go = (t: Which) => { setTab(t); refs[t].current?.focus(); };
  const jobCount = r.showJobs ? r.board.length + (r.mine ? 1 : 0) : 0;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      go(e.key === 'ArrowLeft' || e.key === 'Home' ? 'deals' : 'jobs');
    }
  };

  return (
    <>
      <div className="subtabs" role="tablist" aria-label="Deals" onKeyDown={onKey}>
        <button ref={refs.deals} role="tab" id="tab-deals" aria-selected={tab === 'deals'} aria-controls="panel-deals" tabIndex={tab === 'deals' ? 0 : -1} onClick={() => setTab('deals')}>
          Best deals
        </button>
        <button ref={refs.jobs} role="tab" id="tab-jobs" aria-selected={tab === 'jobs'} aria-controls="panel-jobs" tabIndex={tab === 'jobs' ? 0 : -1} onClick={() => setTab('jobs')}>
          Odd jobs
          {jobCount > 0 && <i className={`count${r.urgent ? ' urgent' : ''}`} aria-label={`${jobCount} job${jobCount === 1 ? '' : 's'}`}>{jobCount}</i>}
          {r.urgent && jobCount === 0 && <i className="count urgent" aria-label="you need a hand">!</i>}
        </button>
      </div>
      {tab === 'deals' ? (
        <div role="tabpanel" id="panel-deals" aria-labelledby="tab-deals"><Deals deals={state.deals} onFocus={onFocus} /></div>
      ) : (
        <div role="tabpanel" id="panel-jobs" aria-labelledby="tab-jobs">
          {r.any ? <Recovery state={state} act={act} /> : (
            <section className="panel">
              <h2>Odd jobs</h2>
              <p className="muted">Nothing for you right now. Odd jobs open up when you are short of coins: a merchant who is low on something pays you to fetch it.</p>
            </section>
          )}
        </div>
      )}
    </>
  );
}
