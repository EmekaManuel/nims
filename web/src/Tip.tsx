import { useId, useState } from 'react';

/**
 * Hover, focus or tap a price and the merchant answers in their own words, in a speech bubble.
 * `who` is the stall's name; `text` is the reasoning from pricing.ts.
 */
export function Tip({ who, text, children }: { who: string; text: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="tipwrap"
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
    >
      {children}
      {open && (
        <span role="tooltip" id={id} className="bubble">
          <span className="who">{who} says</span>
          “{text}”
        </span>
      )}
    </span>
  );
}
