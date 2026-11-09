// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameState, Plot } from '../api';
import fixture from '../test/fixture.json';
import { JourneyPanel, LandPanel, OnTheRoad } from './Journey';
import { DistrictMap } from './Map';
import type { Actions } from './Panels';

afterEach(cleanup);
const base = fixture as unknown as GameState;
const acts = () => ({ buyLand: vi.fn(), build: vi.fn(), listLand: vi.fn(), travel: vi.fn() }) as unknown as Actions;
const plot = (n: number, over: Partial<Plot> = {}): Plot => ({ id: `gemhollow-${n + 1}`, realm: 'gemhollow', n, price: n < 2 ? 3500 : 2600, forSale: null, owner: null, business: null, ...over });
const inHollow = (here: Plot[], mine: Plot[] = []): GameState => ({
  ...base,
  you: { ...base.you, cash: 10_000, at: 'mine' },
  realm: { here: 'gemhollow', name: 'Gem Hollow', journey: null, roads: [] },
  land: { buildCost: 4000, here, mine, discovered: { by: 'Ada', hour: 3 } },
});

describe('land in a frontier', () => {
  it('buys a plot from the town at its price', () => {
    const a = acts();
    render(<LandPanel state={inHollow([plot(0)])} plotId="gemhollow-1" act={a} />);
    expect(screen.getByText(/Right by the source/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Buy this land · 3,500 coins' }));
    expect(a.buyLand).toHaveBeenCalledWith('gemhollow-1');
  });

  it('one plot per place: no buy button if you already own land here', () => {
    const mine = plot(5, { owner: { name: 'You', mine: true } });
    render(<LandPanel state={inHollow([plot(0), mine], [mine])} plotId="gemhollow-1" act={acts()} />);
    expect(screen.queryByRole('button', { name: /Buy this land/ })).toBeNull();
    expect(screen.getByText(/one plot in each place/)).toBeTruthy();
  });

  it('on your own land: build a business with a name, or put the land up for sale', () => {
    const a = acts();
    const mine = plot(3, { owner: { name: 'You', mine: true } });
    render(<LandPanel state={inHollow([mine], [mine])} plotId="gemhollow-4" act={a} />);
    fireEvent.change(screen.getByLabelText('Name it (optional)'), { target: { value: 'Hollow Supplies' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build · 4,000 coins' }));
    expect(a.build).toHaveBeenCalledWith('gemhollow-4', 'Hollow Supplies');
    fireEvent.click(screen.getByRole('button', { name: 'Put up for sale' }));
    expect(a.listLand).toHaveBeenCalledWith('gemhollow-4', 2600);
  });

  it("another player's land: buy it at their price, or see that it is not for sale", () => {
    const a = acts();
    const theirs = plot(2, { owner: { name: 'Bo', mine: false }, forSale: 5000 });
    const { rerender } = render(<LandPanel state={inHollow([theirs])} plotId="gemhollow-3" act={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buy this land · 5,000 coins' }));
    expect(a.buyLand).toHaveBeenCalledWith('gemhollow-3');
    rerender(<LandPanel state={inHollow([{ ...theirs, forSale: null }])} plotId="gemhollow-3" act={a} />);
    expect(screen.getByText(/Bo is not selling/)).toBeTruthy();
  });

  it('the frontier map shows every plot with its price or owner', () => {
    const here = [plot(0), plot(1, { owner: { name: 'Bo', mine: false } }), ...Array.from({ length: 6 }, (_, i) => plot(i + 2))];
    render(<DistrictMap state={inHollow(here)} selected={null} onSelect={() => {}} moving={false} />);
    expect(screen.getByLabelText(/^Land for sale, 3,500 coins\. Plot 1\./)).toBeTruthy();
    expect(screen.getByLabelText(/^Bo's land\. Plot 2\./)).toBeTruthy();
    expect(screen.getAllByLabelText(/Plot \d\./)).toHaveLength(8);
  });
});

describe('travel', () => {
  it('lists every road, marks the unexplored ones, and flies to the far ones', () => {
    const a = acts();
    const roads = [
      { realm: 'saltmere' as const, name: 'Saltmere Harbour', blurb: 'A harbour.', hours: 6, passage: 120, freight: 0, travel: 'car' as const, frontier: false, discovered: false },
      { realm: 'gemhollow' as const, name: 'Gem Hollow', blurb: 'A valley of gems.', hours: 10, passage: 260, freight: 0, travel: 'plane' as const, frontier: true, discovered: false },
    ];
    render(<JourneyPanel state={{ ...base, you: { ...base.you, cash: 5000 }, realm: { here: 'town', name: 'Nims', journey: null, roads } }} to="gemhollow" act={a} />);
    const cards = screen.getAllByRole('article');
    expect(cards[0].getAttribute('aria-label')).toBe('Gem Hollow'); // the one you tapped comes first
    expect(cards[0].textContent).toMatch(/Unexplored.*A flight of 10 hours/);
    fireEvent.click(screen.getByRole('button', { name: 'Fly · 260 coins' }));
    expect(a.travel).toHaveBeenCalledWith('gemhollow');
  });

  it('in the air, the bar says so', () => {
    render(<OnTheRoad journey={{ to: 'gemhollow', name: 'Gem Hollow', hoursLeft: 4, hours: 10, travel: 'plane' }} hoursTotal={6} />);
    expect(screen.getByRole('status').textContent).toMatch(/In the air.*To Gem Hollow.*Arriving in 4 hours/);
  });
});
