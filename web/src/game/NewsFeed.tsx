import { useEffect, useState } from 'react';
import type { ChainProof, GameState } from '../api';
import { useServices } from '../lib/services';
import { Gazette } from './Gazette';

export function NewsFeed({ state }: { state: GameState }) {
  const services = useServices();
  // Optional proof for the curious. The game never waits for, or depends on, any of this.
  const [proof, setProof] = useState<ChainProof | null>(null);
  useEffect(() => { let live = true; void services.chain().then((p) => live && setProof(p)); return () => { live = false; }; }, []);
  return (
    <section className="panel feed" aria-label="What's happening">
      <Gazette latest={Math.max(-1, ...state.events.map((e) => e.hour))} fetchHeadlines={services.gazette} />
      <h2>Around town</h2>
      {state.events.length === 0 ? <p className="muted">All quiet so far.</p> : (
        <ul>{state.events.map((e, i) => <li key={i}><span className="muted">Day {Math.floor(e.hour / 24) + 1}, {String(e.hour % 24).padStart(2, '0')}:00</span> {e.text}</li>)}</ul>
      )}
      {proof && <p className="small muted">Your goods and coins are real. <a href={proof.explorer} target="_blank" rel="noreferrer">See them on the public ledger →</a></p>}
      <p className="small"><a href="#sim">Watch a whole week of the market unfold →</a></p>
    </section>
  );
}
