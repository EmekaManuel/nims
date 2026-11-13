// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { api, type TownStats } from '../api';
import { TownBoard } from './TownBoard';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const full: TownStats = {
  day: 1479, players: 37,
  last24h: { players: 12, trades: 340, votes: 9 },
  total: { trades: 5120, votes: 61, decisions: 14, passed: 9 },
  shops: { open: 7, total: 8, playerStalls: 2 },
  since: '2026-11-08T12:03:07.163Z',
  chain: { contract: 'oja-items.testnet', lastSettledAt: null },
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

  it('switches the table between everyone who has played and the last 24 hours', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue({ ...full, leaders24h: [{ name: 'Bo', worth: 9_800, shares: 0, stall: false, vehicle: 'pickup' }] });
    render(<TownBoard />);
    const region = await screen.findByRole('region', { name: /Richest traders/ });
    expect(within(region).getAllByRole('listitem')).toHaveLength(2);
    expect(within(region).getByRole('button', { name: 'All time' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(region).getByRole('button', { name: 'Last 24 hours' }));
    const rows = within(region).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/Bo/);
    expect(region.textContent).toMatch(/played in the last 24 real hours/);
  });

  it('says nobody played in the last 24 hours when the server has none, or predates the table', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue(full); // no leaders24h
    render(<TownBoard />);
    const region = await screen.findByRole('region', { name: /Richest traders/ });
    fireEvent.click(within(region).getByRole('button', { name: 'Last 24 hours' }));
    expect(within(region).getByText(/No one has played in the last 24 hours/)).toBeTruthy();
  });

  it('shows impact from the live numbers, and links the contract', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue(full);
    render(<TownBoard />);
    const impact = await screen.findByRole('region', { name: /What this shows/ });
    expect(impact.textContent).toMatch(/37 people, 5,120 trades/);
    expect(impact.textContent).toMatch(/7 of 8 merchant shops are open/);
    expect(impact.textContent).toMatch(/9 rules voted in/);
    expect(impact.textContent).toMatch(/proposal #4/);
    expect(within(impact).getByRole('link', { name: 'oja-items.testnet' }).getAttribute('href')).toBe('https://testnet.nearblocks.io/address/oja-items.testnet');
    expect(impact.textContent).toMatch(/testnet only/i);
  });

  it('leaves out the claims it cannot back: no vote yet, chain off', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue({ ...full, chain: null, decisions: [], total: { ...full.total, passed: 0 } });
    render(<TownBoard />);
    const impact = await screen.findByRole('region', { name: /What this shows/ });
    expect(impact.textContent).toMatch(/Rules the players set/);
    expect(impact.textContent).not.toMatch(/proposal #/);
    expect(within(impact).queryByRole('link')).toBeNull();
  });

  it('invites people in when nobody has played or voted yet', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue({ ...full, players: 1, leaders: [], decisions: [], total: { ...full.total, decisions: 0, passed: 1 } });
    render(<TownBoard />);
    expect(await screen.findByText(/No one has traded yet/)).toBeTruthy();
    expect(screen.getByText(/No council vote has closed yet/)).toBeTruthy();
    expect(screen.getByRole('region', { name: /The town in numbers/ }).textContent).toMatch(/1person has played.*1council vote passed/);
  });

  it('does not say no vote has closed when the server counts closed votes it can no longer list', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue({ ...full, decisions: [], total: { ...full.total, decisions: 4, passed: 0 } });
    render(<TownBoard />);
    expect(await screen.findByText(/4 council votes have closed so far, none passed/)).toBeTruthy();
    expect(screen.queryByText(/No council vote has closed yet/)).toBeNull();
  });

  it('says so when the board cannot be reached', async () => {
    vi.spyOn(api, 'stats').mockResolvedValue(null);
    render(<TownBoard />);
    expect(await screen.findByText(/can't be reached right now/)).toBeTruthy();
  });
});
