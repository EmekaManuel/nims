import type { Deal, Focus, GameState } from './api';
import { coins } from './api';
import { ItemIcon } from './icons';
import { Mascot } from './Mascot';

/** The quest tracker: what you're playing for, and Nim the guide telling you what to do next. */
export function Mission({ state, onFocus, onPickGoal }: { state: GameState; onFocus: (f: Focus) => void; onPickGoal: () => void }) {
  const g = state.goal;
  return (
    <section className="quest" aria-label="Your goal and next step">
      <div className="quest-goal">
        <span className="k">Your goal</span>
        {g ? (
          <>
            <h2>{g.title}</h2>
            <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.progress * 100)} aria-label="Progress towards your goal">
              <i style={{ width: `${Math.max(2, g.progress * 100)}%` }} />
            </div>
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
      <div className="quest-guide">
        <Mascot size={54} mood={g?.done ? 'cheer' : 'happy'} />
        <div className="guide-bubble">
          <span className="k">Your next step</span>
          <p>{state.coach.text}</p>
          {state.coach.focus && <button onClick={() => onFocus(state.coach.focus)}>Show me on the map</button>}
        </div>
      </div>
    </section>
  );
}

/** "Scrap spot (iron)" -> "scrap spot" */
const place = (label: string) => label.replace(/ \(.*\)$/, '').toLowerCase();


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
                <b className="itemcell"><ItemIcon item={d.item} size={26} /> {d.item}</b>
                <span className="profit">+{coins(d.profit)} each</span>
              </div>
              <p className="muted small">
                {d.from.kind === 'source' ? `Buy at the ${place(d.from.label)} for ${coins(d.from.cost)}` : `Buy from ${d.from.label} for ${coins(d.from.cost)}`}
                {' → '}sell to {d.to.stall} for {coins(d.to.price)}
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
