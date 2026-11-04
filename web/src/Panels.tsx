import { useState } from 'react';
import type { GameState, Item, Stall } from './api';
import { naira } from './api';
import { Tip } from './Tip';

const BLURB = {
  cautious: 'Careful with money. Slow to change her prices.',
  greedy: 'Reacts fast when stock runs short.',
  loyal: 'Looks after regulars — build a name here.',
} as const;

export interface Actions {
  sell: (merchant: string, item: Item, units: number, haggle: boolean) => void;
  buy: (merchant: string, item: Item, units: number, haggle: boolean) => void;
  gather: (item: Item) => void;
  upgrade: (to: string) => void;
}

export function StallPanel({ stall, state, act }: { stall: Stall; state: GameState; act: Actions }) {
  const [qty, setQty] = useState(5);
  const [haggle, setHaggle] = useState(false);
  const carrying = (item: Item) => state.you.inventory.find((i) => i.item === item)?.units ?? 0;
  const fare = state.you.at && state.you.at !== stall.market ? state.you.carrying * state.faresPerUnit : 0;

  return (
    <section className="panel" aria-labelledby="stall-h">
      <h2 id="stall-h">{stall.name}</h2>
      <p className="muted">{BLURB[stall.personality]}</p>

      {stall.state === 'closed' ? (
        <p className="note warn">
          Closed — no cash and nothing to sell. A neighbourhood <b>ajo</b> pool ({naira(stall.ajo?.pool ?? 0)} of {naira(stall.ajo?.goal ?? 0)}) can reopen it, with contributors’ names on the sign.
        </p>
      ) : (
        <>
          {stall.state === 'struggling' && <p className="note warn">Low on cash — {stall.name} has stopped buying until the till recovers ({naira(stall.till)}).</p>}
          {fare > 0 && <p className="note">Walking here with your load costs a fare of <b>{naira(fare)}</b> ({naira(state.faresPerUnit)} a unit).</p>}
          <div className="controls">
            <label>
              Units <input type="number" min={1} max={1000} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className="check">
              <input type="checkbox" checked={haggle} onChange={(e) => setHaggle(e.target.checked)} /> Haggle (once an hour)
            </label>
          </div>

          <table className="offers">
            <thead>
              <tr><th>Item</th><th>They pay you</th><th>They charge you</th><th>Stock</th><th></th></tr>
            </thead>
            <tbody>
              {stall.offers.map((o) => {
                const have = carrying(o.item);
                return (
                  <tr key={o.item}>
                    <td><b>{o.item}</b>{have > 0 && <div className="muted">you carry {have}</div>}</td>
                    <td>{o.willBuy ? <Tip text={o.why}><span className="price">{naira(o.buyPrice)}</span></Tip> : <Tip text={o.why}><span className="price off">not buying</span></Tip>}{o.bestPay && <span className="star">★ best in town</span>}</td>
                    <td>{o.willSell ? <Tip text={o.why}><span className="price">{naira(o.sellPrice)}</span></Tip> : <span className="price off">sold out</span>}{o.bestCharge && <span className="star">★ cheapest</span>}</td>
                    <td>{o.stock}</td>
                    <td className="btns">
                      <button disabled={!o.willBuy || have < 1} onClick={() => act.sell(stall.id, o.item, qty, haggle)}>Sell</button>
                      <button disabled={!o.willBuy || have < 1} onClick={() => act.sell(stall.id, o.item, have, haggle)} title="Sell everything you carry of this">All</button>
                      <button disabled={!o.willSell} onClick={() => act.buy(stall.id, o.item, qty, haggle)}>Buy</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small">Hover, focus or tap a price to hear why they’re offering it.</p>
        </>
      )}
    </section>
  );
}

export function SourcePanel({ item, state, act }: { item: Item; state: GameState; act: Actions }) {
  const src = state.sources.find((s) => s.item === item)!;
  const full = state.you.carrying >= state.you.capacity;
  return (
    <section className="panel" aria-labelledby="src-h">
      <h2 id="src-h">{src.label}</h2>
      <p className="muted">
        {src.cost > 0 ? `The wholesaler sells at a fixed ₦${src.cost} a unit — a steady price anchor.` : 'Free to collect. It refills over time, and other traders are collecting too.'}
      </p>
      {state.gatherSpeed < 1 && <p className="note warn">☔ Rain is slowing everyone down: you’ll collect half as much.</p>}
      <p>
        <b>{src.units}</b> available · you can carry <b>{state.you.capacity - state.you.carrying}</b> more
      </p>
      <button className="primary" disabled={full || src.units < 1} onClick={() => act.gather(item)}>
        {full ? 'Your vehicle is full' : `Collect ${item}`}
      </button>
    </section>
  );
}
