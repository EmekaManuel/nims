import { useState } from 'react';
import type { GameState, Item, MarketId, Stall } from './api';
import { naira } from './api';
import { Tip } from './Tip';
import { ItemIcon } from './icons';

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
  buyShares: (merchant: string, shares: number) => void;
  sellShares: (merchant: string, shares: number) => void;
  contribute: (merchant: string, amount: number) => void;
  openStall: (market: MarketId) => void;
  stallStock: (item: Item, units: number) => void;
  stallTake: (item: Item, units: number) => void;
  stallPrice: (item: Item, buy: number, sell: number) => void;
  stallDeposit: (amount: number) => void;
  stallWithdraw: (amount: number) => void;
  ack: () => void;
}

function AjoSection({ stall, cash, act }: { stall: Stall; cash: number; act: Actions }) {
  const [amount, setAmount] = useState(1000);
  const pool = stall.ajo?.pool ?? 0;
  const goal = stall.ajo?.goal ?? 1;
  const remaining = Math.max(0, goal - pool);
  return (
    <div className="ajo">
      <p className="note warn">
        <b>{stall.name} has closed</b>: no cash and nothing to sell. Neighbours can reopen it together with an <b>ajo</b> pool. Everyone who chips in becomes a part-owner, and their name goes on the sign.
      </p>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.round(pool)} aria-label="Ajo pool">
        <i style={{ width: `${Math.max(2, (pool / goal) * 100)}%` }} />
      </div>
      <p className="small"><b>{naira(pool)}</b> of {naira(goal)} in the pool{stall.ajo && stall.ajo.contributors.length > 0 && <> · so far: {stall.ajo.contributors.map((c) => `${c.name} ${naira(c.put)}`).join(', ')}</>}</p>
      <div className="controls">
        <label>Put in <input type="number" min={100} step={100} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))} /></label>
        <button className="primary" disabled={cash < 100 || amount < 100} onClick={() => act.contribute(stall.id, amount)}>Put in {naira(amount)}</button>
        <button disabled={cash < 100} onClick={() => act.contribute(stall.id, Math.min(remaining, Math.floor(cash)))} title="Everything left in the pool, or all you have">Fill the pool</button>
      </div>
    </div>
  );
}

function InvestSection({ stall, cash, act }: { stall: Stall; cash: number; act: Actions }) {
  const [n, setN] = useState(5);
  const sh = stall.shares!;
  return (
    <div className="invest">
      <h3>Own a piece</h3>
      <p className="small muted">Each evening {stall.name} pays shareholders <b>30% of the day’s profit</b>, split by shares. Your money also goes into their till, which helps if they’re short.</p>
      <p><b>{naira(sh.price)}</b> a share · you hold <b>{sh.yours}</b> · {sh.left} left to buy</p>
      <div className="controls">
        <label>Shares <input type="number" min={1} max={49} value={n} onChange={(e) => setN(Math.max(1, Math.floor(Number(e.target.value)) || 1))} /></label>
        <button className="primary" disabled={cash < sh.price * n || sh.left < n} onClick={() => act.buyShares(stall.id, n)}>Buy · {naira(sh.price * n)}</button>
        <button disabled={sh.yours < n} onClick={() => act.sellShares(stall.id, n)}>Sell</button>
      </div>
    </div>
  );
}

export function StallPanel({ stall, state, act }: { stall: Stall; state: GameState; act: Actions }) {
  const [qty, setQty] = useState(5);
  const [haggle, setHaggle] = useState(false);
  const carrying = (item: Item) => state.you.inventory.find((i) => i.item === item)?.units ?? 0;
  const fare = state.you.at && state.you.at !== stall.market ? state.you.carrying * state.faresPerUnit : 0;
  const mine = stall.owner?.mine === true;

  return (
    <section className="panel ledger" aria-labelledby="stall-h">
      <h2 id="stall-h">{stall.name}</h2>
      <p className="muted">
        {mine ? 'This is your stall. Set prices and stock it from My business below.' : stall.owner ? `Run by ${stall.owner.name}. They set their own prices.` : BLURB[stall.personality]}
      </p>
      {stall.sign.length > 0 && <p className="signline">★ Reopened by the ajo: <b>{stall.sign.join(', ')}</b></p>}

      {stall.state === 'closed' ? (
        <AjoSection stall={stall} cash={state.you.cash} act={act} />
      ) : mine ? null : (
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

          <div className="tablewrap">
          <table className="offers">
            <thead>
              <tr><th>Item</th><th>They pay you</th><th>They charge you</th><th></th></tr>
            </thead>
            <tbody>
              {stall.offers.map((o) => {
                const have = carrying(o.item);
                return (
                  <tr key={o.item}>
                    <td><span className="itemcell"><ItemIcon item={o.item} size={30} /><span><b>{o.item}</b><span className="muted carry">{o.stock} in stock{have > 0 ? ` · you carry ${have}` : ''}</span></span></span></td>
                    <td>{o.willBuy ? <Tip who={stall.name} text={o.why}><span className="price">{naira(o.buyPrice)}</span></Tip> : <Tip who={stall.name} text={o.why}><span className="price off">not buying</span></Tip>}{o.bestPay && <span className="star">★ best in town</span>}</td>
                    <td>{o.willSell ? <Tip who={stall.name} text={o.why}><span className="price">{naira(o.sellPrice)}</span></Tip> : <span className="price off">sold out</span>}{o.bestCharge && <span className="star">★ cheapest</span>}</td>
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
          </div>
          <p className="muted small">Hover, focus or tap a price to hear why they’re offering it.</p>
          {stall.shares && !stall.owner && <InvestSection stall={stall} cash={state.you.cash} act={act} />}
        </>
      )}
    </section>
  );
}

export function SourcePanel({ item, state, act }: { item: Item; state: GameState; act: Actions }) {
  const src = state.sources.find((s) => s.item === item)!;
  const full = state.you.carrying >= state.you.capacity;
  return (
    <section className="panel ledger" aria-labelledby="src-h">
      <h2 id="src-h">{src.label}</h2>
      <p className="muted">
        {src.cost > 0 ? `The wholesaler sells at a fixed ₦${src.cost} a unit — a steady price anchor.` : 'Free to collect. It refills over time, and other traders are collecting too.'}
      </p>
      {state.gatherSpeed < 1 && <p className="note warn">Rain is slowing everyone down: you’ll collect half as much.</p>}
      <p>
        <b>{src.units}</b> available · you can carry <b>{state.you.capacity - state.you.carrying}</b> more
      </p>
      <button className="primary" disabled={full || src.units < 1} onClick={() => act.gather(item)}>
        {full ? 'Your vehicle is full' : `Collect ${item}`}
      </button>
    </section>
  );
}
