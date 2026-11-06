import { useState } from 'react';
import type { GameState, Item, MarketId, Stall } from '../api';
import { api, coins } from '../api';
import { Tip } from './Tip';
import { ItemIcon } from '../art/icons';
import { Checkbox, Field, NumberField, Select } from '../ui';

const BLURB = {
  cautious: 'Careful with money. Slow to change prices.',
  greedy: 'Reacts fast when stock runs short.',
  loyal: 'Looks after regulars — build a name here.',
} as const;

export interface Actions {
  sell: (merchant: string, item: Item, units: number, haggle: boolean) => void;
  buy: (merchant: string, item: Item, units: number, haggle: boolean) => void;
  order: (merchant: string, item: Item, units: number, minPrice: number) => void;
  cancelOrder: (id: number) => void;
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

function FundSection({ stall, cash, act }: { stall: Stall; cash: number; act: Actions }) {
  const [amount, setAmount] = useState(1000);
  const pool = stall.fund?.pool ?? 0;
  const goal = stall.fund?.goal ?? 1;
  const remaining = Math.max(0, goal - pool);
  return (
    <div className="fund">
      <p className="note warn">
        <b>{stall.name} has closed</b>: no cash and nothing to sell. Neighbours can reopen it together by paying into a <b>community fund</b>. Everyone who chips in becomes a part-owner, and their name goes on the sign.
      </p>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.round(pool)} aria-label="Community fund">
        <i style={{ width: `${Math.max(2, (pool / goal) * 100)}%` }} />
      </div>
      <p className="small"><b>{coins(pool)}</b> of {coins(goal)} in the pool{stall.fund && stall.fund.contributors.length > 0 && <> · so far: {stall.fund.contributors.map((c) => `${c.name} ${coins(c.put)}`).join(', ')}</>}</p>
      <div className="controls">
        <Field label="Put in" htmlFor="fund-amount"><NumberField id="fund-amount" aria-label="Amount to put in" min={100} max={1_000_000} step={100} value={amount} onValueChange={setAmount} /></Field>
        <button className="primary" disabled={cash < 100 || amount < 100} onClick={() => act.contribute(stall.id, amount)}>Put in {coins(amount)}</button>
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
      <p><b>{coins(sh.price)}</b> a share · you hold <b>{sh.yours}</b> · {sh.left} left to buy</p>
      <div className="controls">
        <Field label="Shares" htmlFor="shares-qty"><NumberField id="shares-qty" aria-label="Shares to buy or sell" min={1} max={49} value={n} onValueChange={setN} /></Field>
        <button className="primary" disabled={cash < sh.price * n || sh.left < n} onClick={() => act.buyShares(stall.id, n)}>Buy · {coins(sh.price * n)}</button>
        <button disabled={sh.yours < n} onClick={() => act.sellShares(stall.id, n)}>Sell</button>
      </div>
    </div>
  );
}

/** A delivery order: say what you want ("these goods, sold here, for at least this much") and the carriers handle the trip. */
function OrderSection({ stall, state, act }: { stall: Stall; state: GameState; act: Actions }) {
  const sellable = stall.offers;
  const [item, setItem] = useState<Item>(sellable[0]?.item ?? 'iron');
  const offer = stall.offers.find((o) => o.item === item);
  const [units, setUnits] = useState(10);
  const [min, setMin] = useState<number | null>(null);
  const limit = min ?? Math.round((offer?.buyPrice ?? 100) * 1.15);
  const mine = (state.orders ?? []).filter((o) => o.status === 'open');
  const recent = (state.orders ?? []).filter((o) => o.status !== 'open').slice(0, 2);
  return (
    <div className="orders">
      <h3>Send it here when the price is right</h3>
      <p className="small muted">Name the goods and the lowest price you will take. The town’s carriers wait for {stall.name} to pay that, then take your load over and sell it, with the cost of the trip taken from the sale. You can be anywhere.</p>
      <div className="controls">
        <Field label="Goods" htmlFor="order-item">
          <Select id="order-item" aria-label="Goods to send" value={item} onValueChange={(v) => { setItem(v as Item); setMin(null); }} options={sellable.map((o) => ({ value: o.item, label: o.item[0].toUpperCase() + o.item.slice(1) }))} />
        </Field>
        <Field label="Units" htmlFor="order-units"><NumberField id="order-units" aria-label="Units for the order" min={1} max={1000} value={units} onValueChange={setUnits} /></Field>
        <Field label="Lowest price each" htmlFor="order-min"><NumberField id="order-min" aria-label="Lowest price each" min={1} max={100000} value={limit} onValueChange={setMin} /></Field>
        <button className="primary" onClick={() => act.order(stall.id, item, units, limit)}>Place order</button>
      </div>
      {offer && <p className="small muted">Right now they pay {coins(offer.buyPrice)} each.</p>}
      {mine.length > 0 && (
        <ul className="orderlist">
          {mine.map((o) => (
            <li key={o.id}>
              <span>{o.units - o.done} {o.item} → {state.stalls.find((s) => s.id === o.merchantId)?.name ?? o.merchantId} at {coins(o.minPrice)}+ · {Math.max(0, o.expiresHour - state.hour)}h left</span>
              <button onClick={() => act.cancelOrder(o.id)}>Cancel</button>
            </li>
          ))}
        </ul>
      )}
      {recent.map((o) => <p key={o.id} className="small muted">{o.status === 'filled' ? `Delivered ${o.done} ${o.item}, ${coins(o.earned)} before the trip’s cost.` : `Order for ${o.units} ${o.item} ${o.status}.`}</p>)}
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
      {stall.sign.length > 0 && <p className="signline">★ Reopened by the community fund: <b>{stall.sign.join(', ')}</b></p>}

      {stall.state === 'closed' ? (
        <FundSection stall={stall} cash={state.you.cash} act={act} />
      ) : mine ? null : (
        <>
          {stall.state === 'struggling' && <p className="note warn">Low on cash — {stall.name} has stopped buying until the till recovers ({coins(stall.till)}).</p>}
          {fare > 0 && (
            <p className="note">
              Walking here with your load costs a fare of <b>{coins(fare)}</b> ({coins(state.faresPerUnit)} a unit).
              {state.you.cash < fare && <> You don’t have that much, but you can still <b>sell</b> here: the rest of the fare comes out of your sale. (To <b>buy</b> here you’d need the fare in hand.)</>}
            </p>
          )}
          <div className="controls">
            <Field label="Units" htmlFor="units-qty"><NumberField id="units-qty" aria-label="Units" min={1} max={1000} value={qty} onValueChange={setQty} /></Field>
            <Checkbox id="haggle" checked={haggle} onCheckedChange={setHaggle}>Haggle (once an hour)</Checkbox>
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
                    <td>{o.willBuy ? <Tip who={stall.name} text={o.why} voice={stall.owner ? undefined : () => api.voice(stall.id, o.item)}><span className="price">{coins(o.buyPrice)}</span></Tip> : <Tip who={stall.name} text={o.why} voice={stall.owner ? undefined : () => api.voice(stall.id, o.item)}><span className="price off">not buying</span></Tip>}{o.bestPay && <span className="star">★ best in town</span>}</td>
                    <td>{o.willSell ? <Tip who={stall.name} text={o.why} voice={stall.owner ? undefined : () => api.voice(stall.id, o.item)}><span className="price">{coins(o.sellPrice)}</span></Tip> : <span className="price off">sold out</span>}{o.bestCharge && <span className="star">★ cheapest</span>}</td>
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
          {!stall.owner && <OrderSection stall={stall} state={state} act={act} />}
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
        {src.item === 'cotton'
          ? `The wholesaler sells at a fixed ${src.cost} coins a unit: a steady price anchor.`
          : `Sold at the wholesale price, ${src.cost} coins a unit. The supply refills slowly, and other traders are buying here too, so the profit is in where you sell it.`}
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
