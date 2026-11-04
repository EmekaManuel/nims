import * as RLabel from '@radix-ui/react-label';

/** A label sitting beside (or above) any control. The label points at the control by id, so clicking it focuses the control. */
export function Field({ label, htmlFor, children, className = '' }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={`field ${className}`}>
      <RLabel.Root htmlFor={htmlFor} className="rx-label">{label}</RLabel.Root>
      {children}
    </span>
  );
}
