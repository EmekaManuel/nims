// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { api } from '../api';
import { App } from '../App';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('when the server is briefly unreachable (a redeploy, a slow moment)', () => {
  it('keeps the loading screen and retries, then opens normally: nothing says the market is closed', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'providers').mockResolvedValue({ google: true });
    const state = vi.spyOn(api, 'state').mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(null);
    render(<App />);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByRole('status').textContent).toMatch(/Opening the market/);
    expect(document.body.textContent).not.toMatch(/closed|can.t reach/i);
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(state.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('button', { name: 'Play as a guest' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/closed|can.t reach/i);
  });

  it('after a long outage it says the market is waking up, calmly, and still never "closed"', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'state').mockRejectedValue(new Error('offline'));
    render(<App />);
    await act(async () => { await vi.advanceTimersByTimeAsync(21_000); });
    expect(screen.getByRole('status').textContent).toMatch(/Waking the market up/);
    expect(document.body.textContent).not.toMatch(/closed|can.t reach/i);
  });
});
