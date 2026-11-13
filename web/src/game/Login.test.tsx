// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { api } from '../api';
import { Login } from './Login';

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.pushState({}, '', '/'); });


describe('login', () => {
  it('offers Continue with Google only when the server has it set up', async () => {
    vi.spyOn(api, 'providers').mockResolvedValue({ google: true });
    render(<Login onIn={() => {}} />);
    const link = await screen.findByRole('link', { name: /Continue with Google/ });
    expect(link.getAttribute('href')).toBe('/auth/google');
    expect(screen.getByRole('button', { name: 'Play as a guest' })).toBeTruthy();
    expect(screen.queryByLabelText(/email/i)).toBeNull(); // no email sign-in any more
  });

  it('shows only the guest button when Google is not set up', async () => {
    const p = vi.spyOn(api, 'providers').mockResolvedValue({ google: false });
    render(<Login onIn={() => {}} />);
    await waitFor(() => expect(p).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /Continue with Google/ })).toBeNull();
  });

  it('explains a failed Google sign-in and keeps the guest option', async () => {
    window.history.pushState({}, '', '/?login=failed');
    vi.spyOn(api, 'providers').mockResolvedValue({ google: false });
    render(<Login onIn={() => {}} />);
    expect(screen.getByRole('status').textContent).toMatch(/Google sign-in did not work/);
    expect(screen.getByRole('button', { name: 'Play as a guest' })).toBeTruthy();
  });

  it('points to the town board and the simulated week, and keeps the sign-in form clean', async () => {
    vi.spyOn(api, 'providers').mockResolvedValue({ google: false });
    render(<Login onIn={() => {}} />);
    expect(screen.getByRole('link', { name: /town board/ }).getAttribute('href')).toBe('/town');
    expect(screen.getByRole('link', { name: /week of the market/ }).getAttribute('href')).toBe('/week');
    expect(screen.queryByRole('region', { name: /The town right now/ })).toBeNull();
  });

  it('welcomes a player who came from a friend\'s invite link', async () => {
    vi.spyOn(api, 'providers').mockResolvedValue({ google: false });
    window.history.pushState({}, '', '/?invite=AB12CD34');
    render(<Login onIn={() => {}} />);
    expect(screen.getByRole('status').textContent).toMatch(/A friend invited you/);
  });

  it('play as a guest: one press, and the game opens', async () => {
    vi.spyOn(api, 'providers').mockResolvedValue({ google: true });
    const g = vi.spyOn(api, 'guest').mockResolvedValue({ ok: true });
    const onIn = vi.fn();
    render(<Login onIn={onIn} />);
    screen.getByRole('button', { name: 'Play as a guest' }).click();
    await waitFor(() => expect(onIn).toHaveBeenCalled());
    expect(g).toHaveBeenCalledTimes(1);
  });

  it('says why when the server refuses a new guest', async () => {
    vi.spyOn(api, 'providers').mockResolvedValue({ google: true });
    vi.spyOn(api, 'guest').mockResolvedValue({ error: 'Too many new guests from here. Try again later, or continue with Google.' });
    const onIn = vi.fn();
    render(<Login onIn={onIn} />);
    screen.getByRole('button', { name: 'Play as a guest' }).click();
    expect(await screen.findByText(/Too many new guests/)).toBeTruthy();
    expect(onIn).not.toHaveBeenCalled();
  });
});
