import { useId, useState } from 'react';

/** Hover, focus or tap a price to read the merchant's own reasoning for it. */
export function Tip({ text, children }: { text: string; children: React.ReactNode }) {
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
        <span role="tooltip" id={id} className="tip">
          “{text}”
        </span>
      )}
    </span>
  );
}
