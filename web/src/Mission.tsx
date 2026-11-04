import type { Deal, Focus, GameState } from './api';
import { naira } from './api';

/** Always-visible answer to "what am I playing for, and what should I do now?" */
export function Mission({ state, onFocus, onPickGoal }: { state: GameState; onFocus: (f: Focus) => void; onPickGoal: () => void }) {
  const g = state.goal;
  return (
    <section className="mission" aria-label="Your goal and next step">
      <div className="goalcard">
        <span className="k">Your goal</span>
        {g ? (
          <>
            <h2>{g.done ? '🎉 ' : ''}{g.title}</h2>
            <progress max={1} value={g.progress} aria-label={`${Math.round(g.progress * 100)}% of the way`} />
            <div className="goalrow">
              <span>{g.done ? 'Goal reached!' : g.label}</span>
              <button className="link" onClick={onPickGoal}>{g.done ? 'Pick a new goal' : 'Change'}</button>
            </div>
          </>
        ) : (
          <>
            <h2>Not chosen yet</h2>
            <button className="primary" onClick={onPickGoal}>Choose your goal</button>
          </>
        )}
      </div>
      <div className="coachcard">
        <span className="k">Your next step</span>
        <p>{state.coach.text}</p>
        {state.coach.focus && <button onClick={() => onFocus(state.coach.focus)}>Show me on the map</button>}
      </div>
    </section>
  );
}

/** "Scrap spot (iron)" -> "scrap spot" */
const place = (label: string) => label.replace(/ \(.*\)$/, '').toLowerCase();

const ICON: Record<string, string> = { tomatoes: '🍅', pepper: '🌶️', garri: '🥣', ankara: '🧵', lace: '🪡', thread: '🧶', iron: '🔩', 'copper wire': '➰' };

export function Deals({ deals, onFocus }: { deals: Deal[]; onFocus: (f: Focus) => void }) {
  return (
    <section className="panel" aria-labelledby="deals-h">
      <h2 id="deals-h">Best deals right now</h2>
      {deals.length === 0 ? (
        <p className="muted">No gaps right now. Prices are close to usual everywhere — check back as the market moves.</p>
      ) : (
        <ul className="deals">
          {deals.map((d) => (
            <li key={d.item}>
              <div>
                <b>{ICON[d.item] ?? ''} {d.item}</b>
                <span className="profit">+{naira(d.profit)} each</span>
              </div>
              <p className="muted small">
                {d.from.kind === 'source' ? (d.from.cost ? `Buy at the ${place(d.from.label)} for ${naira(d.from.cost)}` : `Collect free at the ${place(d.from.label)}`) : `Buy from ${d.from.label} for ${naira(d.from.cost)}`}
                {' → '}sell to {d.to.stall} for {naira(d.to.price)}
              </p>
              <div className="btns">
                <button onClick={() => onFocus({ kind: d.from.kind, id: d.from.id })}>Where to get it</button>
                <button onClick={() => onFocus({ kind: 'stall', id: d.to.id })}>Where to sell</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
