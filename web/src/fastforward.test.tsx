// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import fixture from './ff-fixture.json';
import type { FastForward } from './api';
import { CashChart, DataTable, PriceChart, priceTable, Sync } from './Charts';
import { FastForwardPage } from './Fastforward';
import { itemColor } from './viz';

const data = fixture as unknown as FastForward;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const sync = (over: Partial<Sync> = {}): Sync => ({ hover: null, setHover: () => {}, cursor: data.hours - 1, hours: data.hours, ...over });
const priceSeries = (market: 'produce' | 'fabric' | 'scrap') =>
  data.items.filter((i) => i.market === market).map((i) => ({ key: i.item, label: i.item, color: itemColor(i.item), base: i.base, values: data.prices[i.item] }));

describe('price chart', () => {
  it('draws one 2px line per good, in that good’s own colour', () => {
    const { container } = render(<PriceChart series={priceSeries('scrap')} sync={sync()} shocks={data.shocks} yDomain={[20, 200]} />);
    const lines = [...container.querySelectorAll('path[stroke]')].filter((p) => p.getAttribute('stroke-width') === '2');
    expect(lines.map((l) => l.getAttribute('stroke'))).toEqual([itemColor('iron'), itemColor('copper wire')]);
  });

  it('only draws up to the playback point', () => {
    const early = render(<PriceChart series={priceSeries('scrap')} sync={sync({ cursor: 10 })} shocks={data.shocks} yDomain={[20, 200]} />);
    const full = render(<PriceChart series={priceSeries('scrap')} sync={sync()} shocks={data.shocks} yDomain={[20, 200]} />);
    const len = (c: HTMLElement) => c.querySelector('path[stroke-width="2"]')!.getAttribute('d')!.length;
    expect(len(early.container)).toBeLessThan(len(full.container) / 5);
  });

  it('labels line ends directly only when the labels would not collide', () => {
    // iron and copper wire end far apart: labelled. tomatoes and pepper end together: legend + tooltip instead.
    const apart = render(<PriceChart series={priceSeries('scrap')} sync={sync()} shocks={[]} yDomain={[20, 200]} />);
    expect(apart.container.querySelectorAll('.endlabel')).toHaveLength(2);
    cleanup();
    const crowded = render(<PriceChart series={[{ key: 'a', label: 'a', color: '#000', base: 100, values: [100, 100] }, { key: 'b', label: 'b', color: '#111', base: 100, values: [100, 101] }]} sync={sync({ cursor: 1, hours: 2 })} shocks={[]} yDomain={[0, 200]} />);
    expect(crowded.container.querySelectorAll('.endlabel')).toHaveLength(0);
  });

  it('opens a tooltip with every series only for the chart you are on, led by the values', () => {
    const Harness = () => {
      const [hover, setHover] = useState<number | null>(null);
      const s = sync({ hover, setHover });
      return <><div data-testid="a"><PriceChart series={priceSeries('scrap')} sync={s} shocks={data.shocks} yDomain={[20, 200]} /></div><div data-testid="b"><PriceChart series={priceSeries('produce')} sync={s} shocks={data.shocks} yDomain={[20, 200]} /></div></>;
    };
    render(<Harness />);
    const a = within(screen.getByTestId('a')).getByRole('group');
    expect(screen.queryAllByRole('status')).toHaveLength(0); // nothing open until you point at or focus a chart
    fireEvent.focus(a);
    expect(within(screen.getByTestId('a')).getByRole('status').textContent).toContain('iron');
    expect(within(screen.getByTestId('a')).getByRole('status').textContent).toContain('copper wire');
    expect(within(screen.getByTestId('b')).queryByRole('status')).toBeNull(); // the other chart shows only the crosshair
    expect(document.querySelectorAll('.crosshair')).toHaveLength(2);
    fireEvent.keyDown(a, { key: 'PageDown' });
    expect(within(screen.getByTestId('a')).getByRole('status').textContent).toMatch(/Day 7, 11:00/); // 23:00 minus 12 hours
    fireEvent.keyDown(a, { key: 'Escape' });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('has a table twin with the same numbers', () => {
    const series = priceSeries('produce');
    const t = priceTable(series, 36);
    expect(t.columns).toEqual(['Time', 'tomatoes', 'pepper', 'garri']);
    expect(t.rows).toHaveLength(4); // hours 0, 12, 24, 36
    render(<DataTable caption="x" columns={t.columns} rows={t.rows} />);
    expect(screen.getByText(/Day 2, 12:00/)).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(5);
  });
});

describe('cash chart', () => {
  it('marks closures with an icon and says so in the tooltip, in words as well as colour', () => {
    const m = data.merchants.find((x) => data.closures.some((c) => c.merchant === x.id))!;
    const closures = data.closures.filter((c) => c.merchant === m.id).map((c) => c.hour);
    const revivals = data.revivals.filter((c) => c.merchant === m.id).map((c) => c.hour);
    const { container } = render(<CashChart name={m.name} values={data.cash[m.id]} sync={sync({ hover: closures[0] })} closures={closures} revivals={revivals} color="#2a78d6" />);
    expect(container.querySelectorAll('.evt').length).toBe(closures.length + revivals.length);
    fireEvent.focus(screen.getByRole('group'));
    expect(screen.getByRole('status').textContent).toContain('Closed');
  });
});

describe('the fast-forward page', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('opens already running, never as an empty shell, and shows the finished week for reduced motion', async () => {
    render(<FastForwardPage />);
    await waitFor(() => expect(screen.getByText('What stood out')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ days: 7, flooder: true });
    expect(screen.getByText(data.highlights[0])).toBeTruthy();
    expect(document.querySelector('.clock')!.textContent).toBe('Day 7, 23:00'); // reduced motion: jumps to the end
    expect(screen.getByText('Replay')).toBeTruthy();
  });

  it('runs again with the strategies you choose', async () => {
    render(<FastForwardPage />);
    await waitFor(() => screen.getByText('What stood out'));
    fireEvent.click(screen.getByLabelText(/Market flooder/));
    fireEvent.change(screen.getByLabelText('Gatherers'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Fast-forward a week/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ flooder: false, gatherers: 1, arbitrageur: true });
  });

  it('keeps the previous charts on screen while it reloads, and says what went wrong if it fails', async () => {
    render(<FastForwardPage />);
    await waitFor(() => screen.getByText('What stood out'));
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'One moment, another run just started.' }) });
    fireEvent.click(screen.getByRole('button', { name: /Fast-forward a week/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('One moment'));
    expect(screen.getByText('What stood out')).toBeTruthy(); // the last good run is still there
  });

  it('lists the traders with their change, and every event in words', async () => {
    render(<FastForwardPage />);
    await waitFor(() => screen.getByText('The traders'));
    const names = [...document.querySelectorAll('.vtable tbody th')].map((th) => th.textContent);
    for (const p of data.players) expect(names).toContain(p.label);
    expect(document.querySelector('.delta-up, .delta-down')).toBeTruthy();
    const happen = document.querySelector('.happen')!.textContent!;
    expect(happen).toMatch(/Closed:/);
    expect(happen).toMatch(/Reopened:/);
    expect(happen).toMatch(/Shareholders were paid/);
  });

  it('gives every chart a table view', async () => {
    render(<FastForwardPage />);
    await waitFor(() => screen.getByText('What stood out'));
    const toggles = screen.getAllByText('Show table');
    expect(toggles).toHaveLength(3 + 8); // three markets and eight shops
    fireEvent.click(toggles[0]);
    expect(document.querySelector('.vtable caption')!.textContent).toContain('Produce Market prices');
  });

  it('never shows wallet vocabulary', async () => {
    const { container } = render(<FastForwardPage />);
    await waitFor(() => screen.getByText('What stood out'));
    expect(container.textContent).not.toMatch(/mnemonic|private key|wallet|\bgas\b|yocto|\.testnet|signature/i);
  });

  void act;
});
