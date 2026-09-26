import type { CSSProperties, ReactNode } from 'react';
import { siteConfig } from '@/lib/site/config';
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

type BadgeVariant = 'mvp' | 'soon' | 'preview';

const BADGE_STYLES: Record<BadgeVariant, string> = {
  mvp: 'border-live/25 bg-live-soft text-live',
  soon: 'border-soon/25 bg-soon-soft text-soon',
  preview: 'border-warn/25 bg-warn-soft text-warn',
};

const BADGE_TEXT: Record<BadgeVariant, string> = {
  mvp: siteConfig.mvpStatusLabel,
  soon: 'Coming soon',
  preview: 'Preview · Illustration',
};

/** Availability badge. MVP capabilities and future products must always be visibly distinct. */
export function StatusBadge({
  variant,
  label,
  className,
}: {
  readonly variant: BadgeVariant;
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <span
      data-status={variant}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none font-bold tracking-[0.08em] whitespace-nowrap uppercase',
        BADGE_STYLES[variant],
        className,
      )}
    >
      {variant === 'mvp' && (
        <span aria-hidden="true" className="nv-live-dot size-1.5 rounded-full bg-current" />
      )}
      {variant === 'soon' && <Icon name="i-clock" className="size-3" />}
      {label ?? BADGE_TEXT[variant]}
    </span>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  lede,
  center = false,
  tone = 'plain',
  className,
  children,
}: {
  readonly id: string;
  readonly eyebrow?: string;
  readonly title: ReactNode;
  readonly lede?: ReactNode;
  readonly center?: boolean;
  readonly tone?: 'plain' | 'soft';
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cx('section-nv', tone === 'soft' && 'border-y border-line-2 bg-soft', className)}
    >
      <div className="container-nv">
        <header className={cx('mb-12 max-w-3xl md:mb-16', center && 'mx-auto text-center')}>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id={`${id}-title`} className="h2-nv mt-4 text-ink">
            {title}
          </h2>
          {lede && <p className={cx('lede mt-5', center && 'mx-auto')}>{lede}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}

/**
 * Numbered, left-to-right (top-to-bottom on small screens) workflow. With `animated`, a slow
 * CSS-only highlight moves through the steps (disabled under reduced motion).
 */
export function FlowDiagram({
  steps,
  label,
  animated = false,
  orientation = 'responsive',
  className,
}: {
  readonly steps: readonly string[];
  readonly label: string;
  readonly animated?: boolean;
  /** `responsive`: vertical on small screens, horizontal from `md`. `vertical`: always stacked. */
  readonly orientation?: 'responsive' | 'vertical';
  readonly className?: string;
}) {
  const horizontal = orientation === 'responsive';
  const stepSeconds = 1.4;
  const cycle = steps.length * stepSeconds;
  return (
    <ol
      aria-label={label}
      className={cx(
        'flex flex-col items-stretch gap-2',
        horizontal && 'md:flex-row md:flex-wrap md:items-center',
        className,
      )}
    >
      {steps.map((step, index) => (
        <li
          key={step}
          className={cx('flex flex-col items-center gap-2', horizontal && 'md:flex-row')}
        >
          <span
            className={cx(
              'w-full rounded-md border border-line bg-card px-4 py-2.5 text-center text-sm font-semibold text-ink shadow-sm',
              horizontal && 'md:w-auto',
              animated && 'nv-step-anim',
            )}
            style={
              animated
                ? ({
                    '--nv-cycle': `${cycle}s`,
                    '--nv-delay': `${index * stepSeconds}s`,
                  } as CSSProperties)
                : undefined
            }
          >
            <span className="mr-2 font-mono text-xs text-accent">
              {String(index + 1).padStart(2, '0')}
            </span>
            {step}
          </span>
          {index < steps.length - 1 && (
            <Icon
              name="i-arrow"
              className={cx('size-4 rotate-90 text-muted', horizontal && 'md:rotate-0')}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

export function FeatureCard({
  icon,
  title,
  body,
  badge,
  className,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
  readonly badge?: ReactNode;
  readonly className?: string;
}) {
  return (
    <article
      className={cx(
        'card-nv nv-reveal flex h-full flex-col gap-4 p-6 transition-colors hover:border-line-hover',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="icon-tile">
          <Icon name={icon} />
        </span>
        {badge}
      </div>
      <h3 className="text-lg text-ink">{title}</h3>
      <p className="text-[15px] leading-relaxed text-muted">{body}</p>
    </article>
  );
}

export function CheckList({
  items,
  className,
}: {
  readonly items: readonly string[];
  readonly className?: string;
}) {
  return (
    <ul className={cx('grid gap-3', className)}>
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-ink-2">
          <span className="mt-0.5 inline-grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <Icon name="i-check" className="size-3.5" />
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}
