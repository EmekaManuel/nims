import { useState } from 'react';
import type { GameState, RealmId } from '../api';
import { coins } from '../api';
import type { Actions } from './Panels';
import { NumberField, TextField } from '../ui';

type Road = NonNullable<GameState['realm']>['roads'][number];

/** Every road out of here: where it leads, by car or plane, how long, what it costs, and a button to set off. `to` comes first. */
export function JourneyPanel({ state, to, act }: { state: GameState; to: RealmId; act: Actions }) {
  if (state.realm?.journey) return <section className="panel journey"><h2>On the road</h2><p>You're on your way to {state.realm.journey.name}. You arrive in {state.realm.journey.hoursLeft} hour{state.realm.journey.hoursLeft === 1 ? '' : 's'}.</p></section>;
  const roads = [...(state.realm?.roads ?? [])].sort((a, b) => (a.realm === to ? -1 : b.realm === to ? 1 : 0));
  if (!roads.length) return <section className="panel"><h2>Travel</h2><p className="muted">There is no road from here.</p></section>;
  return (
    <section className="panel journey" aria-labelledby="journey-h">
      <h2 id="journey-h">Travel</h2>
      <p className="muted small">You can't trade on the way. Goods are worth more where they're scarce: carry them where they're dear.</p>
      {roads.map((r) => <RoadCard key={r.realm} road={r} cash={state.you.cash} act={act} />)}
    </section>
  );
}

function RoadCard({ road, cash, act }: { road: Road; cash: number; act: Actions }) {
  const cost = road.passage + road.freight;
  const short = cash < cost;
  const plane = road.travel === 'plane';
  const minutes = Math.max(1, Math.round((road.hours * 10) / 60));
  return (
    <article className="road-card-item" aria-label={road.name}>
      <header>
        <span className="road-mode" aria-hidden="true">{plane ? <Plane size={34} /> : <Car size={34} />}</span>
        <h3>{road.name}</h3>
        {road.frontier && <span className={`badge-tag ${road.discovered ? '' : 'new'}`}>{road.discovered ? 'Frontier' : 'Unexplored'}</span>}
      </header>
      <p className="small">{road.blurb}</p>
      <p className="small muted">{plane ? 'A flight' : 'A drive'} of {road.hours} hours (about {minutes} minute{minutes === 1 ? '' : 's'}) · {coins(road.passage)} {plane ? 'fare' : 'passage'}{road.freight > 0 ? ` + ${coins(road.freight)} to carry your load` : ''}</p>
      <button className="primary" disabled={short} onClick={() => act.travel(road.realm)}>{plane ? 'Fly' : 'Set off'} · {coins(cost)}</button>
      {short && <span className="small muted"> You need {coins(cost - cash)} more.</span>}
    </article>
  );
}

/** A plot of frontier land: buy it, build on it, or put it up for sale. */
export function LandPanel({ state, plotId, act }: { state: GameState; plotId: string; act: Actions }) {
  const plot = state.land?.here.find((x) => x.id === plotId);
  const [name, setName] = useState('');
  const [ask, setAsk] = useState<number | null>(null);
  if (!plot) return <section className="panel"><h2>Land</h2><p className="muted">That land is somewhere else.</p></section>;
  const place = state.realm?.name ?? 'here';
  const ownHere = state.land?.mine.some((x) => x.realm === plot.realm && x.id !== plot.id);
  const cost = plot.owner ? plot.forSale : plot.price;
  const build = state.land?.buildCost ?? 4000;
  return (
    <section className="panel land-panel" aria-labelledby="land-h">
      <h2 id="land-h">{plot.owner ? (plot.owner.mine ? 'Your land' : `${plot.owner.name}'s land`) : 'Land for sale'} · plot {plot.n + 1}</h2>
      <p className="muted">{plot.n < 2 ? 'Right by the source: the busiest spot in ' : plot.n >= 6 ? 'At the edge of ' : 'In the middle of '}{place}.</p>
      {!plot.owner?.mine && (
        cost === null ? <p>{plot.owner!.name} is not selling this plot.</p> : (
          <>
            <p>{plot.owner ? <>{plot.owner.name} will sell it for <b>{coins(cost)}</b>.</> : <>The town sells it for <b>{coins(cost)}</b>.</>} Then build a business on it for {coins(build)}.</p>
            {ownHere ? <p className="small muted">You already own land in {place}: one plot in each place.</p>
              : <button className="primary" disabled={state.you.cash < cost} onClick={() => act.buyLand(plot.id)}>Buy this land · {coins(cost)}</button>}
          </>
        )
      )}
      {plot.owner?.mine && !plot.business && (
        <>
          <h3>Build a business</h3>
          <p className="small">A shop that sells to the people of {place}: you set its prices and stock it with what you carry.</p>
          <TextField label="Name it (optional)" value={name} onChange={setName} placeholder={`${state.you.name}'s Trading Post`} hint="2 to 24 letters." />
          <button className="primary" disabled={state.you.cash < build} onClick={() => act.build(plot.id, name.trim() || undefined)}>Build · {coins(build)}</button>
          <h3>Or sell the land</h3>
          {plot.forSale !== null
            ? <><p className="small">It's for sale at <b>{coins(plot.forSale)}</b>.</p><button onClick={() => act.listLand(plot.id, 0)}>Take it off the market</button></>
            : <div className="row"><NumberField id="ask" aria-label="Asking price" min={100} max={1000000} value={ask ?? Math.max(plot.price, 2000)} onValueChange={setAsk} /><button onClick={() => act.listLand(plot.id, ask ?? Math.max(plot.price, 2000))}>Put up for sale</button></div>}
        </>
      )}
    </section>
  );
}

export function Car({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size * 26 / 46} viewBox="0 0 46 26">
      <path d="M4 17v-4c0-1.5 1-2.5 2.5-2.7L12 9l5-5.5C18 2.5 19 2 20.5 2h10c1.4 0 2.6.6 3.4 1.7L38 9l3.8 1c1.3.4 2.2 1.5 2.2 2.9V17c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2z" fill="#d6336c" stroke="#14253d" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 9l4.4-4.6c.4-.4.9-.6 1.4-.6h4.7V9zM27 9V3.8h3.6c.7 0 1.3.3 1.6.8L35.5 9z" fill="#cfe6ff" stroke="#14253d" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="40" y="12" width="3" height="2.4" rx="1" fill="#ffd98a" />
      {[12, 34].map((x) => <g key={x}><circle cx={x} cy="19" r="4.6" fill="#14253d" /><circle cx={x} cy="19" r="1.8" fill="#c3cfe3" /></g>)}
    </svg>
  );
}

/** A small plane for the long journeys, nose to the right. */
export function Plane({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size * 28 / 46} viewBox="0 0 46 28">
      <path d="M4 14c0-1.6 1.3-2.8 3-2.8h26c4 0 9 1.4 10 2.8-1 1.4-6 2.8-10 2.8H7c-1.7 0-3-1.2-3-2.8z" fill="#f6f2e6" stroke="#14253d" strokeWidth="1.4" />
      <path d="M18 11.4L24 2h4l-3 9.4zM18 16.6L24 26h4l-3-9.4z" fill="#2a6fdb" stroke="#14253d" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 11.4L4 6h3l4 5.4z" fill="#2a6fdb" stroke="#14253d" strokeWidth="1.2" strokeLinejoin="round" />
      {[30, 34, 38].map((x) => <circle key={x} cx={x} cy="13.6" r="1.2" fill="#2a6fdb" />)}
    </svg>
  );
}

/** While on the road: where to, and how long until you arrive. A car drives the road, or a plane flies it. */
export function OnTheRoad({ journey, hoursTotal }: { journey: NonNullable<NonNullable<GameState['realm']>['journey']>; hoursTotal: number }) {
  const total = journey.hours ?? hoursTotal;
  const done = Math.min(1, Math.max(0, 1 - journey.hoursLeft / Math.max(1, total)));
  const plane = journey.travel === 'plane';
  return (
    <div className="on-the-road" role="status" aria-live="polite">
      <div className="road-card">
        <span className="daily-h">{plane ? 'In the air' : 'On the road'}</span>
        <h3>To {journey.name}</h3>
        <div className={`road-track ${plane ? 'sky' : ''}`} aria-hidden="true">
          <i style={{ width: `${done * 100}%` }} />
          <span className="car" style={{ left: `${done * 100}%` }}>{plane ? <Plane /> : <Car />}</span>
        </div>
        <p className="muted small">{journey.hoursLeft > 0 ? `Arriving in ${journey.hoursLeft} hour${journey.hoursLeft === 1 ? '' : 's'}.` : 'Arriving now.'}</p>
      </div>
    </div>
  );
}

