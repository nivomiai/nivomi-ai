'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/lib/site/cx';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

const TRIGGER =
  'flex w-full items-center justify-between gap-3 rounded-[12px] border bg-surface text-left text-ink transition-colors focus:border-pink focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-tint disabled:cursor-not-allowed disabled:opacity-60';

const SIZES = {
  md: 'mt-1.5 px-4 py-3 text-[15px]',
  sm: 'px-3 py-2.5 text-sm',
} as const;

/** Gap between the trigger and the list, and the list's tallest size. */
const GAP = 6;
const MAX_LIST_HEIGHT = 288;

/**
 * Styled replacement for a native `<select>`: the WAI-ARIA "select-only combobox" pattern.
 * Focus stays on the trigger; the open list is portalled to `<body>` so dialogs and scroll
 * containers never clip it. Keyboard: arrows, Home/End, Enter/Space, Escape, Tab, type-ahead.
 */
export function Select({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select one',
  disabled,
  size = 'md',
  invalid,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  /** Shown when `value` matches no option. */
  readonly placeholder?: string;
  readonly disabled?: boolean | undefined;
  readonly size?: keyof typeof SIZES;
  readonly invalid?: boolean;
  readonly className?: string | undefined;
  readonly 'aria-label'?: string;
  readonly 'aria-describedby'?: string | undefined;
}) {
  const autoId = useId();
  const triggerId = id ?? `select-${autoId}`;
  const listId = `${triggerId}-list`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  }>();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];
  const enabled = (i: number) => options[i] !== undefined && !options[i]?.disabled;

  /** Next enabled option from `from` in `step` direction; stays put at the ends. */
  const move = useCallback(
    (from: number, step: 1 | -1) => {
      for (let i = from + step; i >= 0 && i < options.length; i += step) {
        if (!options[i]?.disabled) return i;
      }
      return from;
    },
    [options],
  );

  const openList = (index = selectedIndex) => {
    if (disabled) return;
    setActive(enabled(index) ? index : move(-1, 1));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (option && !option.disabled && option.value !== value) onChange(option.value);
    close();
  };

  // Place the list under the trigger, or above it when there is not enough room below.
  const position = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const flip = below < Math.min(MAX_LIST_HEIGHT, options.length * 40 + 12) && rect.top > below;
    setPlace(
      flip
        ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + GAP }
        : { left: rect.left, width: rect.width, top: rect.bottom + GAP },
    );
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, position]);

  // Close on a press anywhere outside the trigger and the list.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !list.current?.contains(target)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) {
      document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, active, listId]);

  /** Type-ahead: jump to the next option whose label starts with what was typed recently. */
  const typeAhead = (key: string) => {
    const now = Date.now();
    const buffer = now - typed.current.at < 600 ? typed.current.text + key : key;
    typed.current = { text: buffer, at: now };
    const query = buffer.toLowerCase();
    // A single key cycles past the current option; a longer prefix may keep matching it.
    const start = (open ? active : selectedIndex) + (buffer.length > 1 ? 0 : 1);
    for (let n = 0; n < options.length; n += 1) {
      const i = (((start + n) % options.length) + options.length) % options.length;
      if (enabled(i) && options[i]?.label.toLowerCase().startsWith(query)) {
        if (open) setActive(i);
        else if (options[i]?.value !== value) onChange(options[i]?.value ?? value);
        return;
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        event.preventDefault();
        openList();
      } else if (key === 'Home' || key === 'End') {
        event.preventDefault();
        openList(key === 'Home' ? move(-1, 1) : move(options.length, -1));
      } else if (key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
        typeAhead(key);
      }
      return;
    }
    switch (key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => move(i, 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (event.altKey) commit(active);
        else setActive((i) => move(i, -1));
        break;
      case 'Home':
        event.preventDefault();
        setActive(move(-1, 1));
        break;
      case 'End':
        event.preventDefault();
        setActive(move(options.length, -1));
        break;
      case 'PageDown':
        event.preventDefault();
        setActive((i) => Array.from({ length: 10 }).reduce<number>((at) => move(at, 1), i));
        break;
      case 'PageUp':
        event.preventDefault();
        setActive((i) => Array.from({ length: 10 }).reduce<number>((at) => move(at, -1), i));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(active);
        break;
      case 'Escape':
        // Closes only this list, not a dialog the select sits in.
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case 'Tab':
        commit(active);
        break;
      default:
        if (key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          typeAhead(key);
        }
    }
  };

  return (
    <>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (open) close();
        }}
        className={cx(
          TRIGGER,
          SIZES[size],
          invalid ? 'border-[#d33] dark:border-[#ff7a7a]' : 'border-line',
          open && 'border-pink ring-4 ring-accent-tint',
          className,
        )}
      >
        <span className={cx('min-w-0 truncate', !selected && 'text-muted')}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={cx(
            'size-4 shrink-0 text-muted transition-transform duration-150',
            open && 'rotate-180',
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      {open && place
        ? createPortal(
            <ul
              ref={list}
              id={listId}
              role="listbox"
              aria-labelledby={triggerId}
              tabIndex={-1}
              style={{
                left: place.left,
                width: place.width,
                top: place.top,
                bottom: place.bottom,
                maxHeight: MAX_LIST_HEIGHT,
              }}
              className="no-scrollbar fixed z-[100] overflow-y-auto rounded-[14px] border border-line bg-card p-1.5 shadow-lg"
              // Keep focus on the trigger while choosing with the pointer.
              onMouseDown={(e) => e.preventDefault()}
            >
              {options.map((option, i) => {
                const isSelected = i === selectedIndex;
                return (
                  <li
                    key={option.value}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    data-value={option.value}
                    onPointerMove={() => {
                      if (!option.disabled && active !== i) setActive(i);
                    }}
                    onClick={() => commit(i)}
                    className={cx(
                      'flex cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-[14.5px] text-ink',
                      i === active && 'bg-accent-soft',
                      isSelected && 'font-semibold text-accent',
                      option.disabled && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    <span className="min-w-0">{option.label}</span>
                    {isSelected ? (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        className="size-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                      </svg>
                    ) : null}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
