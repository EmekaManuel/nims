// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { api } from '../api';
import { Login } from './Login';

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.pushState({}, '', '/'); });

const stats = { day: 1465, players: 37, last24h: { players: 12, trades: 340, votes: 9 }, total: { trades: 5120, votes: 61, decisions: 14, passed: 9 }, shops: { open: 8, total: 8, playerStalls: 2 } };

describe('login', () => {
  it('offers Continue with Google only when the server has it set up', async () => {
    vi.spyOn(api, 'providers').mockResolvedValue({ google: true });
    render(<Login onIn={() => {}} />);
    const link = await screen.findByRole('link', { name: /Continue with Google/ });
    expect(link.getAttribute('href')).toBe('/auth/google');
    expect(screen.getByRole('button', { name: /Send me a link/ })).toBeTruthy();
  });

  it('shows only the email form when Google is not set up', async () => {
    const p = vi.spyOn(api, 'providers').mockResolvedValue({ google: false });
    render(<Login onIn={() => {}} />);
    await waitFor(() => expect(p).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /Continue with Google/ })).toBeNull();
  });

  it('explains a failed Google sign-in and keeps the email option', async () => {
    window.history.pushState({}, '', '/?login=failed');
    vi.spyOn(api, 'providers').mockResolvedValue({ google: false });
    render(<Login onIn={() => {}} />);
    expect(screen.getByRole('status').textContent).toMatch(/Google sign-in did not work/);
    expect(screen.getByRole('button', { name: /Send me a link/ })).toBeTruthy();
  });

  it('shows the town right now, before you sign in', async () => {
    vi.spyOn(api, 'providers').mockResolvedValue({ google: false });
    vi.spyOn(api, 'stats').mockResolvedValue(stats);
    render(<Login onIn={() => {}} />);
    const live = await screen.findByRole('region', { name: /The town right now/ });
    expect(live.textContent).toMatch(/day 1,465/);
    expect(live.textContent).toMatch(/37 people have played/);
    expect(live.textContent).toMatch(/340 trades by 12 players in the last 24 hours/);
    expect(live.textContent).toMatch(/9 council votes passed/);
    expect(live.textContent).toMatch(/8 of 8 shops open, plus 2 player stalls/);
  });

  it('says one person and one trade properly', async () => {
    vi.spyOn(api, 'providers').mockResolvedValue({ google: false });
    vi.spyOn(api, 'stats').mockResolvedValue({ ...stats, players: 1, last24h: { players: 1, trades: 1, votes: 0 }, total: { ...stats.total, passed: 1 }, shops: { open: 7, total: 8, playerStalls: 0 } });
    render(<Login onIn={() => {}} />);
    const live = await screen.findByRole('region', { name: /The town right now/ });
    expect(live.textContent).toMatch(/1 person has played/);
    expect(live.textContent).toMatch(/1 trade by 1 player in/);
    expect(live.textContent).toMatch(/1 council vote passed/);
    expect(live.textContent).toMatch(/7 of 8 shops open$/);
  });

  it('says a quiet town plainly instead of a row of zeros', async () => {
    vi.spyOn(api, 'providers').mockResolvedValue({ google: false });
    vi.spyOn(api, 'stats').mockResolvedValue({ ...stats, last24h: { players: 0, trades: 0, votes: 0 }, total: { ...stats.total, passed: 0 } });
    render(<Login onIn={() => {}} />);
    const live = await screen.findByRole('region', { name: /The town right now/ });
    expect(live.textContent).toMatch(/Quiet right now: be the first to trade today/);
    expect(live.textContent).toMatch(/No council vote has passed yet/);
  });

  it('leaves the numbers out when the server cannot say, and in the demo video', async () => {
    vi.spyOn(api, 'providers').mockResolvedValue({ google: false });
    const st = vi.spyOn(api, 'stats').mockResolvedValue(null);
    render(<Login onIn={() => {}} />);
    await waitFor(() => expect(st).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: /The town right now/ })).toBeNull();
    cleanup();
    st.mockClear();
    render(<Login onIn={() => {}} presetEmail="ada@example.com" showGoogle />);
    expect(st).not.toHaveBeenCalled();
  });
});
