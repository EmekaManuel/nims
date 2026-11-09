import type { GameState, RealmId } from '../api';
import { coins } from '../api';
import type { Actions } from './Panels';

/** The road out of the realm: where it leads, how long it takes, what it costs, and a button to set off. */
export function JourneyPanel({ state, to, act }: { state: GameState; to: RealmId; act: Actions }) {
  const road = state.realm?.roads.find((r) => r.realm === to);
  if (!road) return <section className="panel"><h2>The road</h2><p className="muted">There is no road from here.</p></section>;
  const cost = road.passage + road.freight;
  const short = state.you.cash < cost;
  if (state.realm?.journey) return <section className="panel journey"><h2>On the road</h2><p>You're on your way to {state.realm.journey.name}. You arrive in {state.realm.journey.hoursLeft} hour{state.realm.journey.hoursLeft === 1 ? '' : 's'}.</p></section>;
  return (
    <section className="panel journey" aria-labelledby="journey-h">
      <h2 id="journey-h">The road to {road.name}</h2>
      <p>{road.blurb}</p>
      <ul className="journey-facts">
        <li><b>{road.hours} hours</b> on the road (about {Math.max(1, Math.round((road.hours * 10) / 60))} minute{road.hours * 10 >= 90 ? 's' : ''}). You can't trade until you arrive.</li>
        <li><b>{coins(road.passage)}</b> for the passage{road.freight > 0 ? <>, and <b>{coins(road.freight)}</b> to carry your load</> : ''}.</li>
      </ul>
      {to === 'saltmere' && <p className="small muted">The harbour pays more for thread and iron; the town pays more for spice and salt. Carry goods both ways.</p>}
      <button className="primary" disabled={short} onClick={() => act.travel(to)}>Set off · {coins(cost)}</button>
      {short && <p className="small muted">You need {coins(cost - state.you.cash)} more for the journey.</p>}
    </section>
  );
}

/** While on the road: where to, and how long until you arrive. Covers the map, since nothing there can be traded. */
export function OnTheRoad({ journey, hoursTotal }: { journey: NonNullable<NonNullable<GameState['realm']>['journey']>; hoursTotal: number }) {
  const done = Math.min(1, Math.max(0, 1 - journey.hoursLeft / Math.max(1, hoursTotal)));
  return (
    <div className="on-the-road" role="status" aria-live="polite">
      <div className="road-card">
        <span className="daily-h">On the road</span>
        <h3>To {journey.name}</h3>
        <div className="road-track" aria-hidden="true"><i style={{ width: `${done * 100}%` }} /><span className="cart" style={{ left: `${done * 100}%` }}>🛒</span></div>
        <p className="muted small">{journey.hoursLeft > 0 ? `Arriving in ${journey.hoursLeft} hour${journey.hoursLeft === 1 ? '' : 's'}.` : 'Arriving now.'}</p>
      </div>
    </div>
  );
}
