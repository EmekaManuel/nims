import type { GameState } from '../api';
import { coins } from '../api';
import { Glyph, ItemIcon, VehicleIcon } from '../art/icons';
import { Mascot } from '../art/Mascot';
import type { Actions } from './Panels';
import { rankOf } from '../lib/rank';

const SHOCK: Record<string, string> = {
  rain: 'Rain: produce spoils faster and gathering is slower',
  'fuel queue': 'Fuel queue: carrying goods between markets costs double',
  'festive season': 'Festive season: fabric is in demand',
};
const SHOCK_SHORT: Record<string, string> = { rain: 'Rain', 'fuel queue': 'Fuel queue', 'festive season': 'Festive season' };
const VEHICLE = { wheelbarrow: 'Wheelbarrow', pickup: 'Pickup', van: 'Van' } as const;
const SEGMENTS = 10;

/** Rank with an XP ring: how far to the next rank. */
export function RankBadge({ worth }: { worth: number }) {
  const r = rankOf(worth);
  const C = 2 * Math.PI * 17;
  return (
    <div className="rank" title={r.next ? `${coins(r.next.at - worth)} to ${r.next.title}` : 'Top rank'}>
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="17" className="ring-bg" />
        <circle cx="22" cy="22" r="17" className="ring-fg" strokeDasharray={`${C * r.progress} ${C}`} transform="rotate(-90 22 22)" />
        <text x="22" y="27" textAnchor="middle" className="ring-level">{r.level}</text>
      </svg>
      <span className="rank-text"><small>Rank {r.level}</small><b>{r.title}</b></span>
    </div>
  );
}

export function Hud({ state, act, onHelp, sound, onSound, peakWorth }: { state: GameState; act: Actions; onHelp?: () => void; sound?: boolean; onSound?: () => void; peakWorth?: number }) {
  const y = state.you;
  const nextUp = y.upgrades.find((u) => (u.vehicle === 'pickup' && y.vehicle === 'wheelbarrow') || (u.vehicle === 'van' && y.vehicle === 'pickup'));
  const h = state.hour % 24;
  const night = h >= 20 || h < 6;
  const filled = Math.round((y.carrying / y.capacity) * SEGMENTS);
  return (
    <header className="hud">
      <div className="brand">
        <span className="wordmark"><Mascot size={38} />Nims</span>
        <small className="daypill"><Glyph name={night ? 'moon' : 'sun'} size={15} /> Day {state.day} · {String(h).padStart(2, '0')}:00</small>
      </div>

      <div className="pills">
        <div className="pill coin">
          <Glyph name="coin" size={28} />
          <span><small className="k">Cash</small><b>{coins(y.cash)}</b></span>
        </div>
        <div className="pill">
          <span><small className="k">Net worth</small><b>{coins(y.netWorth)}</b></span>
        </div>
        <div className="pill load">
          <VehicleIcon vehicle={y.vehicle} size={28} />
          <span>
            <small className="k">{VEHICLE[y.vehicle]} · carrying</small>
            <span className="loadrow">
              <span className="segs" role="img" aria-label={`Carrying ${y.carrying} of ${y.capacity}`}>
                {Array.from({ length: SEGMENTS }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
              </span>
              <b>{y.carrying}/{y.capacity}</b>
            </span>
          </span>
        </div>
        {y.fareOwed > 0 && <span className="chip owe" title="You couldn't pay the whole fare up front. It comes out of your next sale.">Fare owed: {coins(y.fareOwed)}</span>}
        <div className="inv" aria-label="What you are carrying">
          {y.inventory.length === 0 ? <span className="empty">Empty-handed</span> : y.inventory.map((i) => <span key={i.item} className="chip"><ItemIcon item={i.item} size={20} /> {i.units} {i.item}</span>)}
        </div>
      </div>

      <div className="hud-right">
        <RankBadge worth={Math.max(y.netWorth, peakWorth ?? 0)} />
        {nextUp && (
          <button className="gold" disabled={y.cash < nextUp.cost} onClick={() => act.upgrade(nextUp.vehicle)} title={`Carry ${nextUp.capacity} at a time`}>
            Buy {nextUp.vehicle} · {nextUp.cost.toLocaleString('en-US')}
          </button>
        )}
        {onSound && <button className="iconbtn" onClick={onSound} aria-pressed={sound} aria-label={sound ? 'Sound on. Press to mute' : 'Sound off. Press to turn on'} title={sound ? 'Sound on' : 'Sound off'}>{sound ? '♪' : '✕'}</button>}
        <a className="hudlink" href="#sim" title="Watch the whole economy run for a week">Fast-forward</a>
        {onHelp && <button className="helpbtn" onClick={onHelp} aria-label="How to play" title="How to play">?</button>}
      </div>

      {state.shocks.length > 0 && (
        <div className="shockrow">
          {state.shocks.map((s) => (
            <div key={s.kind} className="shock" role="status" title={SHOCK[s.kind]}>
              <span className="long">{SHOCK[s.kind] ?? s.kind}</span>
              <span className="short">{SHOCK_SHORT[s.kind] ?? s.kind}</span> · {s.hoursLeft}h left
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
