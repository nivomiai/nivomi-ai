'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal dialog: portalled, labelled, closes on Escape or a click on the backdrop, keeps Tab
 * inside, and returns focus to whatever opened it.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly onClose: () => void;
  readonly children?: ReactNode;
  readonly footer: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      opener?.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-plum-950/45 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-[480px] rounded-[20px] border border-line bg-card p-6 shadow-lg focus:outline-none sm:p-7"
      >
        <h2 id={`${id}-title`} className="text-[22px] tracking-[-0.02em] text-ink">
          {title}
        </h2>
        {description ? (
          <div id={`${id}-description`} className="mt-2 text-[14.5px] text-muted">
            {description}
          </div>
        ) : null}
        {children ? <div className="mt-5 grid gap-4">{children}</div> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
