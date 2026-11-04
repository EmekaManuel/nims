import * as RSelect from '@radix-ui/react-select';

export interface Option {
  value: string;
  label: string;
}

const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Tick = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/**
 * A dropdown built on Radix Select: keyboard control, type-ahead, screen-reader roles and focus
 * handling come from Radix; the look comes from the .rx-* styles. Values are strings (Radix's rule),
 * so convert numbers at the call site.
 */
export function Select({ id, value, onValueChange, options, 'aria-label': ariaLabel, className = '' }: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  'aria-label'?: string;
  className?: string;
}) {
  return (
    <RSelect.Root value={value} onValueChange={onValueChange}>
      <RSelect.Trigger id={id} className={`rx-trigger ${className}`} aria-label={ariaLabel}>
        <RSelect.Value />
        <RSelect.Icon className="rx-chevron"><Chevron /></RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content className="rx-content" position="popper" sideOffset={6} collisionPadding={10}>
          <RSelect.Viewport className="rx-viewport">
            {options.map((o) => (
              <RSelect.Item key={o.value} value={o.value} className="rx-item">
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className="rx-tick"><Tick /></RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
