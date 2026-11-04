import type { GameState } from './api';
import { coins } from './api';
import { Glyph, ItemIcon, VehicleIcon } from './icons';
import type { Actions } from './Panels';

const SHOCK: Record<string, string> = {
  rain: 'Rain: produce spoils faster and gathering is slower',
  'fuel queue': 'Fuel queue: carrying goods between markets costs double',
  'festive season': 'Festive season: fabric is in demand',
};
const VEHICLE = { wheelbarrow: 'Wheelbarrow', pickup: 'Pickup', van: 'Van' } as const;
const SEGMENTS = 10;

export function Hud({ state, act, onHelp }: { state: GameState; act: Actions; onHelp?: () => void }) {
  const y = state.you;
  const nextUp = y.upgrades.find((u) => (u.vehicle === 'pickup' && y.vehicle === 'wheelbarrow') || (u.vehicle === 'van' && y.vehicle === 'pickup'));
  const h = state.hour % 24;
  const night = h >= 20 || h < 6;
  const filled = Math.round((y.carrying / y.capacity) * SEGMENTS);
  return (
    <header className="hud">
      <div className="brand">
        <span className="wordmark">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#1d63d6" /><path d="M5 12h22l-2.500 5h-17z" fill="#fff" /><rect x="8" y="17" width="16" height="8" rx="1.500" fill="#fff" opacity=".85" /></svg>
          Nims
        </span>
        <small>
          <Glyph name={night ? 'moon' : 'sun'} size={16} /> Day {state.day} · {String(h).padStart(2, '0')}:00
        </small>
      </div>
      <div className="stats">
        <div>
          <span className="k">Cash</span>
          <b><Glyph name="coin" size={20} /> {coins(y.cash)}</b>
        </div>
        <div>
          <span className="k">Net worth</span>
          <b>{coins(y.netWorth)}</b>
        </div>
        <div className="load">
          <span className="k">{VEHICLE[y.vehicle]} · carrying</span>
          <span className="loadrow">
            <VehicleIcon vehicle={y.vehicle} size={32} />
            <span className="segs" role="img" aria-label={`Carrying ${y.carrying} of ${y.capacity}`}>
              {Array.from({ length: SEGMENTS }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
            </span>
            <b>{y.carrying}/{y.capacity}</b>
          </span>
        </div>
        {nextUp && (
          <button className="brass" disabled={y.cash < nextUp.cost} onClick={() => act.upgrade(nextUp.vehicle)} title={`Carry ${nextUp.capacity} at a time`}>
            Buy {nextUp.vehicle} · {coins(nextUp.cost)}
          </button>
        )}
      </div>
      <div className="inv" aria-label="What you are carrying">
        {y.inventory.length === 0 ? <span className="empty">Empty-handed</span> : y.inventory.map((i) => <span key={i.item} className="chip"><ItemIcon item={i.item} size={20} /> {i.units} {i.item}</span>)}
      </div>
      <a className="hudlink" href="#sim" title="Watch the whole economy run for a week">Fast-forward a week</a>
      {onHelp && <button className="helpbtn" onClick={onHelp} aria-label="How to play">? How to play</button>}
      {state.shocks.map((s) => (
        <div key={s.kind} className="shock" role="status">{SHOCK[s.kind] ?? s.kind} · {s.hoursLeft}h left</div>
      ))}
    </header>
  );
}
