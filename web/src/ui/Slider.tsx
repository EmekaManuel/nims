import * as RSlider from '@radix-ui/react-slider';

/** A single-value slider (Radix): drag, click the track, or use the arrow, Home, End and Page keys. */
export function Slider({ value, min, max, step = 1, onValueChange, 'aria-label': ariaLabel, valueText, id, className = '' }: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  'aria-label': string;
  /** What a screen reader should say for the current value, e.g. "Day 3, 14:00". */
  valueText?: string;
  id?: string;
  className?: string;
}) {
  return (
    <RSlider.Root className={`rx-slider ${className}`} value={[value]} min={min} max={max} step={step} onValueChange={(v) => onValueChange(v[0])}>
      <RSlider.Track className="rx-track"><RSlider.Range className="rx-range" /></RSlider.Track>
      <RSlider.Thumb id={id} className="rx-thumb" aria-label={ariaLabel} aria-valuetext={valueText} />
    </RSlider.Root>
  );
}
