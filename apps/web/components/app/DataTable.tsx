'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/marketing/primitives';
import { formatNumber } from '@/lib/app/format';
import type { IconName } from '@/lib/site/icons';
import { cx } from '@/lib/site/cx';
import { Select } from './Select';

/*
 * The data-table kit every list screen uses: search, status pills, selection, sortable headers,
 * a row ⋯ menu and numbered pagination. Screens own the data and the API calls.
 */

// ── Search ───────────────────────────────────────────────────────────────

export function SearchInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  readonly id: string;
  /** Accessible name; the field shows only the placeholder. */
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly className?: string;
}) {
  return (
    <div className={cx('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[12px] border border-line bg-surface py-3 pr-4 pl-12 text-[15px] text-ink placeholder:text-muted/80 focus:border-pink focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-tint"
      />
    </div>
  );
}

// ── Status pill ──────────────────────────────────────────────────────────

export type PillTone = 'live' | 'warn' | 'accent' | 'info' | 'soon' | 'neutral' | 'danger';

const PILL: Record<PillTone, { pill: string; dot: string }> = {
  live: { pill: 'bg-live-soft text-live', dot: 'bg-live' },
  warn: { pill: 'bg-warn-soft text-warn', dot: 'bg-warn' },
  accent: { pill: 'bg-accent-soft text-accent', dot: 'bg-pink-2' },
  info: { pill: 'bg-info/10 text-info', dot: 'bg-info' },
  soon: { pill: 'bg-soon-soft text-soon', dot: 'bg-soon' },
  neutral: { pill: 'bg-soft text-ink-2 border border-line', dot: 'bg-muted' },
  danger: {
    pill: 'bg-[#fdecec] text-[#b42318] dark:bg-[#ff7a7a1f] dark:text-[#ff9b9b]',
    dot: 'bg-[#d33] dark:bg-[#ff7a7a]',
  },
};

/** Rounded status label with a coloured dot, as in the leads table. */
export function StatusPill({
  tone = 'neutral',
  children,
}: {
  readonly tone?: PillTone;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold whitespace-nowrap',
        PILL[tone].pill,
      )}
    >
      <span aria-hidden="true" className={cx('size-1.5 rounded-full', PILL[tone].dot)} />
      {children}
    </span>
  );
}

// ── Checkbox ─────────────────────────────────────────────────────────────

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled,
}: {
  readonly checked: boolean;
  readonly indeterminate?: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Select Kabir Singh". */
  readonly label: string;
  readonly disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const on = checked || indeterminate;
  return (
    <span className="relative inline-grid size-5 place-items-center">
      <input
        ref={ref}
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={cx(
          'peer size-5 cursor-pointer appearance-none rounded-[6px] border-[1.5px] transition-colors focus-visible:ring-4 focus-visible:ring-accent-tint focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          on ? 'border-pink-2 bg-pink-2' : 'border-line-hover bg-surface hover:border-muted',
        )}
      />
      {on ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute size-3.5 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {indeterminate ? <path d="M5 10h10" /> : <path d="m4.5 10.5 3.5 3.5 7.5-8" />}
        </svg>
      ) : null}
    </span>
  );
}

// ── Action menu ──────────────────────────────────────────────────────────

export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly icon?: IconName;
  readonly disabled?: boolean;
  readonly tone?: 'danger';
}

/**
 * A button that opens a menu (WAI-ARIA menu button). The menu is portalled so table scroll
 * containers never clip it; arrows move, Enter/Space choose, Escape closes.
 */
export function ActionMenu({
  items,
  label,
  trigger,
  triggerClassName,
  align = 'end',
}: {
  readonly items: readonly MenuItem[];
  /** Accessible name for the trigger, e.g. "Actions for Kabir Singh". */
  readonly label: string;
  /** Visible trigger content; defaults to a ⋯ icon. */
  readonly trigger?: ReactNode;
  readonly triggerClassName?: string;
  readonly align?: 'start' | 'end';
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ top: number; left?: number; right?: number }>();

  const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const height = menu.current?.offsetHeight ?? items.length * 40 + 12;
      const below = window.innerHeight - rect.bottom;
      const top = below < height + 12 && rect.top > below ? rect.top - height - 6 : rect.bottom + 6;
      setPlace(
        align === 'end' ? { top, right: window.innerWidth - rect.right } : { top, left: rect.left },
      );
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    menu.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const choose = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    close();
    item.onSelect();
  };

  const step = (direction: 1 | -1) => {
    const at = enabled.indexOf(active);
    const next = enabled[(at + direction + enabled.length) % enabled.length];
    if (next !== undefined) setActive(next);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') step(1);
    else if (event.key === 'ArrowUp') step(-1);
    else if (event.key === 'Home') setActive(enabled[0] ?? 0);
    else if (event.key === 'End') setActive(enabled.at(-1) ?? 0);
    else if (event.key === 'Enter' || event.key === ' ') choose(active);
    else if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') close(false);
    else return;
    if (event.key !== 'Tab') event.preventDefault();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={trigger ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => {
          setActive(enabled[0] ?? 0);
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((e.key === 'ArrowDown' ? enabled[0] : enabled.at(-1)) ?? 0);
            setOpen(true);
          }
        }}
        className={
          triggerClassName ??
          'grid size-9 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-soft hover:text-ink'
        }
      >
        {trigger ?? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
        )}
      </button>
      {open
        ? createPortal(
            <div
              ref={menu}
              id={`${id}-menu`}
              role="menu"
              aria-label={label}
              tabIndex={-1}
              aria-activedescendant={`${id}-item-${active}`}
              onKeyDown={onMenuKeyDown}
              style={{
                top: place?.top ?? -9999,
                left: place?.left,
                right: place?.right,
              }}
              className="fixed z-[100] min-w-52 rounded-[14px] border border-line bg-card p-1.5 shadow-lg focus:outline-none"
            >
              {items.map((item, i) => (
                <div
                  key={item.label}
                  id={`${id}-item-${i}`}
                  role="menuitem"
                  aria-disabled={item.disabled || undefined}
                  onPointerMove={() => {
                    if (!item.disabled) setActive(i);
                  }}
                  onClick={() => choose(i)}
                  className={cx(
                    'flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[14px] font-medium',
                    item.tone === 'danger' ? 'text-[#b42318] dark:text-[#ff9b9b]' : 'text-ink',
                    i === active && !item.disabled && 'bg-accent-soft',
                    item.disabled && 'cursor-not-allowed opacity-45',
                  )}
                >
                  {item.icon ? <Icon name={item.icon} className="size-4 text-muted" /> : null}
                  {item.label}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// ── Table ────────────────────────────────────────────────────────────────

export interface Column<T> {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  /** Present when the API can sort by this column. */
  readonly sortKey?: string;
  readonly className?: string;
}

export interface SortState {
  readonly key: string;
  readonly order: 'asc' | 'desc';
}

/** Next sort when a header is clicked: new column ascending, same column flips. */
export function nextSort(current: SortState, key: string): SortState {
  return current.key === key
    ? { key, order: current.order === 'asc' ? 'desc' : 'asc' }
    : { key, order: 'asc' };
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  rowLabel,
  sort,
  onSort,
  selected,
  onSelectedChange,
  rowActions,
  busy = false,
  minWidth = 900,
}: {
  /** Screen-reader caption, e.g. "Leads". */
  readonly caption: string;
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  /** Names a row for checkbox and menu labels, e.g. the lead's name. */
  readonly rowLabel: (row: T) => string;
  readonly sort?: SortState;
  readonly onSort?: (key: string) => void;
  /** Pass both to show selection checkboxes. */
  readonly selected?: ReadonlySet<string>;
  readonly onSelectedChange?: (next: Set<string>) => void;
  readonly rowActions?: (row: T) => readonly MenuItem[];
  /** Dims the rows while a new page loads. */
  readonly busy?: boolean;
  readonly minWidth?: number;
}) {
  const selectable = Boolean(selected && onSelectedChange);
  const keys = rows.map(rowKey);
  const selectedHere = keys.filter((k) => selected?.has(k)).length;
  const all = rows.length > 0 && selectedHere === rows.length;

  const toggleAll = (checked: boolean) => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    for (const key of keys) {
      if (checked) next.add(key);
      else next.delete(key);
    }
    onSelectedChange(next);
  };

  const toggle = (key: string, checked: boolean) => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    onSelectedChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-[16px] border border-line">
      <table
        className={cx('w-full text-left text-sm transition-opacity', busy && 'opacity-60')}
        style={{ minWidth }}
        aria-busy={busy || undefined}
      >
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-soft">
          <tr className="border-b border-line">
            {selectable ? (
              <th scope="col" className="w-12 py-3.5 pr-2 pl-5">
                <Checkbox
                  label="Select all rows on this page"
                  checked={all}
                  indeterminate={selectedHere > 0 && !all}
                  onChange={toggleAll}
                  disabled={rows.length === 0}
                />
              </th>
            ) : null}
            {columns.map((column, i) => {
              const active = sort?.key === column.sortKey;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    column.sortKey && active
                      ? sort?.order === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={cx(
                    'py-3.5 pr-4 text-[12px] font-bold tracking-[0.08em] whitespace-nowrap text-muted uppercase',
                    i === 0 && !selectable && 'pl-5',
                    column.className,
                  )}
                >
                  {column.sortKey && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(column.sortKey ?? column.id)}
                      className={cx(
                        'group inline-flex items-center gap-1.5 rounded-md uppercase hover:text-ink',
                        active && 'text-ink',
                      )}
                    >
                      {column.header}
                      <SortIcon state={active ? sort?.order : undefined} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {rowActions ? (
              <th
                scope="col"
                className="py-3.5 pr-5 text-right text-[12px] font-bold tracking-[0.08em] text-muted uppercase"
              >
                Actions
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-card">
          {rows.map((row) => {
            const key = rowKey(row);
            const isSelected = selected?.has(key) ?? false;
            return (
              <tr
                key={key}
                className={cx(
                  'transition-colors',
                  isSelected ? 'bg-accent-soft/70' : 'hover:bg-soft/70',
                )}
              >
                {selectable ? (
                  <td className="py-4 pr-2 pl-5 align-middle">
                    <Checkbox
                      label={`Select ${rowLabel(row)}`}
                      checked={isSelected}
                      onChange={(checked) => toggle(key, checked)}
                    />
                  </td>
                ) : null}
                {columns.map((column, i) => (
                  <td
                    key={column.id}
                    className={cx(
                      'py-4 pr-4 align-middle',
                      i === 0 && !selectable && 'pl-5',
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
                {rowActions ? (
                  <td className="py-4 pr-4 text-right align-middle">
                    <ActionMenu items={rowActions(row)} label={`Actions for ${rowLabel(row)}`} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortIcon({ state }: { readonly state: 'asc' | 'desc' | undefined }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 16"
      className="h-3.5 w-2.5 shrink-0"
      fill="currentColor"
    >
      <path d="M6 1 10 6H2z" className={state === 'asc' ? 'opacity-100' : 'opacity-35'} />
      <path d="M6 15 2 10h8z" className={state === 'desc' ? 'opacity-100' : 'opacity-35'} />
    </svg>
  );
}

/** An icon and muted text, for cells such as "📞 +91 98470 00103". */
export function IconCell({
  icon,
  children,
}: {
  readonly icon: IconName;
  readonly children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap text-ink-2">
      <Icon name={icon} className="size-4 text-muted" />
      {children}
    </span>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────

export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** "Showing 1–8 of 248 leads". */
export function rangeLabel(page: number, pageSize: number, total: number, noun: string): string {
  if (total === 0) return `No ${noun}`;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)} ${noun}`;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  idPrefix,
}: {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
  readonly idPrefix: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3 text-sm text-muted"
    >
      <div className="flex items-center gap-3">
        <span id={`${idPrefix}-rows-label`}>Rows per page</span>
        <div className="w-[88px]">
          <Select
            size="sm"
            aria-label="Rows per page"
            value={String(pageSize)}
            onChange={(v) => onPageSizeChange(Number(v))}
            options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>
      </div>
      <span aria-live="polite">
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
      </span>
      <div className="flex items-center gap-2">
        <PageButton
          label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          direction="prev"
        />
        <PageButton
          label="Next page"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          direction="next"
        />
      </div>
    </nav>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  direction,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly direction: 'prev' | 'next';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-[10px] border border-line bg-card text-ink transition-colors hover:border-line-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={direction === 'prev' ? 'm12 5-5 5 5 5' : 'm8 5 5 5-5 5'} />
      </svg>
    </button>
  );
}
