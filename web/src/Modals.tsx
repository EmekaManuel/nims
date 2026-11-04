import { useEffect, useRef } from 'react';
import type { GameState, GoalKind } from './api';
import type { Away } from './api';

function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How Nims works" onClose={onClose}>
      <p className="lede">You’re a trader in a small market town. Eight merchants run their own stalls, each with their own cash and their own mind about prices.</p>
      <ol className="how">
        <li><b>Buy low, sell high.</b> Collect goods from the farms and scrap spots (free), or buy them from a stall. Carry them to wherever they’re dear and sell.</li>
        <li><b>Prices move.</b> A stall piled high with iron pays less for more. A stall running short pays more. Dump too much on one stall and its price falls, and it can run out of cash and <b>close</b>.</li>
        <li><b>Hover any price</b> and the merchant tells you why they’re offering it, in their own words.</li>
        <li><b>Pick a goal.</b> A bar at the top tracks it, and a “next step” card always tells you what to do now.</li>
        <li><b>Grow.</b> Spend your profit on a bigger vehicle: a pickup carries three times a wheelbarrow, and a van carries more still.</li>
      </ol>
      <p className="muted small">The town keeps trading while you play. Other traders are collecting and selling too.</p>
      <button className="primary" onClick={onClose}>Start trading</button>
    </Modal>
  );
}

export function GoalPicker({ goals, current, onPick, onClose }: { goals: GameState['goals']; current?: GoalKind; onPick: (k: GoalKind) => void; onClose: () => void }) {
  return (
    <Modal title="What are you playing for?" onClose={onClose}>
      <p className="muted">Pick one. You can change it later.</p>
      <div className="goalgrid">
        {goals.map((g) => (
          <button key={g.kind} className={`goalopt ${g.kind === current ? 'cur' : ''}`} onClick={() => onPick(g.kind)}>
            <b>{g.title}</b>
            <span>{g.blurb}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Shown once when you come back after a long time: what the town and your business did without you. */
export function AwayModal({ away, onClose }: { away: Away; onClose: () => void }) {
  const days = Math.max(1, Math.round(away.hours / 24));
  const quiet = away.notes.length === 0 && away.town.length === 0;
  return (
    <Modal title="Welcome back" onClose={onClose}>
      <p className="lede">The market kept trading for {away.hours >= 24 ? `${days} ${days === 1 ? 'day' : 'days'}` : `${away.hours} hours`} while you were gone.</p>
      {away.notes.length > 0 && (
        <>
          <h3>Your business</h3>
          <ul className="notes">{away.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
      {away.town.length > 0 && (
        <>
          <h3>Around town</h3>
          <ul className="notes">{away.town.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
      {quiet && <p className="muted">A quiet spell. Prices drifted a little and nothing big happened.</p>}
      <button className="primary" onClick={onClose}>Back to the market</button>
    </Modal>
  );
}
