import * as RCheckbox from '@radix-ui/react-checkbox';
import * as RLabel from '@radix-ui/react-label';

/** A labelled checkbox (Radix). Clicking the label toggles it; Space toggles it from the keyboard. */
export function Checkbox({ id, checked, onCheckedChange, children, title, className = '' }: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span className={`rx-checkrow ${className}`} title={title}>
      <RCheckbox.Root id={id} className="rx-checkbox" checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)}>
        <RCheckbox.Indicator className="rx-checkbox-mark">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      <RLabel.Root htmlFor={id} className="rx-label">{children}</RLabel.Root>
    </span>
  );
}
