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
});
