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

/** A little car for the journey, drawn so it looks the same everywhere. It faces the way it's going. */
function Car() {
  return (
    <svg width="46" height="26" viewBox="0 0 46 26">
      <path d="M4 17v-4c0-1.5 1-2.5 2.5-2.7L12 9l5-5.5C18 2.5 19 2 20.5 2h10c1.4 0 2.6.6 3.4 1.7L38 9l3.8 1c1.3.4 2.2 1.5 2.2 2.9V17c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2z" fill="#d6336c" stroke="#14253d" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 9l4.4-4.6c.4-.4.9-.6 1.4-.6h4.7V9zM27 9V3.8h3.6c.7 0 1.3.3 1.6.8L35.5 9z" fill="#cfe6ff" stroke="#14253d" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="40" y="12" width="3" height="2.4" rx="1" fill="#ffd98a" />
      {[12, 34].map((x) => <g key={x}><circle cx={x} cy="19" r="4.6" fill="#14253d" /><circle cx={x} cy="19" r="1.8" fill="#c3cfe3" /></g>)}
    </svg>
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
        <div className="road-track" aria-hidden="true">
          <i style={{ width: `${done * 100}%` }} />
          <span className="car" style={{ left: `${done * 100}%` }}><Car /></span>
        </div>
        <p className="muted small">{journey.hoursLeft > 0 ? `Arriving in ${journey.hoursLeft} hour${journey.hoursLeft === 1 ? '' : 's'}.` : 'Arriving now.'}</p>
      </div>
    </div>
  );
}
