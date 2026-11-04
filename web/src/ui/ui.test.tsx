// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox, Field, NumberField, Select, Slider, TextField } from './index';

afterEach(cleanup);

function Num(props: { min?: number; max?: number; step?: number; start?: number; spy?: (n: number) => void; steppers?: boolean }) {
  const [v, setV] = useState(props.start ?? 5);
  return <NumberField aria-label="Amount" value={v} min={props.min} max={props.max} step={props.step} steppers={props.steppers} onValueChange={(n) => { setV(n); props.spy?.(n); }} />;
}
const box = () => screen.getByLabelText('Amount') as HTMLInputElement;

describe('NumberField', () => {
  it('lets you clear the field and type a new number (the old field snapped back on every keystroke)', async () => {
    const user = userEvent.setup();
    render(<Num min={1} max={999} start={5} />);
    await user.click(box());
    await user.keyboard('{Backspace}'); // the old field would have jumped straight back to 1
    expect(box().value).toBe('');
    await user.keyboard('42');
    expect(box().value).toBe('42');
  });

  it('selects the number when you click in, so typing replaces it', async () => {
    const user = userEvent.setup();
    render(<Num min={1} max={999} start={5} />);
    await user.click(box());
    await user.keyboard('77');
    expect(box().value).toBe('77');
  });

  it('only accepts digits', async () => {
    const user = userEvent.setup();
    render(<Num min={1} max={999} start={5} />);
    await user.click(box());
    await user.keyboard('1a2-.e3');
    expect(box().value).toBe('123');
  });

  it('waits for you to finish before snapping an out-of-range number into range', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<><Num min={100} max={500} start={200} spy={spy} /><button>elsewhere</button></>);
    await user.click(box());
    await user.keyboard('{Backspace}{Backspace}{Backspace}5'); // "5" is below the minimum while you are still typing
    expect(box().value).toBe('5');
    expect(spy).not.toHaveBeenCalledWith(5);
    await user.click(screen.getByText('elsewhere')); // leaving the field commits
    expect(box().value).toBe('100');
    expect(spy).toHaveBeenLastCalledWith(100);
  });

  it('clamps a too-big number to the maximum on leaving, and an empty field back to the last good value', async () => {
    const user = userEvent.setup();
    render(<><Num min={1} max={50} start={20} /><button>elsewhere</button></>);
    await user.click(box());
    await user.keyboard('999');
    await user.click(screen.getByText('elsewhere'));
    expect(box().value).toBe('50');
    await user.click(box());
    await user.keyboard('{Backspace}{Backspace}');
    await user.click(screen.getByText('elsewhere'));
    expect(box().value).toBe('50'); // empty is not a number: it keeps what it had
  });

  it('commits on Enter', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Num min={100} max={500} start={200} spy={spy} />);
    await user.click(box());
    await user.keyboard('3{Enter}');
    expect(box().value).toBe('100');
    expect(spy).toHaveBeenLastCalledWith(100);
  });

  it('steps with the arrow keys and the buttons, stays in range, and disables the buttons at the ends', async () => {
    const user = userEvent.setup();
    render(<Num min={0} max={3} step={1} start={2} />);
    await user.click(box());
    await user.keyboard('{ArrowUp}');
    expect(box().value).toBe('3');
    await user.keyboard('{ArrowUp}'); // already at the top
    expect(box().value).toBe('3');
    expect((screen.getByRole('button', { name: 'Increase Amount' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Decrease Amount' }));
    expect(box().value).toBe('2');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(box().value).toBe('0');
    expect((screen.getByRole('button', { name: 'Decrease Amount' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('steps by the step size', async () => {
    const user = userEvent.setup();
    render(<Num min={0} max={1000} step={100} start={300} />);
    await user.click(screen.getByRole('button', { name: 'Increase Amount' }));
    expect(box().value).toBe('400');
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Increase Amount' })); // the button never takes focus
  });

  it('can hide the buttons', () => {
    render(<Num steppers={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not overwrite what you are typing when the value is refreshed from outside', async () => {
    const user = userEvent.setup();
    function Refreshing() {
      const [v, setV] = useState(10);
      return <><NumberField aria-label="Amount" value={v} onValueChange={setV} /><button onClick={() => setV(99)}>refresh</button></>;
    }
    render(<Refreshing />);
    await user.click(box());
    await user.keyboard('{Backspace}{Backspace}7');
    fireEvent.click(screen.getByText('refresh')); // a poll updates the value mid-typing
    expect(box().value).toBe('7');
  });
});

describe('Select', () => {
  const options = [3, 7, 14].map((d) => ({ value: String(d), label: `${d} days` }));
  function Pick({ spy }: { spy?: (v: string) => void }) {
    const [v, setV] = useState('7');
    return <Field label="Length" htmlFor="len"><Select id="len" value={v} onValueChange={(x) => { setV(x); spy?.(x); }} options={options} /></Field>;
  }

  it('shows the current choice and is named by its label', () => {
    render(<Pick />);
    const trigger = screen.getByLabelText('Length');
    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(trigger.textContent).toContain('7 days');
  });

  it('opens on click, lists every option, and picks one', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Pick spy={spy} />);
    await user.click(screen.getByLabelText('Length'));
    const items = await screen.findAllByRole('option');
    expect(items.map((i) => i.textContent)).toEqual(['3 days', '7 days', '14 days']);
    await user.click(screen.getByRole('option', { name: '14 days' }));
    expect(spy).toHaveBeenCalledWith('14');
    expect(screen.getByLabelText('Length').textContent).toContain('14 days');
  });

  it('works from the keyboard: open, move, choose', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Pick spy={spy} />);
    screen.getByLabelText('Length').focus();
    await user.keyboard('{Enter}');
    await screen.findAllByRole('option');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(spy).toHaveBeenCalledWith('14');
  });

  it('clicking the label opens the select, like a native one', async () => {
    const user = userEvent.setup();
    render(<Pick />);
    await user.click(screen.getByText('Length'));
    expect((await screen.findAllByRole('option')).length).toBe(3);
  });

  it('shows which option is chosen, and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Pick />);
    await user.click(screen.getByLabelText('Length'));
    expect(screen.getByRole('option', { name: '7 days' }).getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Escape}');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});

describe('Checkbox', () => {
  function Check({ spy }: { spy?: (v: boolean) => void }) {
    const [on, setOn] = useState(false);
    return <Checkbox id="c" checked={on} onCheckedChange={(v) => { setOn(v); spy?.(v); }}>Haggle</Checkbox>;
  }

  it('toggles from the box, from its label, and from the keyboard', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Check spy={spy} />);
    const box = screen.getByRole('checkbox', { name: 'Haggle' });
    expect(box.getAttribute('aria-checked')).toBe('false');
    await user.click(box);
    expect(box.getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByText('Haggle'));
    expect(box.getAttribute('aria-checked')).toBe('false');
    box.focus();
    await user.keyboard(' ');
    expect(box.getAttribute('aria-checked')).toBe('true');
    expect(spy.mock.calls.map((c) => c[0])).toEqual([true, false, true]);
  });
});

describe('Slider', () => {
  function Time({ spy }: { spy?: (v: number) => void }) {
    const [v, setV] = useState(10);
    return <Slider aria-label="Time" valueText={`Hour ${v}`} value={v} min={0} max={100} onValueChange={(x) => { setV(x); spy?.(x); }} />;
  }

  it('is a labelled slider that says its value in words', () => {
    render(<Time />);
    const s = screen.getByRole('slider', { name: 'Time' });
    expect(s.getAttribute('aria-valuenow')).toBe('10');
    expect(s.getAttribute('aria-valuetext')).toBe('Hour 10');
  });

  it('moves with the arrow, page, Home and End keys', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Time spy={spy} />);
    const s = screen.getByRole('slider', { name: 'Time' });
    s.focus();
    await user.keyboard('{ArrowRight}');
    expect(s.getAttribute('aria-valuenow')).toBe('11');
    await user.keyboard('{End}');
    expect(s.getAttribute('aria-valuenow')).toBe('100');
    await user.keyboard('{Home}');
    expect(s.getAttribute('aria-valuenow')).toBe('0');
    expect(spy).toHaveBeenLastCalledWith(0);
  });
});

describe('TextField', () => {
  it('ties the label to the input, so clicking the label focuses it', async () => {
    const user = userEvent.setup();
    render(<TextField label="Your email" value="" onChange={() => {}} type="email" />);
    await user.click(screen.getByText('Your email'));
    expect(document.activeElement).toBe(screen.getByLabelText('Your email'));
  });

  it('reports typing', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<TextField label="Name" value="" onChange={spy} />);
    await user.type(screen.getByLabelText('Name'), 'a');
    expect(spy).toHaveBeenCalledWith('a');
  });

  it('announces an error, and marks the input invalid and described by it', () => {
    render(<TextField label="Your email" value="x" onChange={() => {}} error="Enter a valid email address." />);
    const input = screen.getByLabelText('Your email');
    expect(screen.getByRole('alert').textContent).toBe('Enter a valid email address.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });

  it('shows a hint when there is no error', () => {
    render(<TextField label="Name" value="" onChange={() => {}} hint="Shown on signs" />);
    const input = screen.getByLabelText('Name');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.getElementById(input.getAttribute('aria-describedby')!)!.textContent).toBe('Shown on signs');
  });
});
