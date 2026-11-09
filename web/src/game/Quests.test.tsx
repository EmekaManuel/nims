// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { GameState } from '../api';
import type { Actions } from './Panels';
import { QuestsPanel, questsReady } from './Quests';
import { Dock } from './Dock';

afterEach(cleanup);

type Q = NonNullable<GameState['quests']>;
const base: Q = {
  active: [{ id: 'first-sale', chain: 'starter', title: 'Make a sale', story: 'Sell five units.', reward: 150, complete: false, objectives: [{ label: 'Sell 5 units', done: 3, target: 5 }] }],
  starter: { done: 1, total: 6 },
  daily: { day: 3, reward: 200, ready: true },
};
const acts = () => ({ claimQuest: vi.fn(), claimDaily: vi.fn() }) as unknown as Actions;

describe('quests tab', () => {
  it('shows the quest you are on with its progress, and where you are in the starter chain', () => {
    render(<QuestsPanel quests={base} act={acts()} />);
    const q = screen.getByRole('article', { name: 'Make a sale' });
    expect(q.textContent).toMatch(/Getting started · 2 of 6/);
    expect(q.textContent).toMatch(/3 \/ 5/);
    expect(q.textContent).toMatch(/\+150 coins/);
    expect(within(q).queryByRole('button', { name: /Claim/ })).toBeNull();
  });

  it('a finished quest can be claimed', () => {
    const a = acts();
    render(<QuestsPanel quests={{ ...base, active: [{ ...base.active[0], complete: true, objectives: [{ label: 'Sell 5 units', done: 5, target: 5 }] }] }} act={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'Claim 150 coins' }));
    expect(a.claimQuest).toHaveBeenCalledWith('first-sale');
  });

  it('the daily reward shows the streak and can be claimed once', () => {
    const a = acts();
    const { rerender } = render(<QuestsPanel quests={base} act={a} />);
    const daily = screen.getByRole('group', { name: 'Daily reward' });
    expect(daily.textContent).toMatch(/day 3 in a row/);
    expect(daily.textContent).toMatch(/200 coins/);
    fireEvent.click(within(daily).getByRole('button', { name: 'Claim' }));
    expect(a.claimDaily).toHaveBeenCalled();
    rerender(<QuestsPanel quests={{ ...base, daily: { day: 3, reward: 200, ready: false } }} act={a} />);
    expect((within(screen.getByRole('group', { name: 'Daily reward' })).getByRole('button', { name: 'Claimed' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('the dock shows how many things are waiting to be claimed', () => {
    expect(questsReady(base)).toBe(1);
    expect(questsReady({ ...base, active: [{ ...base.active[0], complete: true }] })).toBe(2);
    expect(questsReady(undefined)).toBe(0);
    render(<Dock tab={null} onTab={() => {}} questCount={2} />);
    expect(screen.getByLabelText('2 to claim')).toBeTruthy();
  });

  it('shows your invite link with a copy button and how many friends joined', () => {
    render(<QuestsPanel quests={base} act={acts()} invite={{ code: 'AB12CD34', joined: 2, rewarded: 1, max: 10, reward: 300 }} />);
    const card = screen.getByRole('group', { name: 'Invite a friend' });
    expect((within(card).getByLabelText('Your invite link') as HTMLInputElement).value).toMatch(/\?invite=AB12CD34$/);
    expect(card.textContent).toMatch(/300 coins/);
    expect(card.textContent).toMatch(/Friends joined: 2 · rewarded: 1 of 10/);
    expect(within(card).getByRole('button', { name: 'Copy' })).toBeTruthy();
  });
});
