// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import fixture from './fixture.json';
import type { GameState } from './api';
import { DistrictMap } from './Map';
import { Hud } from './Hud';
import { PriceBoard } from './PriceBoard';
import { StallPanel, SourcePanel, Actions } from './Panels';

afterEach(cleanup);
const state = fixture as unknown as GameState;
const act = (): Actions => ({ sell: vi.fn(), buy: vi.fn(), gather: vi.fn(), upgrade: vi.fn() });
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
    const pays = screen.getAllByText(/^₦\d/)[0];
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
    render(<StallPanel stall={stall} state={state} act={act()} />);
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
    const { rerender } = render(<SourcePanel item="iron" state={state} act={a} />);
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
    expect(screen.getByText('₦3,000', { exact: false })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Rain/);
    expect((screen.getByText(/Buy keke/) as HTMLButtonElement).disabled).toBe(true);
  });

  it('never shows wallet vocabulary anywhere', () => {
    const { container } = render(<><Hud state={state} act={act()} /><PriceBoard state={state} /><StallPanel stall={state.stalls[0]} state={state} act={act()} /></>);
    expect(container.textContent).not.toMatch(/seed|mnemonic|private key|wallet|\bgas\b|yocto|\.testnet|signature/i);
  });
});
