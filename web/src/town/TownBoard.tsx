import { useEffect, useState } from 'react';
import { api, coins, type TownStats } from '../api';
import { Mascot } from '../art/Mascot';
import { VehicleIcon } from '../art/icons';
import { rankOf } from '../lib/rank';

const REFRESH_MS = 15_000;
const n = (x: number) => x.toLocaleString('en-US');
const LEVER: Record<string, string> = { rent: 'stall rent', payout: 'the profit payout' };

/** Keeps the town's public numbers fresh while the page is open. `null` while loading, `false` if the server can't say. */
function useTownStats(): TownStats | null | false {
  const [s, setS] = useState<TownStats | null | false>(null);
  useEffect(() => {
    let live = true;
    const load = () => void api.stats().then((x) => live && setS(x ?? false));
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => { live = false; window.clearInterval(id); };
  }, []);
  return s;
}

/**
 * The town board (#town): public, no sign-in. What real people are doing in Nims right now, who is richest, and what the
 * town councils have decided. Counts only signed-in people; names are the first names players already see in the game.
 */
export function TownBoard() {
  const s = useTownStats();
  return (
    <main className="town" aria-busy={s === null}>
      <header className="town-head">
        <div className="town-title">
          <Mascot size={52} mood="cheer" />
          <div>
            <h1>The town board</h1>
            <p className="lede">
              <span className="live-dot" aria-hidden="true" />
              Live from Nims{s ? <>, day {n(s.day)}</> : null}. Real people, real trades, and the rules they voted for.
            </p>
          </div>
        </div>
        <nav className="town-nav">
          <a className="button primary" href="/">Play now</a>
          <a href="#sim">Watch a simulated week →</a>
        </nav>
      </header>

      {s === false && <p className="panel town-empty">The town board can't be reached right now. Try again in a minute.</p>}
      {s === null && <p className="muted town-loading">Reading the town board…</p>}
      {s && (
        <>
          <section className="town-tiles" aria-label="The town in numbers">
            <Tile value={n(s.players)} label={s.players === 1 ? 'person has played' : 'people have played'} />
            <Tile value={n(s.last24h.players)} label="playing in the last 24 hours" />
            <Tile value={n(s.last24h.trades)} label={s.last24h.trades === 1 ? 'trade in the last 24 hours' : 'trades in the last 24 hours'} />
            <Tile value={n(s.total.passed)} label={s.total.passed === 1 ? 'council vote passed' : 'council votes passed'} />
            <Tile value={`${n(s.shops.open)} / ${n(s.shops.total)}`} label={s.shops.playerStalls ? `shops open, plus ${n(s.shops.playerStalls)} run by players` : 'shops open'} />
          </section>

          <div className="town-cols">
            <section className="panel town-leaders" aria-labelledby="leaders-h">
              <h2 id="leaders-h">Richest traders</h2>
              <p className="muted small">By net worth: cash, goods carried, vehicle, shares and stall.</p>
              {s.leaders.length === 0 ? (
                <p className="town-empty">No one has traded yet. <a href="/">Be the first on the board.</a></p>
              ) : (
                <ol className="leaders">
                  {s.leaders.map((l, i) => (
                    <li key={i} className={i < 3 ? `top top-${i + 1}` : undefined}>
                      <span className="place" aria-label={`Number ${i + 1}`}>{i + 1}</span>
                      <span className="who">
                        <b>{l.name}</b>
                        <span className="muted small">{rankOf(l.worth).title}</span>
                      </span>
                      <span className="holds" aria-label="What they hold">
                        <VehicleIcon vehicle={l.vehicle} size={26} />
                        {l.shares > 0 && <span className="chip">{n(l.shares)} {l.shares === 1 ? 'share' : 'shares'}</span>}
                        {l.stall && <span className="chip">own stall</span>}
                      </span>
                      <span className="worth">{coins(l.worth)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="panel town-council" aria-labelledby="council-h">
              <h2 id="council-h">Town council decisions</h2>
              <p className="muted small">Players with a seat vote on each market's rules. The merchants vote too.</p>
              {s.decisions.length === 0 ? (
                <p className="town-empty">No council vote has closed yet. Trade in a market to get a seat, then propose a change.</p>
              ) : (
                <ul className="decisions">
                  {s.decisions.map((d, i) => (
                    <li key={i}>
                      <span className={`verdict ${d.passed ? 'yes' : 'no'}`}>{d.passed ? 'Passed' : 'Turned down'}</span>
                      <span>
                        <b>{d.market}</b>: set {LEVER[d.lever] ?? d.lever} to <b>{d.to}</b>
                        <span className="muted small"> · day {n(d.day)} · {n(d.yes)} for, {n(d.no)} against{d.daoId !== null ? ` · on the DAO as proposal #${d.daoId}` : ''}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <p className="muted small town-foot">
            Counts only people signed in to the game, never the simulated traders. Names are the ones players chose, or a first name or initial;
            never an email. Updates every 15 seconds.
          </p>
        </>
      )}
    </main>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="tile">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
