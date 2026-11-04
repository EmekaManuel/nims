import type { GameState, Item, MarketId } from './api';
import { naira } from './api';
import { ItemIcon } from './icons';

/** Each item's price in every market, against its usual price. Arrows and words back up the colour. */
export function PriceBoard({ state }: { state: GameState }) {
  const items = [...new Set(state.board.map((b) => b.item))] as Item[];
  const cell = (market: MarketId, item: Item) => state.board.find((b) => b.market === market && b.item === item);
  return (
    <section className="chalk" aria-labelledby="board-h">
      <h2 id="board-h">Price board</h2>
      <div className="tablewrap">
      <table className="board">
        <thead>
          <tr><th></th>{state.markets.map((m) => <th key={m.id}>{m.name}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item}>
              <th scope="row"><span className="itemcell"><ItemIcon item={item} size={22} /> {item}</span></th>
              {state.markets.map((m) => {
                const c = cell(m.id, item);
                if (!c) return <td key={m.id} className="na">—</td>;
                if (c.price === null) return <td key={m.id} className="na">closed</td>;
                const pct = Math.round((c.price / c.base - 1) * 100);
                const kind = pct <= -10 ? 'low' : pct >= 10 ? 'high' : 'fair';
                const word = kind === 'low' ? 'cheap here' : kind === 'high' ? 'dear here' : 'about usual';
                return (
                  <td key={m.id} className={kind} title={`${word}: usual price ${naira(c.base)}`}>
                    <b>{naira(c.price)}</b>
                    <span className="delta">{kind === 'low' ? '▼' : kind === 'high' ? '▲' : '•'} {pct > 0 ? '+' : ''}{pct}%</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="legend">
        <span className="chip high">▲ dear: sell here</span> <span className="chip low">▼ cheap: buy here</span> <span className="chip fair">• about usual</span>
      </p>
    </section>
  );
}
