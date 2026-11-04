import type { GameState } from './api';
import { naira } from './api';
import type { Actions } from './Panels';

const SHOCK: Record<string, string> = { rain: '☔ Rain: produce spoils faster and gathering is slower', 'fuel queue': '⛽ Fuel queue: carrying goods between markets costs double', 'festive season': '🎉 Festive season: fabric is in demand' };
const VEHICLE = { wheelbarrow: '🛒 Wheelbarrow', keke: '🛺 Keke', van: '🚐 Van' } as const;

export function Hud({ state, act }: { state: GameState; act: Actions }) {
  const y = state.you;
  const nextUp = y.upgrades.find((u) => (u.vehicle === 'keke' && y.vehicle === 'wheelbarrow') || (u.vehicle === 'van' && y.vehicle === 'keke'));
  const hour = String(state.hour % 24).padStart(2, '0');
  return (
    <header className="hud">
      <div className="brand">Oja <small>Day {state.day} · {hour}:00</small></div>
      <div className="stats">
        <div><span className="k">Cash</span><b>{naira(y.cash)}</b></div>
        <div><span className="k">Net worth</span><b>{naira(y.netWorth)}</b></div>
        <div className="load">
          <span className="k">{VEHICLE[y.vehicle]}</span>
          <progress max={y.capacity} value={y.carrying} aria-label="Load" />
          <b>{y.carrying}/{y.capacity}</b>
        </div>
        {nextUp && (
          <button disabled={y.cash < nextUp.cost} onClick={() => act.upgrade(nextUp.vehicle)} title={`Carry ${nextUp.capacity} at a time`}>
            Buy {nextUp.vehicle} · {naira(nextUp.cost)}
          </button>
        )}
      </div>
      <div className="inv" aria-label="What you are carrying">
        {y.inventory.length === 0 ? <span className="muted">Empty-handed</span> : y.inventory.map((i) => <span key={i.item} className="chip">{i.units} {i.item}</span>)}
      </div>
      {state.shocks.map((s) => (
        <div key={s.kind} className="shock" role="status">{SHOCK[s.kind] ?? s.kind} · {s.hoursLeft}h left</div>
      ))}
    </header>
  );
}
