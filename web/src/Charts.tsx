import { useId, useRef, useState } from 'react';
import { clock, compactNaira, dayOf, linear, linePath, naira, niceTicks, SHOCK_LABEL, STATUS, when } from './viz';

/** One shared crosshair: hover or arrow-key in any chart and all of them show the same hour. */
export interface Sync {
  hover: number | null;
  setHover: (h: number | null) => void;
  /** Hours played so far. The future is not drawn yet. */
  cursor: number;
  hours: number;
}

export interface Shock { kind: string; start: number; end: number }

const KEY_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageDown: -12, PageUp: 12 };

/** Pointer and keyboard -> hour. Shared by every chart so they behave alike. */
function useScrub(sync: Sync, x0: number, x1: number, W: number) {
  const ref = useRef<SVGSVGElement>(null);
  // The crosshair is shared by every chart, but only the chart you are pointing at or focused on opens its tooltip.
  const [active, setActive] = useState(false);
  const hourAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const f = (px - x0) / (x1 - x0);
    return Math.max(0, Math.min(sync.cursor, Math.round(f * (sync.hours - 1))));
  };
  return {
    ref,
    active,
    onPointerMove: (e: React.PointerEvent) => { setActive(true); sync.setHover(hourAt(e.clientX)); },
    onPointerLeave: () => { setActive(false); sync.setHover(null); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') return sync.setHover(null);
      if (e.key === 'Home') return sync.setHover(0), e.preventDefault();
      if (e.key === 'End') return sync.setHover(sync.cursor), e.preventDefault();
      const d = KEY_STEP[e.key];
      if (d === undefined) return;
      e.preventDefault();
      sync.setHover(Math.max(0, Math.min(sync.cursor, (sync.hover ?? sync.cursor) + d)));
    },
    onFocus: () => { setActive(true); if (sync.hover === null) sync.setHover(sync.cursor); },
    onBlur: () => { setActive(false); sync.setHover(null); },
  };
}

/** A line key (short stroke in the series colour) beside a name in text ink. Identity never rests on colour alone. */
export function LineKey({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="linekey">
      <svg width="20" height="8" aria-hidden="true"><line x1="1" y1="4" x2="19" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>
      {children}
    </span>
  );
}

export function DataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="vtable-wrap">
      <table className="vtable">
        <caption>{caption}</caption>
        <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => (j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j}>{v}</td>))}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Chart-or-table container: every chart has its table twin one click away. */
export function Figure({ title, sub, legend, chart, table }: { title: string; sub?: string; legend?: React.ReactNode; chart: React.ReactNode; table: React.ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <figure className="facet">
      <figcaption>
        <div className="facet-head">
          <h3 id={id}>{title}</h3>
          <button className="link small" aria-pressed={asTable} onClick={() => setAsTable((t) => !t)}>{asTable ? 'Show chart' : 'Show table'}</button>
        </div>
        {sub && <p className="muted small">{sub}</p>}
        {legend && <div className="legend-row">{legend}</div>}
      </figcaption>
      {asTable ? table : chart}
    </figure>
  );
}

// -------------------------------------------------------------------------------------------------
// Price over time: each good as a share of its usual price (100 = usual), one axis for every good.
// -------------------------------------------------------------------------------------------------

export interface PriceSeries { key: string; label: string; color: string; base: number; values: number[] }

const PW = 380, PH = 250;
const PM = { l: 46, r: 74, t: 14, b: 30 };

export function PriceChart({ series, sync, shocks, yDomain }: { series: PriceSeries[]; sync: Sync; shocks: Shock[]; yDomain: [number, number] }) {
  const { hours, cursor, hover } = sync;
  const x = linear(0, hours - 1, PM.l, PW - PM.r);
  const y = linear(yDomain[0], yDomain[1], PH - PM.b, PM.t);
  const pct = (s: PriceSeries, i: number) => (s.values[i] / s.base) * 100;
  const scrub = useScrub(sync, PM.l, PW - PM.r, PW);
  const yTicks = niceTicks(yDomain[0], yDomain[1], 5);
  const dayStep = hours > 24 * 8 ? 2 : 1;
  const days = Array.from({ length: Math.ceil(hours / 24) }, (_, d) => d).filter((d) => d % dayStep === 0);
  const at = hover ?? null;

  // Direct end-labels only while they can be read; otherwise the legend and the tooltip carry identity.
  const ends = series.map((s) => ({ s, py: y(pct(s, cursor)) })).sort((a, b) => a.py - b.py);
  const labelsFit = ends.every((e, i) => i === 0 || e.py - ends[i - 1].py >= 14);
  const summary = series.map((s) => `${s.label} ${Math.round(pct(s, cursor))}% of its usual price`).join(', ');
  const activeShocks = at === null ? [] : shocks.filter((s) => at >= s.start && at < s.end);

  return (
    <div className="plot" tabIndex={0} role="group" aria-label={`Price chart. Use the arrow keys to move through time. Now: ${summary}.`} onKeyDown={scrub.onKeyDown} onFocus={scrub.onFocus} onBlur={scrub.onBlur}>
      <svg ref={scrub.ref} viewBox={`0 0 ${PW} ${PH}`} className="chart" onPointerMove={scrub.onPointerMove} onPointerLeave={scrub.onPointerLeave} aria-hidden="true">
        {shocks.filter((s) => s.start <= cursor).map((s, i) => (
          <rect key={i} className="shock-band" x={x(s.start)} width={Math.max(1, x(Math.min(s.end, cursor)) - x(s.start))} y={PM.t} height={PH - PM.b - PM.t} />
        ))}
        {yTicks.map((t) => (
          <g key={t}>
            <line className={t === 100 ? 'axis-line' : 'grid-line'} x1={PM.l} x2={PW - PM.r} y1={y(t)} y2={y(t)} />
            <text className="tick" x={PM.l - 6} y={y(t) + 4} textAnchor="end">{t}%</text>
          </g>
        ))}
        <text className="tick" x={PW - PM.r + 6} y={y(100) - 5}>usual</text>
        {days.map((d) => (
          <text key={d} className="tick" x={x(Math.min(d * 24, hours - 1))} y={PH - 10} textAnchor="middle">D{d + 1}</text>
        ))}
        {series.map((s) => <path key={s.key} d={linePath(s.values.map((v) => (v / s.base) * 100), x, y, cursor)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
        {at !== null && <line className="crosshair" x1={x(at)} x2={x(at)} y1={PM.t} y2={PH - PM.b} />}
        {series.map((s) => {
          const i = at ?? cursor;
          return <circle key={s.key} cx={x(i)} cy={y(pct(s, i))} r="4" fill={s.color} className="dot" />;
        })}
        {at === null && labelsFit && ends.map(({ s, py }) => <text key={s.key} className="endlabel" x={x(cursor) + 9} y={py + 4}>{s.label}</text>)}
      </svg>
      {at !== null && scrub.active && (
        <div className="tip" style={{ left: `${(x(at) / PW) * 100}%` }} data-flip={x(at) > PW * 0.62 ? 'left' : 'right'} role="status">
          <div className="tip-when">{when(at)}</div>
          {series.map((s) => (
            <div key={s.key} className="tip-row">
              <LineKey color={s.color}><span className="tip-name">{s.label}</span></LineKey>
              <b>{naira(s.values[at])}</b>
              <span className="tip-pct">{Math.round(pct(s, at))}% of usual</span>
            </div>
          ))}
          {activeShocks.map((s, i) => <div key={i} className="tip-note">◆ {SHOCK_LABEL[s.kind] ?? s.kind} is on</div>)}
        </div>
      )}
    </div>
  );
}

export function priceTable(series: PriceSeries[], cursor: number): { columns: string[]; rows: (string | number)[][] } {
  const rows: (string | number)[][] = [];
  for (let h = 0; h <= cursor; h += 12) rows.push([when(h), ...series.map((s) => `${naira(s.values[h])} (${Math.round((s.values[h] / s.base) * 100)}%)`)]);
  return { columns: ['Time', ...series.map((s) => s.label)], rows };
}

// -------------------------------------------------------------------------------------------------
// A shop's cash over time. One shop per chart, so one colour; each has its own scale.
// -------------------------------------------------------------------------------------------------

const CW = 300, CH = 128;
const CM = { l: 44, r: 8, t: 12, b: 22 };

export function CashChart({ name, values, sync, closures, revivals, color }: { name: string; values: number[]; sync: Sync; closures: number[]; revivals: number[]; color: string }) {
  const { hours, cursor, hover } = sync;
  const max = Math.max(1, ...values.slice(0, cursor + 1));
  const top = niceTicks(0, max, 2).slice(-1)[0] || max;
  const x = linear(0, hours - 1, CM.l, CW - CM.r);
  const y = linear(0, Math.max(top, 1), CH - CM.b, CM.t);
  const scrub = useScrub(sync, CM.l, CW - CM.r, CW);
  const at = hover;
  const line = linePath(values, x, y, cursor);
  const area = `${line}L${x(cursor).toFixed(1)} ${y(0)}L${x(0)} ${y(0)}Z`;
  const closed = closures.filter((h) => h <= cursor);
  const reopened = revivals.filter((h) => h <= cursor);
  const eventAt = at === null ? null : closures.includes(at) ? 'closed' : revivals.includes(at) ? 'reopened' : null;

  return (
    <div className="plot" tabIndex={0} role="group" aria-label={`${name}: cash over time. Now ${naira(values[cursor])}. ${closed.length ? `Closed ${closed.length} time${closed.length > 1 ? 's' : ''}.` : ''}`} onKeyDown={scrub.onKeyDown} onFocus={scrub.onFocus} onBlur={scrub.onBlur}>
      <svg ref={scrub.ref} viewBox={`0 0 ${CW} ${CH}`} className="chart" onPointerMove={scrub.onPointerMove} onPointerLeave={scrub.onPointerLeave} aria-hidden="true">
        <line className="grid-line" x1={CM.l} x2={CW - CM.r} y1={y(top)} y2={y(top)} />
        <line className="axis-line" x1={CM.l} x2={CW - CM.r} y1={y(0)} y2={y(0)} />
        <text className="tick" x={CM.l - 6} y={y(top) + 4} textAnchor="end">{compactNaira(top)}</text>
        <text className="tick" x={CM.l - 6} y={y(0) + 4} textAnchor="end">0</text>
        {Array.from({ length: Math.ceil(hours / 24) }, (_, d) => d).filter((d) => d % (hours > 24 * 8 ? 2 : 1) === 0).map((d) => (
          <text key={d} className="tick" x={x(Math.min(d * 24, hours - 1))} y={CH - 6} textAnchor="middle">D{d + 1}</text>
        ))}
        <path d={area} fill={color} opacity="0.1" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {closed.map((h) => (
          <g key={`c${h}`} transform={`translate(${x(h)} ${y(0) - 9})`} className="evt">
            <circle r="6" fill={STATUS.critical} className="ring" /><path d="M-2.6-2.6l5.2 5.2M2.6-2.6l-5.2 5.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          </g>
        ))}
        {reopened.map((h) => (
          <g key={`r${h}`} transform={`translate(${x(h)} ${y(values[h]) - 9})`} className="evt">
            <circle r="6" fill={STATUS.good} className="ring" /><path d="M-3 .4l2.2 2.4L3.2-2.2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
        {at !== null && <line className="crosshair" x1={x(at)} x2={x(at)} y1={CM.t} y2={CH - CM.b} />}
        <circle cx={x(at ?? cursor)} cy={y(values[at ?? cursor])} r="4" fill={color} className="dot" />
      </svg>
      {at !== null && scrub.active && (
        <div className="tip" style={{ left: `${(x(at) / CW) * 100}%` }} data-flip={x(at) > CW * 0.6 ? 'left' : 'right'} role="status">
          <div className="tip-when">{when(at)}</div>
          <div className="tip-row"><LineKey color={color}><span className="tip-name">Cash</span></LineKey><b>{naira(values[at])}</b></div>
          {eventAt === 'closed' && <div className="tip-note" style={{ color: STATUS.critical }}>✕ Closed: out of cash and stock</div>}
          {eventAt === 'reopened' && <div className="tip-note"><span style={{ color: STATUS.good }}>✓</span> Reopened by an ajo pool</div>}
        </div>
      )}
    </div>
  );
}

export function cashTable(name: string, values: number[], cursor: number, closures: number[], revivals: number[]): { columns: string[]; rows: (string | number)[][] } {
  const rows: (string | number)[][] = [];
  for (let h = 0; h <= cursor; h += 12) {
    const note = closures.some((c) => c > h - 12 && c <= h) ? 'Closed' : revivals.some((c) => c > h - 12 && c <= h) ? 'Reopened' : '';
    rows.push([when(h), naira(values[h]), note]);
  }
  return { columns: ['Time', `${name} cash`, 'Event'], rows };
}

export { dayOf, clock };
