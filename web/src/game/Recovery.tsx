import type { GameState, JobView } from '../api';
import { coins } from '../api';
import { ItemIcon } from '../art/icons';
import type { Actions } from './Panels';

type Act = Pick<Actions, 'scavenge' | 'takeJob' | 'deliverJob' | 'dropJob'>;

const left = (h: number) => (h >= 24 ? `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'} left` : `${h}h left`);

/**
 * The way back when you are low on coins: a free search of the scrap heap when you are nearly broke, and an odd jobs
 * board that is always there. A job is carried from a merchant who has too much of a good to one who is short of it,
 * and the short merchant pays the reward from their own till.
 */
/** What the Odd jobs tab has to show: a hand for someone nearly broke, and the board for anyone short of coins (or holding a job). */
export function recoveryView(state: GameState) {
  const help = state.help;
  const board = state.jobs?.board ?? [];
  const mine = state.jobs?.active ?? null;
  // Jobs are for people short of coins (or already holding one). Everyone else just trades.
  const canWork = help ? help.canWork : true;
  const showJobs = !!mine || (canWork && board.length > 0);
  const showHelp = !!help?.needed;
  return { help, board, mine, showJobs, showHelp, any: showHelp || showJobs, urgent: showHelp || !!mine };
}

export function Recovery({ state, act }: { state: GameState; act: Act }) {
  const { help, board, mine, showJobs } = recoveryView(state);
  if (!help?.needed && !showJobs) return null;
  return (
    <>
      {help?.needed && (
        <section className="panel hand" aria-labelledby="hand-h">
          <h2 id="hand-h">Need a hand?</h2>
          <p>You are nearly out of coins and have nothing to sell. Search the scrap heap for something you can sell, or take an odd job below.</p>
          <button disabled={help.scavengeIn > 0} onClick={act.scavenge}>
            {help.scavengeIn > 0 ? `The heap refills in ${help.scavengeIn}h` : 'Search the scrap heap'}
          </button>
        </section>
      )}
      {showJobs && (
        <section className="panel jobs" aria-labelledby="jobs-h">
          <h2 id="jobs-h">Odd jobs</h2>
          <p className="muted small">A merchant who is short of something pays you to fetch it. You collect the goods for free; they pay you when you deliver.{help && help.workIn > 0 && !mine ? ` You can take your next job in ${help.workIn}h.` : ''}</p>
          <ul>
            {mine && <JobRow job={mine} mine act={act} />}
            {board.map((j) => <JobRow key={j.id} job={j} busy={!!mine || (help?.workIn ?? 0) > 0} act={act} />)}
          </ul>
        </section>
      )}
    </>
  );
}

function JobRow({ job, mine, busy, act }: { job: JobView; mine?: boolean; busy?: boolean; act: Act }) {
  return (
    <li className={mine ? 'mine' : undefined}>
      <div className="row">
        <b className="itemcell"><ItemIcon item={job.item} size={26} /> {job.units} {job.item}</b>
        <span className="reward">+{coins(job.reward)}</span>
      </div>
      <p className="muted small">
        {mine ? 'Your job: ' : ''}Collect at the {job.from.name.replace(/ \(.*\)$/, '').toLowerCase()}, carry to {job.to.name} · {left(job.hoursLeft)}
      </p>
      <div className="btns">
        {mine ? (
          <>
            <button onClick={act.deliverJob}>Deliver to {job.to.name}</button>
            <button onClick={act.dropJob}>Give it back</button>
          </>
        ) : (
          <button disabled={busy} onClick={() => act.takeJob(job.id)} title={busy ? 'Not available right now' : undefined}>Take this job</button>
        )}
      </div>
    </li>
  );
}
