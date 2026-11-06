// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import fixture from '../test/fixture.json';
import type { GameState } from '../api';
import { Confetti, Dock, Drawer } from './Dock';
import { Hud } from './Hud';
import { Mascot } from '../art/Mascot';
import { Mission } from './Mission';
import { setSound, sfx, soundOn } from '../lib/sfx';
import type { Actions } from './Panels';
import { merchantReaction } from '../lib/haggle';
import { Recovery } from './Recovery';
import type { JobView } from '../api';

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

  it('closes when you press outside it, but not inside it or on the bottom bar', () => {
    const onClose = vi.fn();
    render(<><nav className="dock"><button>Prices</button></nav><main data-testid="map">Map</main><Drawer title="Deals" onClose={onClose}><p>Inside</p></Drawer></>);
    fireEvent.pointerDown(screen.getByText('Inside'));
    fireEvent.pointerDown(screen.getByText('Prices'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId('map'));
    expect(onClose).toHaveBeenCalledTimes(1);
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

describe('merchant reaction to a haggle', () => {
  const who = { merchant: 'anil', name: 'Anil Metals', personality: 'greedy' as const };
  it('returns the line to show and says it in the merchant\'s voice', async () => {
    const say = vi.fn();
    const line = await merchantReaction(who, () => Promise.resolve({ text: 'You drive a hard bargain, friend.', audio: '/game/voice/audio?id=abc' }), say);
    expect(line).toBe('Anil Metals: \u201cYou drive a hard bargain, friend.\u201d');
    expect(say).toHaveBeenCalledWith('You drive a hard bargain, friend.', '/game/voice/audio?id=abc', 'Anil Metals', 'greedy');
  });
  it('shows and says nothing when there is no reaction, or the request fails', async () => {
    const say = vi.fn();
    expect(await merchantReaction(who, () => Promise.resolve({ text: null, audio: null }), say)).toBeNull();
    expect(await merchantReaction(who, () => Promise.reject(new Error('down')), say)).toBeNull();
    expect(say).not.toHaveBeenCalled();
  });
});

describe('the way back from broke', () => {
  const job = (o: Partial<JobView> = {}): JobView => ({ id: 7, item: 'iron', units: 4, reward: 150, from: { id: 'iron', name: 'Scrap spot (iron)' }, to: { id: 'diego', name: 'Diego Hardware' }, hoursLeft: 30, ...o });
  const withHelp = (o: Partial<GameState>): GameState => ({ ...state, ...o });
  const acts = () => ({ scavenge: vi.fn(), takeJob: vi.fn(), deliverJob: vi.fn(), dropJob: vi.fn() });

  it('shows nothing when you are fine and there are no jobs', () => {
    const { container } = render(<Recovery state={withHelp({ help: { needed: false, scavengeIn: 0, canWork: true, workIn: 0 }, jobs: { board: [], active: null } })} act={acts()} />);
    expect(container.textContent).toBe('');
  });

  it('offers a scrap search when you need a hand, and says when it is not ready', () => {
    const a = acts();
    const { rerender } = render(<Recovery state={withHelp({ help: { needed: true, scavengeIn: 0, canWork: true, workIn: 0 }, jobs: { board: [], active: null } })} act={a} />);
    expect(screen.getByText('Need a hand?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Search the scrap heap' }));
    expect(a.scavenge).toHaveBeenCalledTimes(1);
    rerender(<Recovery state={withHelp({ help: { needed: true, scavengeIn: 2, canWork: true, workIn: 0 }, jobs: { board: [], active: null } })} act={a} />);
    const wait = screen.getByRole('button', { name: /refills in 2h/ }) as HTMLButtonElement;
    expect(wait.disabled).toBe(true);
  });

  it('lists the board and takes a job by its id', () => {
    const a = acts();
    render(<Recovery state={withHelp({ help: { needed: false, scavengeIn: 0, canWork: true, workIn: 0 }, jobs: { board: [job(), job({ id: 8, item: 'tomatoes', reward: 78 })], active: null } })} act={a} />);
    expect(screen.getAllByRole('button', { name: 'Take this job' })).toHaveLength(2);
    expect(screen.getAllByText(/Collect at the scrap spot, carry to Diego Hardware/)).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Take this job' })[1]);
    expect(a.takeJob).toHaveBeenCalledWith(8);
  });

  it('shows the job you hold with deliver and give-back, and blocks taking another', () => {
    const a = acts();
    render(<Recovery state={withHelp({ help: { needed: false, scavengeIn: 0, canWork: true, workIn: 0 }, jobs: { board: [job({ id: 9 })], active: job() } })} act={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deliver to Diego Hardware' }));
    expect(a.deliverJob).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Give it back' }));
    expect(a.dropJob).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Take this job' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('hides the board from people who are doing fine, shows the cooldown to those who are not', () => {
    const board = [job()];
    const { container, rerender } = render(<Recovery state={withHelp({ help: { needed: false, scavengeIn: 0, canWork: false, workIn: 0 }, jobs: { board, active: null } })} act={acts()} />);
    expect(container.textContent).toBe('');
    rerender(<Recovery state={withHelp({ help: { needed: false, scavengeIn: 0, canWork: true, workIn: 5 }, jobs: { board, active: null } })} act={acts()} />);
    expect(screen.getByText(/next job in 5h/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Take this job' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('works with an older server that sends neither field', () => {
    const { container } = render(<Recovery state={state} act={acts()} />);
    expect(container.textContent).toBe('');
  });
});
