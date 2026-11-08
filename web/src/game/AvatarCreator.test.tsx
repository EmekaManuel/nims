// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AvatarCreator } from './AvatarCreator';
import { DEFAULT_AVATAR } from '../art/avatar';

afterEach(cleanup);

describe('create your trader', () => {
  it('a new player picks a look and a name, and starts trading', () => {
    const onSave = vi.fn();
    render(<AvatarCreator first initial={null} name="N." onSave={onSave} />);
    expect(screen.getByRole('dialog', { name: 'Create your trader' })).toBeTruthy();
    expect((screen.getByLabelText('Your name in town') as HTMLInputElement).value).toBe(''); // an initial is not a name to edit
    fireEvent.click(screen.getByRole('button', { name: 'Skin 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Long' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shirt 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'No cap' }));
    fireEvent.change(screen.getByLabelText('Your name in town'), { target: { value: 'Ngozi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start trading' }));
    expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_AVATAR, skin: 4, style: 'long', shirt: 2, hat: 'none' }, 'Ngozi');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull(); // first visit: no skipping past it
  });

  it('leaving the name blank keeps the current one; a one-letter name is refused', () => {
    const onSave = vi.fn();
    render(<AvatarCreator first initial={null} name="N." onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Your name in town'), { target: { value: 'A' } });
    expect((screen.getByRole('button', { name: 'Start trading' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Your name in town'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start trading' }));
    expect(onSave).toHaveBeenCalledWith(DEFAULT_AVATAR, null);
  });

  it('changing your look later starts from your current one and can be cancelled', () => {
    const onClose = vi.fn();
    const mine = { skin: 1, hair: 3, style: 'bald' as const, shirt: 6, hat: 'cap' as const };
    render(<AvatarCreator initial={mine} name="Stephen" onSave={() => {}} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Your look' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bald' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Shirt 7' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
