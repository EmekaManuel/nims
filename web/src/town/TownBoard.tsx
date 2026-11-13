import { useEffect, useState } from 'react';
import { api, coins, type Leader, type TownStats } from '../api';
import { Mascot } from '../art/Mascot';
import { VehicleIcon } from '../art/icons';
import { rankOf } from '../lib/rank';
import { AvatarFigure, DEFAULT_AVATAR } from '../art/avatar';

const REFRESH_MS = 15_000;
const RETRY_MS = 3_000;
const n = (x: number) => x.toLocaleString('en-US');
const EXPLORER = 'https://testnet.nearblocks.io/address/';
const LEVER: Record<string, string> = { rent: 'stall rent', payout: 'the profit payout' };

/**
 * Keeps the town's public numbers fresh while the page is open. A failed refresh never removes what is already on screen:
 * the last good numbers stay and `connected` goes false so the page can say it is reconnecting. Retries quickly until it answers.
 */
function useTownStats(): { s: TownStats | null; connected: boolean } {
  const [s, setS] = useState<TownStats | null>(null);
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    let live = true;
    let id = 0;
    const load = () => {
      void api.stats().then((x) => {
        if (!live) return;
        if (x) setS(x);
        setConnected(!!x);
        id = window.setTimeout(load, x ? REFRESH_MS : RETRY_MS);
      });
    };
    load();
    return () => { live = false; window.clearTimeout(id); };
  }, []);
  return { s, connected };
}

/**
 * The town board (/town): public, no sign-in. What real people are doing in Nims right now, who is richest, and what the
 * town councils have decided. Counts only signed-in people; names are the first names players already see in the game.
 */
export function TownBoard() {
  const { s, connected } = useTownStats();
  const [range, setRange] = useState<'all' | 'day'>('all');
  return (
    <main className="town" aria-busy={s === null}>
      <header className="town-head">
        <div className="town-title">
          <Mascot size={52} mood="cheer" />
          <div>
            <h1>The town board</h1>
            <p className="lede">
              <span className={`live-dot${connected ? '' : ' connecting'}`} aria-hidden="true" />
              {connected ? 'Live from Nims' : 'Reconnecting to Nims'}{s ? <>, day {n(s.day)}</> : null}. Real people, real trades, and the rules they voted for.
            </p>
          </div>
        </div>
        <nav className="town-nav">
          <a className="button primary" href="/">Play now</a>
          <a href="/week">Watch a simulated week →</a>
        </nav>
      </header>

      {s === null && <p className="muted town-loading" role="status">{connected ? 'Reading the town board…' : 'Connecting to the town… still trying.'}</p>}
      {s && !connected && <p className="muted small town-loading" role="status">Connection lost. Showing the last numbers we got; retrying.</p>}
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
              <div className="leaders-head">
                <h2 id="leaders-h">Richest traders</h2>
                <div className="seg" role="group" aria-label="Which players">
                  <button type="button" aria-pressed={range === 'all'} onClick={() => setRange('all')}>All time</button>
                  <button type="button" aria-pressed={range === 'day'} onClick={() => setRange('day')}>Last 24 hours</button>
                </div>
              </div>
              <p className="muted small">
                {range === 'all' ? 'Everyone who has played, by net worth: cash, goods carried, vehicle, shares and stall.' : 'Only people who played in the last 24 real hours, by net worth.'}
              </p>
              <Leaders list={range === 'all' ? s.leaders : (s.leaders24h ?? [])} empty={range === 'all' ? 'No one has traded yet.' : 'No one has played in the last 24 hours.'} />
            </section>

            <section className="panel town-council" aria-labelledby="council-h">
              <h2 id="council-h">Town council decisions</h2>
              <p className="muted small">Players with a seat vote on each market's rules. The merchants vote too.</p>
              {s.decisions.length === 0 ? (
                <p className="town-empty">
                  {s.total.decisions > 0
                    ? <>{n(s.total.decisions)} council {s.total.decisions === 1 ? 'vote has' : 'votes have'} closed so far, {s.total.passed === 0 ? 'none' : n(s.total.passed)} passed. Trade in a market to get a seat, then propose a change.</>
                    : <>No council vote has closed yet. Trade in a market to get a seat, then propose a change.</>}
                </p>
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

          <Impact s={s} />

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

function Leaders({ list, empty }: { list: Leader[]; empty: string }) {
  if (list.length === 0) return <p className="town-empty">{empty} <a href="/">Be the first on the board.</a></p>;
  return (
    <ol className="leaders">
      {list.map((l, i) => (
        <li key={i} className={i < 3 ? `top top-${i + 1}` : undefined}>
          <span className="place" aria-label={`Number ${i + 1}`}>{i + 1}</span>
          <span className="who">
            <AvatarFigure a={l.avatar ?? DEFAULT_AVATAR} size={36} />
            <span className="who-t">
              <b>{l.name}</b>
              <span className="muted small">{rankOf(l.worth).title}</span>
            </span>
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
  );
}

/** "3 minutes ago", for the last settlement. Empty when the time is unknown or in the future. */
function ago(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t) || t > now) return '';
  const m = Math.round((now - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} hour${h === 1 ? '' : 's'} ago` : `${Math.round(h / 24)} days ago`;
}

/**
 * What the town has shown so far, in the town's own live numbers (nothing here is typed in by hand). Plain about the limits:
 * testnet, and coins are play money.
 */
function Impact({ s }: { s: TownStats }) {
  const contract = s.chain?.contract;
  const settled = ago(s.chain?.lastSettledAt);
  const since = s.since ? new Date(s.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  const dao = s.decisions.find((d) => d.daoId !== null);
  return (
    <section className="panel town-impact" aria-labelledby="impact-h">
      <h2 id="impact-h">What this shows</h2>
      <p className="lede">An economy where the traders are AI agents with their own money, played by real people{since ? <>, counted since {since}</> : null}.</p>
      <div className="impact-grid">
        <div className="impact">
          <b>{n(s.players)} {s.players === 1 ? 'person' : 'people'}, {n(s.total.trades)} {s.total.trades === 1 ? 'trade' : 'trades'}</b>
          <p>Real people moved a market that no one scripts: {n(s.shops.open)} of {n(s.shops.total)} merchant shops are open, each priced by an agent from its own stock and cash. {n(s.last24h.players)} played in the last 24 hours.</p>
        </div>
        <div className="impact">
          <b>On NEAR, out of sight</b>
          <p>
            Every good and coin settles to the NEP-245 contract{contract ? <> <a href={`${EXPLORER}${contract}`} target="_blank" rel="noreferrer">{contract}</a></> : null} on NEAR testnet.
            {settled ? <> Last settled {settled}.</> : null} Players sign in with Google or as a guest and never see a wallet.
          </p>
        </div>
        <div className="impact">
          <b>{s.total.passed > 0 ? `${n(s.total.passed)} ${s.total.passed === 1 ? 'rule' : 'rules'} voted in` : 'Rules the players set'}</b>
          <p>
            Shareholders vote on each market's rent and payout, and a passing vote changes how the economy runs from the next day.
            {dao ? <> Each decision is recorded on a SputnikDAO by an agent whose key is custodied by OutLayer (latest: proposal #{dao.daoId}).</> : <> Each decision is recorded on a SputnikDAO by an agent whose key is custodied by OutLayer.</>}
          </p>
        </div>
      </div>
      <p className="why"><b>Why it matters.</b> Trusting an AI agent with money is a trust problem, not an intelligence one. In Nims every merchant decision becomes a small, fixed step, so an agent can run a real business on a real account without being able to break the economy. The same shape fits anywhere agents need a budget.</p>
      <p className="muted small">NEAR testnet only. Coins are the game's own currency and are never cashed out.</p>
    </section>
  );
}
