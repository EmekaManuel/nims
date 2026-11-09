import { useState } from 'react';
import type { GameState } from '../api';
import { coins } from '../api';
import type { Actions } from './Panels';

type QuestsView = NonNullable<GameState['quests']>;

/** How many things in the Quests tab are waiting to be claimed (for the badge on the dock). */
export const questsReady = (q: GameState['quests']) => (q ? q.active.filter((a) => a.complete).length + (q.daily.ready ? 1 : 0) : 0);

/** The Quests tab: today's reward, the quests you're on, and how far through the starter chain you are. */
export function QuestsPanel({ quests, act, invite }: { quests: QuestsView; act: Actions; invite?: GameState['invite'] }) {
  const { daily, starter } = quests;
  return (
    <section className="panel quests" aria-labelledby="quests-h">
      <h2 id="quests-h">Quests</h2>

      <div className={`daily ${daily.ready ? 'ready' : ''}`} role="group" aria-label="Daily reward">
        <div>
          <span className="daily-h">Daily reward{daily.day > 1 ? ` · day ${daily.day} in a row` : ''}</span>
          <p>{daily.ready ? <>Today's reward: <b>{coins(daily.reward)}</b>. It grows each day you come back in a row.</> : <>You've had today's reward. Come back tomorrow{daily.day < 7 ? ' for more' : ''}.</>}</p>
          <ol className="streak" aria-label={`Streak: day ${daily.day} of 7`}>
            {Array.from({ length: 7 }, (_, i) => <li key={i} className={i < daily.day - (daily.ready ? 1 : 0) ? 'got' : i === daily.day - 1 && daily.ready ? 'today' : ''} />)}
          </ol>
        </div>
        <button className="primary" disabled={!daily.ready} onClick={() => act.claimDaily()}>{daily.ready ? 'Claim' : 'Claimed'}</button>
      </div>

      {quests.active.length === 0 && <p className="muted">You've finished every quest for now. New ones come with new places to explore.</p>}
      {quests.active.map((q) => (
        <article key={q.id} className={`qcard ${q.complete ? 'complete' : ''}`} aria-label={q.title}>
          <header>
            <span className="quest-chain">{q.chain === 'starter' ? `Getting started · ${starter.done + 1} of ${starter.total}` : 'Journey'}</span>
            <span className="quest-reward">+{coins(q.reward)}</span>
          </header>
          <h3>{q.title}</h3>
          <p className="muted small">{q.story}</p>
          <ul className="objectives">
            {q.objectives.map((o, i) => (
              <li key={i} className={o.done >= o.target ? 'met' : ''}>
                <span>{o.done >= o.target ? '✓ ' : ''}{o.label}</span>
                <span className="count">{Math.min(o.done, o.target)} / {o.target}</span>
                <span className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (o.done / o.target) * 100)}%` }} /></span>
              </li>
            ))}
          </ul>
          {q.complete && <button className="primary" onClick={() => act.claimQuest(q.id)}>Claim {coins(q.reward)}</button>}
        </article>
      ))}

      <p className="small muted">Starter quests done: {starter.done} of {starter.total}.</p>
      {invite && <InviteCard invite={invite} />}
    </section>
  );
}

/** Your invite link: when a friend you invite makes their first sale, you both get coins. */
function InviteCard({ invite }: { invite: NonNullable<GameState['invite']> }) {
  const link = `${location.origin}/?invite=${invite.code}`;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(link).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }, () => {});
  };
  return (
    <div className="invite" role="group" aria-label="Invite a friend">
      <span className="daily-h">Invite a friend</span>
      <p>When a friend you invite makes their first sale, you each get <b>{coins(invite.reward)}</b>.</p>
      <div className="invite-link">
        <input readOnly value={link} aria-label="Your invite link" onFocus={(e) => e.currentTarget.select()} />
        <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="small muted">Friends joined: {invite.joined} · rewarded: {invite.rewarded} of {invite.max}</p>
    </div>
  );
}
