// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fixture from '../test/fixture.json';
import type { CouncilView, GameState } from '../api';
import { Council } from './Council';
import type { Actions } from './Panels';

afterEach(cleanup);
const act = () => ({ councilPropose: vi.fn(), councilVote: vi.fn() }) as unknown as Actions & { councilPropose: ReturnType<typeof vi.fn>; councilVote: ReturnType<typeof vi.fn> };
const market = (over: Partial<CouncilView>): CouncilView => ({
  market: 'fabric', name: 'Fabric Market', rent: 'normal', payout: 'normal', effects: [],
  options: { rent: ['low', 'normal', 'high'], payout: ['lean', 'normal', 'generous'] }, seats: 0, canPropose: false, proposal: null, ...over,
});
const withCouncil = (c: CouncilView[]) => ({ ...(fixture as unknown as GameState), council: c });

describe('Council', () => {
  it('shows nothing for an older server that has no council', () => {
    const { container } = render(<Council state={fixture as unknown as GameState} act={act()} />);
    expect(container.innerHTML).toBe('');
  });

  it('tells you to own a share before you can have a say', () => {
    render(<Council state={withCouncil([market({})])} act={act()} />);
    expect(screen.getByText(/no say yet/i)).toBeTruthy();
    expect(screen.getByText(/own a share in a merchant here to propose/i)).toBeTruthy();
  });

  it('a shareholder proposes a change to the rule that is not current', async () => {
    const a = act();
    render(<Council state={withCouncil([market({ seats: 12, canPropose: true })])} act={a} />);
    await userEvent.click(screen.getByRole('button', { name: 'High' }));
    expect(a.councilPropose).toHaveBeenCalledWith('fabric', 'rent', 'high');
    await userEvent.click(screen.getByRole('button', { name: 'Generous' }));
    expect(a.councilPropose).toHaveBeenLastCalledWith('fabric', 'payout', 'generous');
    expect(screen.queryByRole('button', { name: 'Normal' })).toBeNull(); // already the rule
  });

  it('an open vote shows the tally and lets a shareholder vote either way', async () => {
    const a = act();
    const proposal = { lever: 'rent' as const, to: 'high', effect: 'Merchants pay double rent.', by: 'Ada', yes: 30, no: 24, merchants: { for: 0, against: 3 }, closesIn: 5, yourVote: 'yes' as const };
    render(<Council state={withCouncil([market({ seats: 30, proposal })])} act={a} />);
    expect(screen.getByText(/30 for · 24 against/)).toBeTruthy();
    expect(screen.getByText(/merchants are against it/)).toBeTruthy();
    expect(screen.getByText(/closes in 5 hours/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'For' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Against' }));
    expect(a.councilVote).toHaveBeenCalledWith('fabric', false);
  });
});
