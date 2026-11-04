/** Nim, the friendly guide. A round little character with a coin on its head. Decorative: the words beside it carry the meaning. */
export function Mascot({ size = 56, mood = 'happy' }: { size?: number; mood?: 'happy' | 'cheer' }) {
  return (
    <svg className="mascot" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <ellipse cx="32" cy="58" rx="16" ry="3.5" fill="#14253d" opacity=".18" />
      <circle cx="32" cy="35" r="23" fill="#3b9dff" />
      <circle cx="32" cy="35" r="23" fill="none" stroke="#1f6fd6" strokeWidth="2" />
      <ellipse cx="24" cy="24" rx="8" ry="5" fill="#8cc8ff" opacity=".7" transform="rotate(-25 24 24)" />
      <circle cx="24.5" cy="34" r="5.6" fill="#fff" /><circle cx="39.5" cy="34" r="5.6" fill="#fff" />
      <circle cx="25.5" cy="34.5" r="2.8" fill="#14253d" /><circle cx="38.5" cy="34.5" r="2.8" fill="#14253d" />
      <circle cx="26.3" cy="33.5" r="1" fill="#fff" /><circle cx="39.3" cy="33.5" r="1" fill="#fff" />
      <circle cx="17.5" cy="42" r="3.2" fill="#ff8fa8" opacity=".75" /><circle cx="46.5" cy="42" r="3.2" fill="#ff8fa8" opacity=".75" />
      {mood === 'cheer'
        ? <path d="M25 44c2 5 12 5 14 0z" fill="#14253d" />
        : <path d="M26.5 44.500c2.5 3 8.5 3 11 0" fill="none" stroke="#14253d" strokeWidth="2.2" strokeLinecap="round" />}
      <circle cx="32" cy="9.5" r="7" fill="#ffc21a" stroke="#c98700" strokeWidth="1.6" />
      <circle cx="32" cy="9.5" r="4.2" fill="none" stroke="#e8a300" strokeWidth="1.2" />
      <path d="M30 12V7l4 5V7" fill="none" stroke="#a86f00" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
