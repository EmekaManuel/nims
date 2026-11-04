import { useState } from 'react';
import type { GameState, Item, MarketId } from './api';
import { coins } from './api';
import { ItemIcon } from './icons';
import { Field, NumberField } from './ui';
import type { Actions } from './Panels';

/** Open-your-own-stall offer. Shown inside My business, and on its own when you click a free plot. */
export function StallOffer({ state, act, focus }: { state: GameState; act: Actions; focus?: MarketId }) {
  const offer = state.business.stallOffer;
  if (!offer) return null;
  return (
    <div className="offer">
      <h3>Open your own stall · {coins(offer.cost)}</h3>
      <p className="small muted">
        Set your own prices and stock your shelves. Town customers shop with you, and the merchants in your market trade with you too: they’ll buy from you when you undercut them, and sell you their surplus when you pay well.
      </p>
      <div className="mk">
        {offer.markets.map((m) => (
          <button key={m.id} className={m.id === focus ? 'primary' : ''} disabled={!m.free || state.you.cash < offer.cost} onClick={() => act.openStall(m.id)} title={m.free ? '' : 'No free plot left'}>
            {m.name}{!m.free && ' (full)'}
          </button>
        ))}
      </div>
      {state.you.cash < offer.cost && <p className="small muted">You need {coins(offer.cost - state.you.cash)} more.</p>}
    </div>
  );
}

function Manager({ state, act }: { state: GameState; act: Actions }) {
  const stall = state.business.stall!;
  const [draft, setDraft] = useState<Record<string, { buy: number; sell: number }>>(() => Object.fromEntries(stall.items.map((i) => [i.item, { buy: i.buy, sell: i.sell }])));
  const [qty, setQty] = useState(5);
  const [cash, setCash] = useState(1000);
  const edit = (item: Item, k: 'buy' | 'sell', v: number) => setDraft((d) => ({ ...d, [item]: { ...d[item], [k]: v } }));
  return (
    <div className="manager">
      <div className="till">
        <span><span className="k">Till</span><b>{coins(stall.till)}</b></span>
        <Field label="Coins" htmlFor="till-amount"><NumberField id="till-amount" aria-label="Amount for the till" min={1} max={1_000_000} step={100} value={cash} onValueChange={setCash} /></Field>
        <button disabled={state.you.cash < cash} onClick={() => act.stallDeposit(cash)}>Put in</button>
        <button disabled={stall.till < cash} onClick={() => act.stallWithdraw(cash)}>Take out</button>
      </div>
      <p className="small muted">Your till is what your stall uses to buy. Without cash it can’t buy from anyone.</p>
      <Field label="Shelf moves" htmlFor="shelf-qty" className="shelfqty"><NumberField id="shelf-qty" aria-label="Units to move" min={1} max={500} value={qty} onValueChange={setQty} /></Field>
      <div className="tablewrap">
        <table className="offers">
          <thead><tr><th>Item</th><th>I pay</th><th>I charge</th><th>Shelf</th></tr></thead>
          <tbody>
            {stall.items.map((i) => {
              const d = draft[i.item] ?? { buy: i.buy, sell: i.sell };
              const changed = d.buy !== i.buy || d.sell !== i.sell;
              return (
                <tr key={i.item}>
                  <td><span className="itemcell"><ItemIcon item={i.item} size={28} /><span><b>{i.item}</b><span className="muted carry">usual {coins(i.base)} · {i.min}–{i.max}</span></span></span></td>
                  <td><NumberField aria-label={`Price I pay for ${i.item}`} min={i.min} max={i.max} step={5} steppers={false} value={d.buy} onValueChange={(n) => edit(i.item, 'buy', n)} /></td>
                  <td>
                    <NumberField aria-label={`Price I charge for ${i.item}`} min={i.min} max={i.max} step={5} steppers={false} value={d.sell} onValueChange={(n) => edit(i.item, 'sell', n)} />
                    <button disabled={!changed} onClick={() => act.stallPrice(i.item, d.buy, d.sell)}>Set</button>
                  </td>
                  <td className="btns">
                    <b>{i.stock}</b>
                    <button disabled={i.carrying < 1} onClick={() => act.stallStock(i.item, Math.min(qty, i.carrying))} title={`You carry ${i.carrying}`}>+ Stock</button>
                    <button disabled={i.stock < 1} onClick={() => act.stallTake(i.item, Math.min(qty, i.stock))}>Take</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BusinessPanel({ state, act, onFocus }: { state: GameState; act: Actions; onFocus: (id: string) => void }) {
  const b = state.business;
  const total = b.shares.reduce((a, s) => a + s.value, 0);
  return (
    <section className="panel ledger" aria-labelledby="biz-h">
      <h2 id="biz-h">My business</h2>

      <h3>My stall</h3>
      {b.stall ? <Manager key={b.stall.id} state={state} act={act} /> : <StallOffer state={state} act={act} />}

      <h3>My shares</h3>
      {b.shares.length === 0 ? (
        <p className="muted small">You don’t own a piece of anyone yet. Open a merchant’s stall and look for <b>Own a piece</b>. Shareholders are paid every evening.</p>
      ) : (
        <>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Merchant</th><th>Shares</th><th>Worth</th></tr></thead>
              <tbody>
                {b.shares.map((s) => (
                  <tr key={s.id}>
                    <td><button className="link" onClick={() => onFocus(s.id)}>{s.name}</button>{s.state !== 'open' && <span className="muted small"> · {s.state === 'closed' ? 'closed' : 'low on cash'}</span>}</td>
                    <td>{s.shares}</td>
                    <td>{coins(s.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Total {coins(total)} · paid out every evening from each merchant’s profit.</p>
        </>
      )}

      <h3>What’s happened</h3>
      {b.notes.length === 0 ? (
        <p className="muted small">Nothing yet. Dividends, stall sales and fund news will show up here, even while you’re away.</p>
      ) : (
        <ul className="notes">
          {b.notes.map((n, i) => <li key={i}><span className="muted">Day {Math.floor(n.hour / 24) + 1}, {String(n.hour % 24).padStart(2, '0')}:00</span> {n.text}</li>)}
        </ul>
      )}
    </section>
  );
}
