// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { api, type TownStats } from '../api';
import { TownBoard } from './TownBoard';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const full: TownStats = {
  day: 1479, players: 37,
  last24h: { players: 12, trades: 340, votes: 9 },
  total: { trades: 5120, votes: 61, decisions: 14, passed: 9 },
  shops: { open: 7, total: 8, playerStalls: 2 },
  leaders: [
    { name: 'Ada', worth: 41_200, shares: 12, stall: true, vehicle: 'van' },
    { name: 'Bo', worth: 9_800, shares: 0, stall: false, vehicle: 'pickup' },
  ],
  decisions: [{ day: 1478, market: 'Produce Market', lever: 'rent', to: 'low', passed: true, yes: 30, no: 24, daoId: 4 }],
};

describe('town board', () => {
  it('shows the numbers, the richest traders with their rank, and the council decisions', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue(full);
    render(<TownBoard />);
    const tiles = await screen.findByRole('region', { name: /The town in numbers/ });
    expect(tiles.textContent).toMatch(/37people have played/);
    expect(tiles.textContent).toMatch(/340trades in the last 24 hours/);
    expect(tiles.textContent).toMatch(/7 \/ 8shops open, plus 2 run by players/);
    const leaders = within(screen.getByRole('region', { name: /Richest traders/ })).getAllByRole('listitem');
    expect(leaders[0].textContent).toMatch(/Ada.*Tycoon.*12 shares.*own stall.*41,200 coins/);
    expect(leaders[1].textContent).toMatch(/Bo.*Trader.*9,800 coins/);
    const council = screen.getByRole('region', { name: /Town council decisions/ });
    expect(council.textContent).toMatch(/Passed.*Produce Market: set stall rent to low.*day 1,478.*30 for, 24 against.*proposal #4/);
    expect(screen.getByText(/day 1,479/)).toBeTruthy();
  });

  it('invites people in when nobody has played or voted yet', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue({ ...full, players: 1, leaders: [], decisions: [], total: { ...full.total, passed: 1 } });
    render(<TownBoard />);
    expect(await screen.findByText(/No one has traded yet/)).toBeTruthy();
    expect(screen.getByText(/No council vote has closed yet/)).toBeTruthy();
    expect(screen.getByRole('region', { name: /The town in numbers/ }).textContent).toMatch(/1person has played.*1council vote passed/);
  });

  it('says so when the board cannot be reached', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue(null);
    render(<TownBoard />);
    expect(await screen.findByText(/can't be reached right now/)).toBeTruthy();
  });
});
