'use client';

/** In-field icons and the show/hide toggle used by the sign-in and sign-up forms. */

const SVG_PROPS = {
  'aria-hidden': true,
  focusable: false,
  viewBox: '0 0 24 24',
  className: 'size-5',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function LockIcon() {
  return (
    <svg {...SVG_PROPS}>
      <rect x="5" y="10.5" width="14" height="10.5" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <path d="M12 14.5v2.5" />
    </svg>
  );
}

export function PasswordToggle({
  controls,
  visible,
  onToggle,
}: {
  readonly controls: string;
  readonly visible: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={visible ? 'Hide' : 'Show'}
      aria-controls={controls}
      aria-pressed={visible}
      onClick={onToggle}
      className="grid size-9 place-items-center rounded-lg text-ink-2 transition-colors hover:text-ink"
    >
      <svg {...SVG_PROPS}>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        {visible ? null : <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}
