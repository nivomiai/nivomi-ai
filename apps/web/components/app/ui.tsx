import Link from 'next/link';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Icon, Logo } from '@/components/marketing/primitives';
import type { IconName } from '@/lib/site/icons';
import { cx } from '@/lib/site/cx';
import { ROLE_LABELS, type Role } from '@/lib/api/types';
import { Select, type SelectOption } from './Select';

const INPUT =
  'mt-1.5 w-full rounded-[12px] border bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-muted/70 transition-colors focus:border-pink focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-tint disabled:opacity-60';

export function Field({
  id,
  label,
  hint,
  error,
  className,
  leading,
  trailing,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
  /** Decorative icon inside the input, before the text. */
  readonly leading?: ReactNode;
  /** Control inside the input, after the text (e.g. a show-password toggle). */
  readonly trailing?: ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  const field = (
    <input
      id={id}
      name={id}
      {...input}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy || undefined}
      className={cx(
        INPUT,
        error ? 'border-[#d33] dark:border-[#ff7a7a]' : 'border-line',
        leading ? 'pl-12' : null,
        trailing ? 'pr-12' : null,
      )}
    />
  );
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {leading || trailing ? (
        <div className="relative">
          {field}
          {leading ? (
            <span className="pointer-events-none absolute top-1/2 left-4 mt-[3px] -translate-y-1/2 text-ink-2">
              {leading}
            </span>
          ) : null}
          {trailing ? (
            <span className="absolute top-1/2 right-2 mt-[3px] -translate-y-1/2">{trailing}</span>
          ) : null}
        </div>
      ) : (
        field
      )}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-[#b42318] dark:text-[#ff9b9b]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const selectClass = cx(INPUT, 'border-line');

/** Form-level error, announced to assistive technology. */
export function FormAlert({ message }: { readonly message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[12px] bg-warn-soft px-4 py-3 text-sm text-warn">
      {message}
    </p>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  readonly tone?: 'info' | 'success' | 'warn';
  readonly children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cx(
        'rounded-[14px] border px-4 py-3 text-sm',
        tone === 'success' && 'border-live/25 bg-live-soft text-live',
        tone === 'warn' && 'border-warn/25 bg-warn-soft text-warn',
        tone === 'info' && 'border-line bg-soft text-ink-2',
      )}
    >
      {children}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingLabel = 'Please wait…',
  className,
  form,
}: {
  readonly pending: boolean;
  readonly children: ReactNode;
  readonly pendingLabel?: string;
  readonly className?: string;
  /** Submits a form elsewhere in the DOM (e.g. a dialog footer button). */
  readonly form?: string;
}) {
  return (
    <button
      type="submit"
      form={form}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cx('btn btn-primary w-full disabled:cursor-wait disabled:opacity-70', className)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Centered card used by every sign-in, sign-up and recovery screen. */
export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  readonly title: string;
  readonly intro?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <div className="w-full max-w-[440px]">
      <div className="card-nv p-7 shadow-md sm:p-9">
        <h1 className="text-[28px] tracking-[-0.03em] text-ink">{title}</h1>
        {intro ? <div className="mt-3 text-[15px] leading-relaxed text-muted">{intro}</div> : null}
        <div className="mt-7">{children}</div>
      </div>
      {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
    </div>
  );
}

export function AuthFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div className="hero-glow flex min-h-dvh flex-col">
      <header className="container-nv flex h-20 items-center">
        {/* The homepage is a static page, not a Next.js route: a full page load. */}
        <a href="/" aria-label="Nivomi AI home" className="rounded-lg">
          <Logo />
        </a>
      </header>
      <main id="main" className="container-nv grid flex-1 place-items-center pb-20">
        {children}
      </main>
    </div>
  );
}

export function TextLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <Link href={href} className="font-semibold text-accent underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] tracking-[-0.03em] text-ink sm:text-[32px]">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[15px] text-muted">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const hasHeader = Boolean(title ?? description ?? action);
  return (
    <section className={cx('card-nv p-5 sm:p-7', className)}>
      {hasHeader ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-lg tracking-[-0.02em] text-ink">{title}</h2> : null}
            {description ? <p className="mt-1.5 text-sm text-muted">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={hasHeader ? 'mt-5' : undefined}>{children}</div>
    </section>
  );
}

export function RoleBadge({ role }: { readonly role: Role }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        role === 'CUSTOM_PLAN'
          ? 'border-accent-tint bg-accent-soft text-accent'
          : 'border-line bg-soft text-ink-2',
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-[16px] border border-dashed border-line px-6 py-10 text-center">
      <span className="icon-tile">
        <Icon name={icon} />
      </span>
      <p className="mt-4 font-semibold text-ink">{title}</p>
      {children ? <div className="mt-1.5 max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { readonly label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-3">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-[12px] bg-soft" aria-hidden="true" />
      ))}
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-[14px] border border-warn/25 bg-warn-soft px-4 py-4 text-sm text-warn"
    >
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 font-semibold underline underline-offset-4"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

type BadgeTone = 'neutral' | 'accent' | 'live' | 'warn' | 'soon';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-soft text-ink-2',
  accent: 'border-accent-tint bg-accent-soft text-accent',
  live: 'border-live/25 bg-live-soft text-live',
  warn: 'border-warn/25 bg-warn-soft text-warn',
  soon: 'border-soon/25 bg-soon-soft text-soon',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  hint,
  className,
  disabled,
  placeholder,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly hint?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  /** Shown when `value` matches no option. */
  readonly placeholder?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled}
        {...(placeholder ? { placeholder } : {})}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A labelled number for summaries (import preview, sync results). */
export function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: 'neutral' | 'live' | 'warn';
}) {
  return (
    <div className="rounded-[14px] border border-line bg-card px-4 py-3">
      <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">{label}</p>
      <p
        className={cx(
          'mt-1 text-2xl font-extrabold tracking-[-0.02em]',
          tone === 'live' ? 'text-live' : tone === 'warn' ? 'text-warn' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  );
}
