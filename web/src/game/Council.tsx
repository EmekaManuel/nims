import type { CouncilView, GameState, MarketId } from '../api';
import type { Actions } from './Panels';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LEVER_NAME = { rent: 'Stall rent', payout: 'Profit payout' } as const;

function Market({ c, act }: { c: CouncilView; act: Actions }) {
  const pr = c.proposal;
  const total = pr ? pr.yes + pr.no : 0;
  const share = pr && total > 0 ? Math.round((pr.yes / total) * 100) : 0;
  return (
    <div className="council-market">
      <h4>{c.name}</h4>
      <p className="small">
        <b>Rent {c.rent}</b> · <b>Payout {c.payout}</b>
        {c.seats > 0 ? <span className="muted"> · your say: {c.seats} {c.seats === 1 ? 'seat' : 'seats'}</span> : <span className="muted"> · no say yet</span>}
      </p>

      {pr ? (
        <div className="vote" role="group" aria-label={`Open vote in the ${c.name}`}>
          <p className="small"><b>{pr.by}</b> wants <b>{LEVER_NAME[pr.lever].toLowerCase()} set to {pr.to}</b>. {pr.effect}</p>
          <div className="votebar" role="img" aria-label={`${pr.yes} for, ${pr.no} against`}><i style={{ width: `${share}%` }} /></div>
          <p className="small muted">
            {pr.yes} for · {pr.no} against
            {pr.merchants.for + pr.merchants.against > 0 && ` · the merchants are ${pr.merchants.for ? 'for' : 'against'} it`}
            {' · '}closes in {pr.closesIn} {pr.closesIn === 1 ? 'hour' : 'hours'}
          </p>
          {c.seats > 0 ? (
            <div className="mk">
              <button className={pr.yourVote === 'yes' ? 'primary' : ''} aria-pressed={pr.yourVote === 'yes'} onClick={() => act.councilVote(c.market, true)}>For</button>
              <button className={pr.yourVote === 'no' ? 'primary' : ''} aria-pressed={pr.yourVote === 'no'} onClick={() => act.councilVote(c.market, false)}>Against</button>
            </div>
          ) : <p className="small muted">Trade here, or own a share in a merchant, to vote.</p>}
        </div>
      ) : c.canPropose ? (
        <div className="propose">
          {(['rent', 'payout'] as const).map((lever) => (
            <div key={lever} className="mk">
              <span className="small muted">{LEVER_NAME[lever]}:</span>
              {c.options[lever].filter((o) => o !== c[lever]).map((o) => (
                <button key={o} onClick={() => act.councilPropose(c.market, lever, o)}>{cap(o)}</button>
              ))}
            </div>
          ))}
        </div>
      ) : c.seats === 0 ? (
        <p className="small muted">Trade here, or own a share in a merchant, to propose changes.</p>
      ) : null}
    </div>
  );
}

/** The town council: shareholders vote on each market's rent and payout, and the economy changes with the result. */
export function Council({ state, act }: { state: GameState; act: Actions }) {
  const markets = state.council ?? [];
  if (markets.length === 0) return null;
  return (
    <>
      <h3>Town council</h3>
      <p className="small muted">
        Shareholders run each market. Vote on what merchants pay in rent and how much profit they share out. Trading in a market gives you a seat there, and each share you hold adds another. The merchants vote too. Votes close in the evening.
      </p>
      {markets.map((c) => <Market key={c.market as MarketId} c={c} act={act} />)}
    </>
  );
}
