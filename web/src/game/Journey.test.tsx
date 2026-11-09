// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameState } from '../api';
import fixture from '../test/fixture.json';
import { JourneyPanel, OnTheRoad } from './Journey';
import { DistrictMap } from './Map';
import type { Actions } from './Panels';

afterEach(cleanup);

const base = fixture as unknown as GameState;
const road = { realm: 'saltmere' as const, name: 'Saltmere Harbour', blurb: 'A fishing harbour beyond the hills.', hours: 6, passage: 120, freight: 48 };
const inTown: GameState = { ...base, realm: { here: 'town', name: 'Nims', journey: null, roads: [road] } };

describe('the road to Saltmere', () => {
  it('says how long, what it costs, and sets off', () => {
    const act = { travel: vi.fn() } as unknown as Actions;
    render(<JourneyPanel state={{ ...inTown, you: { ...inTown.you, cash: 1_000 } }} to="saltmere" act={act} />);
    expect(screen.getByRole('heading', { name: 'The road to Saltmere Harbour' })).toBeTruthy();
    expect(screen.getByText(/6 hours/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set off · 168 coins' }));
    expect(act.travel).toHaveBeenCalledWith('saltmere');
  });

  it('cannot set off without the coins, and says how many more you need', () => {
    render(<JourneyPanel state={{ ...inTown, you: { ...inTown.you, cash: 100 } }} to="saltmere" act={{ travel: vi.fn() } as unknown as Actions} />);
    expect((screen.getByRole('button', { name: /Set off/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/You need 68 coins more/)).toBeTruthy();
  });

  it('on the road, says where to and how long is left', () => {
    render(<OnTheRoad journey={{ to: 'saltmere', name: 'Saltmere Harbour', hoursLeft: 2 }} hoursTotal={6} />);
    expect(screen.getByRole('status').textContent).toMatch(/To Saltmere Harbour.*Arriving in 2 hours/);
  });

  it('at the harbour, the map shows the harbour and its road home, not the town', () => {
    const tmpl = base.stalls.find((s) => !s.owner)!;
    const harbourStalls = [['pike', 'Pike & Daughters'], ['marlow', 'Marlow Chandlery'], ['zara', "Zara's Spice House"]].map(([id, name]) => ({ ...tmpl, id, name, market: 'harbour' as const }));
    const atSea: GameState = { ...base, stalls: [...base.stalls, ...harbourStalls], you: { ...base.you, at: 'harbour' }, realm: { here: 'saltmere', name: 'Saltmere Harbour', journey: null, roads: [{ ...road, realm: 'town' as never, name: 'Nims' }] } };
    render(<DistrictMap state={atSea} selected={null} onSelect={() => {}} moving={false} />);
    expect(screen.getByLabelText('Map of Saltmere Harbour')).toBeTruthy();
    expect(screen.getByLabelText(/^Pike & Daughters/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Lena's Textiles/)).toBeNull();
    expect(screen.getByLabelText(/To Nims\. The road out/)).toBeTruthy();
  });
});
