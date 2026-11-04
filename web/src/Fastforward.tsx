import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fastForward, FastForward, FastForwardParams } from './api';
import { CashChart, cashTable, DataTable, Figure, LineKey, PriceChart, priceTable, Sync } from './Charts';
import { Glyph } from './icons';
import { Checkbox, Field, NumberField, Select, Slider } from './ui';
import { dayOf, itemColor, coins, SHOCK_LABEL, STATUS, when } from './viz';

const MARKET_NAME = { produce: 'Produce Market', fabric: 'Fabric Market', scrap: 'Scrap & Hardware' } as const;
const DEFAULTS: FastForwardParams = { days: 7, seed: 1, gatherers: 3, arbitrageur: true, investor: true, flooder: true };
/** Playback speed at 1x: a week (168 hours) takes about 12 seconds. */
const HOURS_PER_SECOND = 168 / 12;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function FastForwardPage() {
  const [params, setParams] = useState<FastForwardParams>(DEFAULTS);
  const [data, setData] = useState<FastForward | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const pos = useRef(0); // fractional hour, so playback is smooth at any speed

  const run = useCallback(async (p: FastForwardParams) => {
    setLoading(true);
    setError('');
    try {
      const d = await fastForward(p);
      setData(d);
      pos.current = 0;
      setHover(null);
      if (reducedMotion()) { setCursor(d.hours - 1); setPlaying(false); }
      else { setCursor(0); setPlaying(true); }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // The page opens already running, so it is never an empty shell.
  useEffect(() => { void run(DEFAULTS); }, [run]);

  useEffect(() => {
    if (!playing || !data) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      pos.current = Math.min(data.hours - 1, pos.current + dt * speed * HOURS_PER_SECOND);
      setCursor(Math.floor(pos.current));
      if (pos.current >= data.hours - 1) return setPlaying(false);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, data, speed]);

  const sync: Sync | null = data ? { hover, setHover, cursor, hours: data.hours } : null;
  const set = <K extends keyof FastForwardParams>(k: K, v: FastForwardParams[K]) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <main className="ff viz" aria-busy={loading}>
      <header className="ffhead">
        <div>
          <h1>A week in the market</h1>
          <p className="lede">The same economy as the game, run on its own for {params.days} days. Merchants set prices with <code>pricing.ts</code>; simulated traders gather, haggle, flood and invest.</p>
        </div>
        <a className="backlink" href="#">← Back to the game</a>
      </header>

      <section className="ffbar" aria-label="Choose who takes part">
        <button className="primary" onClick={() => void run(params)} disabled={loading}>{loading ? 'Running…' : `Fast-forward ${params.days === 7 ? 'a week' : `${params.days} days`}`}</button>
        <Field label="Days" htmlFor="ff-days">
          <Select id="ff-days" value={String(params.days)} onValueChange={(v) => set('days', Number(v))} options={[3, 7, 14].map((d) => ({ value: String(d), label: String(d) }))} />
        </Field>
        <Field label="Gatherers" htmlFor="ff-gatherers">
          <NumberField id="ff-gatherers" aria-label="Gatherers" value={params.gatherers} min={0} max={6} onValueChange={(n) => set('gatherers', n)} />
        </Field>
        <Checkbox id="ff-arb" checked={params.arbitrageur} onCheckedChange={(v) => set('arbitrageur', v)} title="Buys cheap in one stall and sells dear in another">Arbitrageur</Checkbox>
        <Checkbox id="ff-inv" checked={params.investor} onCheckedChange={(v) => set('investor', v)} title="Holds shares in every market and puts money into community funds">Investor</Checkbox>
        <Checkbox id="ff-flood" checked={params.flooder} onCheckedChange={(v) => set('flooder', v)} title="Dumps iron on the market whatever the price">Market flooder</Checkbox>
        <Field label="Town" htmlFor="ff-seed">
          <NumberField id="ff-seed" aria-label="Town" value={params.seed} min={0} max={999999} steppers={false} onValueChange={(n) => set('seed', n)} className="wide" />
        </Field>
        <button onClick={() => { const next = { ...params, seed: Math.floor(Math.random() * 100000) }; setParams(next); void run(next); }} disabled={loading} title="A different random run of the same town">New town</button>
      </section>
      {error && <p className="note warn" role="alert">{error}</p>}

      {data && sync && (
        <div className="ffbody" style={{ opacity: loading ? 0.55 : 1 }}>
          <section className="panel highlights" aria-label="What stood out">
            <h2>What stood out</h2>
            <ul>{data.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
          </section>

          <div className="playbar" role="group" aria-label="Playback">
            <button onClick={() => { if (cursor >= data.hours - 1) { pos.current = 0; setCursor(0); } setPlaying((p) => !p); }}>{playing ? 'Pause' : cursor >= data.hours - 1 ? 'Replay' : 'Play'}</button>
            <div className="grow">
              <Slider id="ff-scrub" aria-label="Time" valueText={when(cursor)} value={cursor} min={0} max={data.hours - 1} onValueChange={(v) => { pos.current = v; setCursor(v); setPlaying(false); }} />
            </div>
            <output className="clock" aria-live="off">{when(cursor)}</output>
            <Field label="Speed" htmlFor="ff-speed">
              <Select id="ff-speed" value={String(speed)} onValueChange={(v) => setSpeed(Number(v))} options={[0.5, 1, 2, 4].map((s) => ({ value: String(s), label: `${s}×` }))} />
            </Field>
          </div>

          <Prices data={data} sync={sync} />
          <Shops data={data} sync={sync} />

          <div className="two">
            <Players data={data} cursor={cursor} />
            <Happenings data={data} cursor={cursor} />
          </div>
          <p className="muted small">Prices are the average of the merchants in each market. Press Show table under any chart to read the numbers.</p>
        </div>
      )}
      {!data && !error && <p className="muted">Starting the market…</p>}
    </main>
  );
}

function Prices({ data, sync }: { data: FastForward; sync: Sync }) {
  const markets = (['produce', 'fabric', 'scrap'] as const).map((id) => ({ id, items: data.items.filter((i) => i.market === id) }));
  // One shared axis across all three markets so they can be compared at a glance.
  const all = data.items.flatMap((i) => data.prices[i.item].map((v) => (v / i.base) * 100));
  const lo = Math.min(100, Math.floor(Math.min(...all) / 20) * 20);
  const hi = Math.max(100, Math.ceil(Math.max(...all) / 20) * 20);
  return (
    <section aria-labelledby="ff-prices">
      <h2 id="ff-prices">Prices against the usual price</h2>
      <p className="muted small">100% is the usual price. Below it, goods are cheap or flooded; above it, they’re scarce or in demand. Shaded stretches are shocks. Hover, or use the arrow keys, to read any hour.</p>
      <div className="grid3">
        {markets.map(({ id, items }) => {
          const series = items.map((i) => ({ key: i.item, label: i.item, color: itemColor(i.item), base: i.base, values: data.prices[i.item] }));
          const t = priceTable(series, sync.cursor);
          return (
            <Figure key={id} title={MARKET_NAME[id]} legend={series.map((s) => <LineKey key={s.key} color={s.color}>{s.label}</LineKey>)}
              chart={<PriceChart series={series} sync={sync} shocks={data.shocks} yDomain={[lo, hi]} />}
              table={<DataTable caption={`${MARKET_NAME[id]} prices`} columns={t.columns} rows={t.rows} />} />
          );
        })}
      </div>
      <p className="keyline small muted"><span className="band-swatch" aria-hidden="true" /> a shock was on · {Object.values(SHOCK_LABEL).join(', ')}</p>
    </section>
  );
}

function Shops({ data, sync }: { data: FastForward; sync: Sync }) {
  return (
    <section aria-labelledby="ff-shops">
      <h2 id="ff-shops">How much cash each shop holds (in coins)</h2>
      <p className="muted small">Each shop has its own scale. A shop with no cash and nothing to sell closes; a community fund can reopen it.</p>
      <div className="grid4">
        {data.merchants.map((m) => {
          const closures = data.closures.filter((c) => c.merchant === m.id).map((c) => c.hour);
          const revivals = data.revivals.filter((c) => c.merchant === m.id).map((c) => c.hour);
          const t = cashTable(m.name, data.cash[m.id], sync.cursor, closures, revivals);
          return (
            <Figure key={m.id} title={m.name} sub={MARKET_NAME[m.market]}
              chart={<CashChart name={m.name} values={data.cash[m.id]} sync={sync} closures={closures} revivals={revivals} color={itemColor('tomatoes')} />}
              table={<DataTable caption={`${m.name} cash`} columns={t.columns} rows={t.rows} />} />
          );
        })}
      </div>
      <p className="keyline small muted">
        <span className="evt-key" style={{ background: STATUS.critical }} aria-hidden="true">✕</span> Closed ·{' '}
        <span className="evt-key" style={{ background: STATUS.good }} aria-hidden="true">✓</span> Reopened by a community fund
      </p>
    </section>
  );
}

function Players({ data, cursor }: { data: FastForward; cursor: number }) {
  const rows = useMemo(() => data.players.map((p) => ({ ...p, now: p.worth[cursor] })).sort((a, b) => b.now - a.now), [data, cursor]);
  return (
    <section className="panel" aria-labelledby="ff-players">
      <h2 id="ff-players">The traders</h2>
      {rows.length === 0 ? <p className="muted">No traders in this run. Add some above.</p> : (
        <div className="tablewrap">
          <table className="vtable">
            <thead><tr><th scope="col">Trader</th><th scope="col">Started</th><th scope="col">Now</th><th scope="col">Change</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const change = ((p.now - p.start) / Math.max(1, p.start)) * 100;
                const up = change >= 0;
                return (
                  <tr key={p.id}>
                    <th scope="row">{p.label}</th>
                    <td>{coins(p.start)}</td>
                    <td><b>{coins(p.now)}</b></td>
                    <td className={up ? 'delta-up' : 'delta-down'}>{up ? '▲' : '▼'} {up ? '+' : '−'}{Math.abs(Math.round(change))}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Net worth: cash, goods carried and shares.</p>
    </section>
  );
}

type Happening = { hour: number; kind: 'shock' | 'closed' | 'reopened' | 'dividend'; text: string };

function Happenings({ data, cursor }: { data: FastForward; cursor: number }) {
  const name = (id: string) => data.merchants.find((m) => m.id === id)?.name ?? id;
  const all = useMemo(() => {
    const list: Happening[] = [
      ...data.shocks.map((s) => ({ hour: s.start, kind: 'shock' as const, text: `${SHOCK_LABEL[s.kind] ?? s.kind} for ${s.end - s.start} hours` })),
      ...data.closures.map((c) => ({ hour: c.hour, kind: 'closed' as const, text: `${name(c.merchant)} ran out of cash and stock` })),
      ...data.revivals.map((c) => ({ hour: c.hour, kind: 'reopened' as const, text: `${name(c.merchant)} reopened thanks to a community fund` })),
    ];
    // Dividends arrive every evening from several shops: say it once a day.
    const byDay = new Map<number, { total: number; shops: Set<string> }>();
    for (const d of data.dividends) {
      const e = byDay.get(dayOf(d.hour)) ?? { total: 0, shops: new Set<string>() };
      e.total += d.amount; e.shops.add(d.merchant);
      byDay.set(dayOf(d.hour), e);
    }
    for (const [day, e] of byDay) list.push({ hour: day * 24 - 1, kind: 'dividend', text: `Shareholders were paid ${coins(e.total)} by ${e.shops.size} ${e.shops.size === 1 ? 'shop' : 'shops'}` });
    return list.sort((a, b) => b.hour - a.hour);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const shown = all.filter((h) => h.hour <= cursor);
  return (
    <section className="panel" aria-labelledby="ff-happen">
      <h2 id="ff-happen">What happened</h2>
      {shown.length === 0 ? <p className="muted">Nothing yet. Press play.</p> : (
        <ul className="happen">
          {shown.map((h, i) => (
            <li key={i}>
              <span className="muted">{when(h.hour)}</span>
              <span className="h-text">
                {h.kind === 'closed' && <span className="evt-key" style={{ background: STATUS.critical }} aria-hidden="true">✕</span>}
                {h.kind === 'reopened' && <span className="evt-key" style={{ background: STATUS.good }} aria-hidden="true">✓</span>}
                {h.kind === 'shock' && <span className="shock-key" aria-hidden="true">◆</span>}
                {h.kind === 'dividend' && <span className="shock-key" aria-hidden="true"><Glyph name="coin" size={14} /></span>}
                {h.kind === 'closed' && <b>Closed: </b>}
                {h.kind === 'reopened' && <b>Reopened: </b>}
                {h.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
