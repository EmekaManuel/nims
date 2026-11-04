import * as RLabel from '@radix-ui/react-label';
import { useId } from 'react';

/** A labelled text input with an optional hint and error line (both announced to screen readers). */
export function TextField({ label, value, onChange, type = 'text', placeholder, autoComplete, required, hint, error, id }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email';
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  id?: string;
}) {
  const auto = useId();
  const fid = id ?? auto;
  const note = error ? `${fid}-err` : hint ? `${fid}-hint` : undefined;
  return (
    <div className="textfield">
      <RLabel.Root htmlFor={fid} className="rx-label strong">{label}</RLabel.Root>
      <input
        id={fid}
        className={`rx-input ${error ? 'invalid' : ''}`}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={note}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <p id={`${fid}-err`} className="field-error" role="alert">{error}</p> : hint ? <p id={`${fid}-hint`} className="muted small">{hint}</p> : null}
    </div>
  );
}
