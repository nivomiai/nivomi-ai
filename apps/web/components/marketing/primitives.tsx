import { cx } from '@/lib/site/cx';
import type { IconName } from '@/lib/site/icons';

const FILLED_ICONS: ReadonlySet<IconName> = new Set(['i-wa', 'i-wa-mono']);

/** Icon from the Nivomi icon set (`public/brand/icons.svg`). Always decorative. */
export function Icon({
  name,
  className,
}: {
  readonly name: IconName;
  readonly className?: string;
}) {
  const filled = FILLED_ICONS.has(name);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cx('size-5 shrink-0', className)}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <use href={`/brand/icons.svg#${name}`} />
    </svg>
  );
}

export function LogoMark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="150 40 1660 1262"
      aria-hidden="true"
      focusable="false"
      className={cx('text-pink', className)}
    >
      <path
        fill="currentColor"
        d="M157 1299 1410 42v1043h183V383h212v916h-607V556L671 1085h398v214z"
      />
      <path fill="currentColor" d="M1593 42h212v213h-212z" />
    </svg>
  );
}

export function Logo({
  tone = 'default',
  className,
}: {
  /** `light` for dark backgrounds that do not follow the theme (e.g. the plum footer). */
  readonly tone?: 'default' | 'light';
  readonly className?: string;
}) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={cx('h-6 w-auto', tone === 'light' && '!text-pink-light')} />
      <span
        className={cx(
          'font-brand text-[19px] leading-none font-bold tracking-[-0.01em]',
          tone === 'light' ? 'text-white' : 'text-ink',
        )}
      >
        NIVOMI <span className={tone === 'light' ? 'text-pink-light' : 'text-accent'}>AI</span>
      </span>
    </span>
  );
}
