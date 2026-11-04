// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import fixture from './fixture.json';
import type { GameState } from './api';
import { Confetti, Dock, Drawer } from './Dock';
import { Hud } from './Hud';
import { Mascot } from './Mascot';
import { Mission } from './Mission';
import { setSound, sfx, soundOn } from './sfx';
import type { Actions } from './Panels';

const state = fixture as unknown as GameState;
const act = (): Actions => new Proxy({}, { get: () => vi.fn() }) as Actions;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('dock and drawer', () => {
  it('shows four tabs, marks the open one, and reports taps', () => {
    const onTab = vi.fn();
    render(<Dock tab="prices" onTab={onTab} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Deals', 'Prices', 'My business', 'News']);
    expect(screen.getByRole('button', { name: 'Prices' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Deals' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'My business' }));
    expect(onTab).toHaveBeenCalledWith('business');
  });

  it('badges unseen news, capped at 9+, and shows nothing when there is none', () => {
    const { rerender } = render(<Dock tab={null} onTab={() => {}} newsCount={0} />);
    expect(screen.queryByLabelText(/new$/)).toBeNull();
    rerender(<Dock tab={null} onTab={() => {}} newsCount={3} />);
    expect(screen.getByLabelText('3 new').textContent).toBe('3');
    rerender(<Dock tab={null} onTab={() => {}} newsCount={42} />);
    expect(screen.getByLabelText('42 new').textContent).toBe('9+');
  });

  it('opens a drawer you can close', () => {
    const onClose = vi.fn();
    render(<Drawer title="Deals" onClose={onClose}><p>Inside</p></Drawer>);
    expect(screen.getByLabelText('Deals').textContent).toContain('Inside');
    fireEvent.click(screen.getByRole('button', { name: 'Close Deals' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('bursts confetti that is hidden from assistive tech', () => {
    const { container } = render(<Confetti />);
    const c = container.querySelector('.confetti')!;
    expect(c.getAttribute('aria-hidden')).toBe('true');
    expect(c.querySelectorAll('span')).toHaveLength(36);
  });
});

describe('top bar', () => {
  it('shows cash, net worth and load as pills, and your rank with an XP ring', () => {
    const { container } = render(<Hud state={state} act={act()} onHelp={() => {}} />);
    expect(container.querySelectorAll('.pill')).toHaveLength(3);
    expect(container.querySelector('.rank .ring-fg')).toBeTruthy();
    expect(container.querySelector('.rank-text b')!.textContent).toMatch(/Street vendor|Stall keeper|Trader|Merchant|Tycoon/);
  });

  it('rank follows your PEAK net worth, so it never falls when you sell into a flooded market', () => {
    const low = { ...state, you: { ...state.you, netWorth: 1_000 } };
    const { container, rerender } = render(<Hud state={low} act={act()} peakWorth={0} />);
    expect(container.querySelector('.rank-text b')!.textContent).toBe('Street vendor');
    rerender(<Hud state={low} act={act()} peakWorth={4_000} />);
    expect(container.querySelector('.rank-text b')!.textContent).toBe('Stall keeper');
  });

  it('has a sound switch that says what it will do', () => {
    const onSound = vi.fn();
    const { rerender } = render(<Hud state={state} act={act()} sound onSound={onSound} />);
    const on = screen.getByRole('button', { name: /Sound on/ });
    expect(on.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(on);
    expect(onSound).toHaveBeenCalled();
    rerender(<Hud state={state} act={act()} sound={false} onSound={onSound} />);
    expect(screen.getByRole('button', { name: /Sound off/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('names each shock in full for the table and briefly for a phone', () => {
    const { container } = render(<Hud state={{ ...state, shocks: [{ kind: 'rain', hoursLeft: 3 }] }} act={act()} />);
    const shock = screen.getByRole('status');
    expect(shock.querySelector('.long')!.textContent).toContain('produce spoils faster');
    expect(shock.querySelector('.short')!.textContent).toBe('Rain');
    expect(container.textContent).toContain('3h left');
  });
});

describe('fare you owe', () => {
  it('shows what you owe in the top bar, and nothing when you owe nothing', () => {
    const { container, rerender } = render(<Hud state={state} act={act()} />);
    expect(container.querySelector('.chip.owe')).toBeNull();
    rerender(<Hud state={{ ...state, you: { ...state.you, fareOwed: 120 } }} act={act()} />);
    const chip = container.querySelector('.chip.owe')!;
    expect(chip.textContent).toBe('Fare owed: 120 coins');
    expect(chip.getAttribute('title')).toMatch(/comes out of your next sale/);
  });
});

describe('guide and mascot', () => {
  it('has Nim give the next step beside the goal, and cheer when the goal is done', () => {
    const { container, rerender } = render(<Mission state={state} onFocus={() => {}} onPickGoal={() => {}} />);
    expect(container.querySelector('.quest-guide .mascot')).toBeTruthy();
    expect(screen.getByText(state.coach.text)).toBeTruthy();
    const before = container.querySelector('.mascot')!.innerHTML;
    rerender(<Mission state={{ ...state, goal: { ...state.goal!, done: true } }} onFocus={() => {}} onPickGoal={() => {}} />);
    expect(container.querySelector('.mascot')!.innerHTML).not.toBe(before); // the cheering face
  });

  it('keeps the mascot decorative', () => {
    const { container } = render(<Mascot />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('sound effects', () => {
  const fake = () => {
    const made: string[] = [];
    class Ctx {
      state = 'running'; currentTime = 0; destination = {};
      resume() {}
      createOscillator() { made.push('osc'); return { type: '', frequency: { setValueAtTime() {} }, connect: (n: unknown) => n, start() {}, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n }; }
    }
    vi.stubGlobal('AudioContext', Ctx);
    return made;
  };

  beforeEach(() => { localStorage.clear(); });

  it('is on by default, and the mute choice is remembered', () => {
    expect(soundOn()).toBe(true);
    setSound(false);
    expect(soundOn()).toBe(false);
    setSound(true);
    expect(soundOn()).toBe(true);
  });

  it('makes sound when on and stays silent when muted', () => {
    const made = fake();
    sfx.coin();
    expect(made.length).toBeGreaterThan(0);
    made.length = 0;
    setSound(false);
    sfx.coin(); sfx.win(); sfx.error(); sfx.pop();
    expect(made).toHaveLength(0);
  });

  it('never breaks the game when audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => { sfx.coin(); sfx.pop(); sfx.error(); sfx.win(); }).not.toThrow();
  });
});
