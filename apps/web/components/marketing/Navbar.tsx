'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/site/analytics';
import { primaryNav } from '@/lib/site/content';
import { cx } from '@/lib/site/cx';
import { ThemeToggle } from './ThemeToggle';
import { Icon, Logo } from './primitives';

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    menu.current?.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header
      className={cx(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled || open
          ? 'border-b border-line bg-[var(--nv-header)] backdrop-blur-xl'
          : 'border-b border-transparent',
      )}
    >
      <div className="container-nv flex h-[72px] items-center gap-4">
        <Link href="/" aria-label="Nivomi AI home" className="shrink-0 rounded-md" onClick={close}>
          <Logo />
        </Link>

        <nav aria-label="Primary" className="mx-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-[9px] px-3.5 py-2 text-[14.5px] font-medium text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden rounded-[10px] px-3 py-2 text-[14.5px] font-semibold text-ink-2 hover:text-accent sm:inline-flex"
          >
            Login
          </Link>
          <Link
            href="/#contact"
            className="btn btn-primary btn-sm hidden sm:inline-flex"
            onClick={() => track('demo_cta_clicked', { placement: 'navbar' })}
          >
            Book a demo
          </Link>
          <button
            ref={menuButton}
            type="button"
            className="inline-grid size-10 place-items-center rounded-[10px] border border-line bg-card text-ink lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            <span aria-hidden="true" className="relative block h-3.5 w-[18px]">
              <span
                className={cx(
                  'absolute left-0 block h-0.5 w-full rounded bg-current transition-transform',
                  open ? 'top-1.5 rotate-45' : 'top-0',
                )}
              />
              <span
                className={cx(
                  'absolute top-1.5 left-0 block h-0.5 w-full rounded bg-current transition-opacity',
                  open && 'opacity-0',
                )}
              />
              <span
                className={cx(
                  'absolute left-0 block h-0.5 w-full rounded bg-current transition-transform',
                  open ? 'top-1.5 -rotate-45' : 'top-3',
                )}
              />
            </span>
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        ref={menu}
        hidden={!open}
        className="max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-line bg-surface lg:hidden"
      >
        <nav aria-label="Mobile" className="container-nv flex flex-col gap-1 py-4">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className="flex items-center justify-between rounded-md px-3 py-3.5 text-base font-semibold text-ink hover:bg-accent-soft"
            >
              {item.label}
              <Icon name="i-arrow" className="size-4 text-muted" />
            </Link>
          ))}
          <Link
            href="/login"
            onClick={close}
            className="flex items-center justify-between rounded-md px-3 py-3.5 text-base font-semibold text-ink hover:bg-accent-soft"
          >
            Login
            <Icon name="i-arrow" className="size-4 text-muted" />
          </Link>
          <Link
            href="/#contact"
            onClick={() => {
              track('demo_cta_clicked', { placement: 'mobile_menu' });
              close();
            }}
            className="btn btn-primary mt-3"
          >
            Book a demo
          </Link>
        </nav>
      </div>
    </header>
  );
}
