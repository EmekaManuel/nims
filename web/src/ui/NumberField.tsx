import { useEffect, useState } from 'react';

/**
 * A whole-number field that behaves the way people expect.
 *  - You can clear it and type a new number. It only snaps into range when you leave the field or press Enter.
 *  - Only digits can be typed.
 *  - Up and Down arrows step it. The − and + buttons do too.
 *  - Clicking in selects the number, so typing replaces it.
 * (A native <input type="number"> clamped on every keystroke, so you couldn't delete the last digit.)
 */
export function NumberField({ id, value, onValueChange, min = 0, max = 1_000_000, step = 1, 'aria-label': ariaLabel, className = '', steppers = true }: {
  id?: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  'aria-label'?: string;
  className?: string;
  steppers?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Follow the real value, unless you are in the middle of typing.
  useEffect(() => { if (!focused) setDraft(String(value)); }, [value, focused]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const commit = (text: string) => {
    const n = parseInt(text, 10);
    const next = Number.isFinite(n) ? clamp(n) : clamp(value);
    onValueChange(next);
    setDraft(String(next));
  };
  const bump = (dir: 1 | -1) => {
    const n = parseInt(draft, 10);
    const next = clamp((Number.isFinite(n) ? n : value) + dir * step);
    onValueChange(next);
    setDraft(String(next));
  };

  // Pressing − or + must not pull focus out of the field, or the arrow keys would stop working.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <span className={`numfield ${className}`}>
      {steppers && <button type="button" className="stepper" tabIndex={-1} aria-label={`Decrease${ariaLabel ? ` ${ariaLabel}` : ''}`} disabled={value <= min} onMouseDown={keepFocus} onClick={() => bump(-1)}>−</button>}
      <input
        id={id}
        className="numfield-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => {
          const text = e.target.value.replace(/\D/g, '');
          setDraft(text);
          const n = parseInt(text, 10);
          if (Number.isFinite(n) && n >= min && n <= max) onValueChange(n); // out-of-range waits until you finish typing
        }}
        onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
        onBlur={() => { setFocused(false); commit(draft); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); bump(1); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1); }
          else if (e.key === 'Enter') commit(draft);
        }}
      />
      {steppers && <button type="button" className="stepper" tabIndex={-1} aria-label={`Increase${ariaLabel ? ` ${ariaLabel}` : ''}`} disabled={value >= max} onMouseDown={keepFocus} onClick={() => bump(1)}>+</button>}
    </span>
  );
}
