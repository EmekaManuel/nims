// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import fixture from './fixture.json';
import type { GameState } from './api';
import { crateCount, DistrictMap, lightAt, STALL_H, STALL_POS, STALL_W, ZONES } from './Map';
import { Deals, Mission } from './Mission';
import { GoalPicker, HowToPlay } from './Modals';
import { Hud } from './Hud';
import { PriceBoard } from './PriceBoard';
import { StallPanel, SourcePanel, Actions } from './Panels';

afterEach(cleanup);
const state = fixture as unknown as GameState;
const act = (): Actions => ({ sell: vi.fn(), buy: vi.fn(), gather: vi.fn(), upgrade: vi.fn() });
const empty = { ...state, you: { ...state.you, carrying: 0, inventory: [] } };
const withInv = { ...state, you: { ...state.you, carrying: 5, inventory: [{ item: 'iron' as const, units: 5 }] } };

describe('map', () => {
  it('draws every stall and source, and selecting works by click and keyboard', () => {
    const onSelect = vi.fn();
    render(<DistrictMap state={state} selected={null} onSelect={onSelect} />);
    expect(screen.getAllByRole('button')).toHaveLength(state.stalls.length + state.sources.length);
    fireEvent.click(screen.getByLabelText(/Chidi Iron Works/));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'stall', id: 'chidi' });
    fireEvent.keyDown(screen.getByLabelText(/Scrap spot \(iron\)/), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith({ kind: 'source', item: 'iron' });
  });

  it('shows a closed stall in words, not just colour', () => {
    const s = { ...state, stalls: state.stalls.map((x) => (x.id === 'bisi' ? { ...x, state: 'closed' as const } : x)) };
    render(<DistrictMap state={s} selected={null} onSelect={() => {}} />);
    expect(screen.getByLabelText(/Mama Bisi, Closed/)).toBeTruthy();
  });
});

describe('stall panel', () => {
  const stall = state.stalls.find((s) => s.id === 'chidi')!;

  it("reveals the merchant's reasoning when a price is hovered or focused", () => {
    render(<StallPanel stall={stall} state={withInv} act={act()} />);
    const pays = document.querySelector('.offers .price:not(.off)')!;
    fireEvent.mouseEnter(pays.closest('.tipwrap')!);
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toMatch(/I'll pay ₦\d+ and sell at ₦\d+/);
    fireEvent.mouseLeave(pays.closest('.tipwrap')!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('sells what you carry, with the quantity and haggle choices', () => {
    const a = act();
    render(<StallPanel stall={stall} state={withInv} act={a} />);
    const row = screen.getByText('iron').closest('tr')!;
    fireEvent.click(within(row).getByText('All'));
    expect(a.sell).toHaveBeenCalledWith('chidi', 'iron', 5, false);
    fireEvent.click(screen.getByLabelText(/Haggle/));
    fireEvent.click(within(row).getByText('Sell'));
    expect(a.sell).toHaveBeenLastCalledWith('chidi', 'iron', 5, true);
  });

  it("can't sell what you don't carry", () => {
    render(<StallPanel stall={stall} state={empty} act={act()} />);
    const row = screen.getByText('iron').closest('tr')!;
    expect((within(row).getByText('Sell') as HTMLButtonElement).disabled).toBe(true);
  });

  it('explains a closed shop and the ajo pool', () => {
    const closed = { ...stall, state: 'closed' as const, ajo: { pool: 4000, goal: 12000 } };
    render(<StallPanel stall={closed} state={state} act={act()} />);
    expect(screen.getByText(/ajo/i)).toBeTruthy();
    expect(screen.queryByText('Sell')).toBeNull();
  });

  it('warns about the fare for carrying goods to another market', () => {
    const away = { ...withInv, you: { ...withInv.you, at: 'produce' as const } };
    render(<StallPanel stall={stall} state={away} act={act()} />);
    expect(screen.getByText(/fare/i).textContent).toMatch(/₦100/);
  });
});

describe('source panel, board and hud', () => {
  it('collects from a source and disables when the vehicle is full', () => {
    const a = act();
    const { rerender } = render(<SourcePanel item="iron" state={empty} act={a} />);
    fireEvent.click(screen.getByText('Collect iron'));
    expect(a.gather).toHaveBeenCalledWith('iron');
    rerender(<SourcePanel item="iron" state={{ ...state, you: { ...state.you, carrying: 20 } }} act={a} />);
    expect((screen.getByText(/vehicle is full/i) as HTMLButtonElement).disabled).toBe(true);
  });

  it('colour-codes the price board against base, with arrows', () => {
    const board = state.board.map((b) => (b.item === 'iron' ? { ...b, price: Math.round(b.base * 0.5) } : b));
    render(<PriceBoard state={{ ...state, board }} />);
    expect(screen.getAllByText(/▼ -50%/).length).toBeGreaterThan(0);
  });

  it('shows cash, load and a shock banner; the upgrade is disabled until you can afford it', () => {
    const s = { ...state, you: { ...state.you, cash: 3000 }, shocks: [{ kind: 'rain', hoursLeft: 4 }] };
    render(<Hud state={s} act={act()} />);
    expect(screen.getAllByText('₦3,000', { exact: false }).length).toBeGreaterThanOrEqual(1); // cash (and net worth, for a new player)
    expect(screen.getByRole('status').textContent).toMatch(/Rain/);
    expect((screen.getByText(/Buy keke/) as HTMLButtonElement).disabled).toBe(true);
  });

  it('never shows wallet vocabulary anywhere', () => {
    const { container } = render(<><Hud state={state} act={act()} /><PriceBoard state={state} /><StallPanel stall={state.stalls[0]} state={state} act={act()} /></>);
    expect(container.textContent).not.toMatch(/seed|mnemonic|private key|wallet|\bgas\b|yocto|\.testnet|signature/i);
  });
});


describe('map layout', () => {
  const rects = Object.entries(STALL_POS).map(([id, [x, y]]) => ({ id, x: x - STALL_W / 2, y: y - STALL_H / 2 }));
  const overlap = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x < b.x + STALL_W && b.x < a.x + STALL_W && a.y < b.y + STALL_H && b.y < a.y + STALL_H;

  it('no two stalls overlap', () => {
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j]), `${rects[i].id} vs ${rects[j].id}`).toBe(false);
  });

  it('every stall sits inside its own market, clear of the market label', () => {
    for (const s of state.stalls) {
      const [x, y] = STALL_POS[s.id];
      const z = ZONES[s.market];
      expect(x - STALL_W / 2, s.id).toBeGreaterThanOrEqual(z.x);
      expect(x + STALL_W / 2, s.id).toBeLessThanOrEqual(z.x + z.w);
      expect(y - STALL_H / 2, s.id).toBeGreaterThanOrEqual(z.y + 52); // below the label plate
      expect(y + STALL_H / 2, s.id).toBeLessThanOrEqual(z.y + z.h);
    }
  });

  it('marks the coach target on the map', () => {
    const s = { ...state, coach: { text: 'x', focus: { kind: 'stall' as const, id: 'wale' } } };
    render(<DistrictMap state={s} selected={null} onSelect={() => {}} />);
    expect(screen.getByLabelText(/Baba Wale.*your next step/)).toBeTruthy();
    expect(screen.getAllByText('NEXT')).toHaveLength(1);
  });
});

describe('goal, next step and deals', () => {
  it('shows the goal with progress and the next step, and points at the map when asked', () => {
    const onFocus = vi.fn();
    render(<Mission state={state} onFocus={onFocus} onPickGoal={() => {}} />);
    expect(screen.getByText('Build a fortune')).toBeTruthy();
    expect(screen.getByRole('progressbar', { hidden: true }) ?? true).toBeTruthy();
    expect(screen.getByText(state.coach.text)).toBeTruthy();
    fireEvent.click(screen.getByText('Show me on the map'));
    expect(onFocus).toHaveBeenCalledWith(state.coach.focus);
  });

  it('invites the player to choose a goal when there is none', () => {
    const onPick = vi.fn();
    render(<Mission state={{ ...state, goal: null, coach: { text: 'Pick a goal', focus: null } }} onFocus={() => {}} onPickGoal={onPick} />);
    fireEvent.click(screen.getByText('Choose your goal'));
    expect(onPick).toHaveBeenCalled();
  });

  it('celebrates a finished goal', () => {
    render(<Mission state={{ ...state, goal: { ...state.goal!, done: true, progress: 1 } }} onFocus={() => {}} onPickGoal={() => {}} />);
    expect(screen.getByText('Goal reached!')).toBeTruthy();
    expect(screen.getByText('Pick a new goal')).toBeTruthy();
  });

  it('lists the best deals with where to get and where to sell', () => {
    const onFocus = vi.fn();
    render(<Deals deals={state.deals} onFocus={onFocus} />);
    const d = state.deals[0];
    fireEvent.click(screen.getAllByText('Where to sell')[0]);
    expect(onFocus).toHaveBeenCalledWith({ kind: 'stall', id: d.to.id });
    expect(screen.getAllByText(/each/).length).toBe(state.deals.length);
  });

  it('explains the game in the how-to-play dialog', () => {
    const onClose = vi.fn();
    render(<HowToPlay onClose={onClose} />);
    expect(screen.getByRole('dialog').textContent).toMatch(/Buy low, sell high/);
    expect(screen.getByRole('dialog').textContent).toMatch(/Pick a goal/);
    fireEvent.click(screen.getByText('Start trading'));
    expect(onClose).toHaveBeenCalled();
  });

  it('lets the player choose from three goals', () => {
    const onPick = vi.fn();
    render(<GoalPicker goals={state.goals} onPick={onPick} onClose={() => {}} />);
    expect(screen.getAllByRole('button').filter((b) => b.className.includes('goalopt'))).toHaveLength(3);
    fireEvent.click(screen.getByText('Keep the district alive'));
    expect(onPick).toHaveBeenCalledWith('district');
  });
});


describe('illustrated map', () => {
  it('draws more crates the more a stall holds, so a flooded stall visibly overflows', () => {
    expect(crateCount(0, 60)).toBe(0);
    expect(crateCount(10, 60)).toBe(1);
    expect(crateCount(40, 60)).toBe(2);
    expect(crateCount(60, 60)).toBe(3);
    expect(crateCount(140, 60)).toBe(4);
    const counts = [0, 10, 40, 60, 140].map((s) => crateCount(s, 60));
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('is bright by day, dark at night, and warm at dawn and dusk', () => {
    expect(lightAt(12).opacity).toBe(0);
    expect(lightAt(2).opacity).toBeGreaterThanOrEqual(0.4);
    expect(lightAt(18).opacity).toBeGreaterThan(0);
    expect(lightAt(18).opacity).toBeLessThan(lightAt(2).opacity);
    expect(lightAt(36)).toEqual(lightAt(12)); // wraps around the day
    for (let h = 0; h < 24; h++) expect(() => lightAt(h)).not.toThrow();
  });

  it('puts the shutters down on a closed stall and says so in words', () => {
    const s = { ...state, stalls: state.stalls.map((x) => (x.id === 'chidi' ? { ...x, state: 'closed' as const } : x)) };
    const { container } = render(<DistrictMap state={s} selected={null} onSelect={() => {}} />);
    expect(screen.getByLabelText(/Chidi Iron Works, Closed/)).toBeTruthy();
    expect(container.textContent).toContain('✕ Closed');
  });

  it('shows a low-cash badge and wording on a struggling stall', () => {
    const s = { ...state, stalls: state.stalls.map((x) => (x.id === 'wale' ? { ...x, state: 'struggling' as const } : x)) };
    const { container } = render(<DistrictMap state={s} selected={null} onSelect={() => {}} />);
    expect(container.textContent).toContain('Low on cash');
  });

  it('lets the merchant speak in a bubble that names them', () => {
    const stall = state.stalls.find((x) => x.id === 'chidi')!;
    render(<StallPanel stall={stall} state={withInv} act={act()} />);
    const price = document.querySelector('.offers .price:not(.off)')!;
    fireEvent.focus(price.closest('.tipwrap')!);
    expect(screen.getByRole('tooltip').textContent).toContain('Chidi Iron Works says');
  });
});
