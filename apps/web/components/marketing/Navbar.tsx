'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/site/analytics';
import { siteConfig } from '@/lib/site/config';
import { primaryNav, whatsappEnquiryHref } from '@/lib/site/content';
import { cx } from '@/lib/site/cx';
import { ThemeToggle } from './ThemeToggle';
import { Icon, Logo } from './primitives';

/**
 * Header of the React public pages, mirroring the homepage header (public/site/home.html).
 * Section links target the static homepage, so they are plain anchors (full page loads).
 */
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
        'fixed inset-x-0 top-0 z-50 border-b backdrop-blur-xl backdrop-saturate-[1.8] transition-[background-color,border-color,box-shadow] duration-300',
        scrolled || open
          ? 'border-line-2 bg-[var(--nv-header)] shadow-[0_6px_24px_rgba(15,27,61,0.05)]'
          : 'border-transparent bg-[var(--nv-header)]',
      )}
    >
      <div className="container-nv flex h-16 items-center gap-4 md:h-[72px] xl:gap-6">
        <a href="/" aria-label="Nivomi AI home" className="shrink-0 rounded-md" onClick={close}>
          <Logo />
        </a>

        <nav aria-label="Primary" className="mx-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-[9px] px-2 py-2 text-[14px] font-[550] whitespace-nowrap text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent xl:px-[13px] xl:text-[14.5px]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ThemeToggle className="hidden size-10 place-items-center rounded-[10px] border border-line bg-card text-ink-2 transition-colors hover:border-line-hover hover:text-accent lg:inline-grid" />
          <a
            href={siteConfig.contact.phoneHref}
            className="hidden items-center gap-2 rounded-[10px] px-3 py-2 text-[14.5px] font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent lg:inline-flex"
          >
            <Icon name="i-phone" className="size-[17px]" />
            <span className="hidden xl:inline">Call Us</span>
            <span className="sr-only xl:hidden">Call us</span>
          </a>
          <Link href="/login" className="btn btn-secondary btn-sm hidden md:inline-flex">
            <Icon name="i-user" className="size-4" />
            Login
          </Link>
          <a
            href="/#demo"
            className="btn btn-primary btn-sm px-3.5 sm:px-4"
            onClick={() => track('demo_cta_clicked', { placement: 'navbar' })}
          >
            Book a Demo
          </a>
          <button
            ref={menuButton}
            type="button"
            className="inline-grid size-11 place-items-center rounded-[12px] border border-line bg-card text-ink lg:hidden"
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
        className="h-[calc(100dvh-64px)] overflow-y-auto border-t border-line-2 bg-surface md:h-[calc(100dvh-72px)] lg:hidden"
      >
        <div className="container-nv flex min-h-full flex-col py-6">
          <nav aria-label="Mobile">
            {primaryNav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={close}
                className="flex items-center justify-between border-b border-line-2 px-1 py-4 text-[22px] font-bold tracking-[-0.02em] text-ink hover:text-accent"
              >
                {item.label}
                <Icon name="i-arrow" className="size-[18px] text-muted" />
              </a>
            ))}
          </nav>
          <div className="flex items-center justify-between px-1 py-4 text-[15px] font-semibold text-muted">
            <span>Theme</span>
            <ThemeToggle />
          </div>
          <div className="mt-auto grid gap-2.5 pt-6">
            <a
              href="/#demo"
              onClick={() => {
                track('demo_cta_clicked', { placement: 'mobile_menu' });
                close();
              }}
              className="btn btn-primary"
            >
              Book a Demo
              <Icon name="i-arrow" className="size-[18px]" />
            </a>
            <Link href="/login" onClick={close} className="btn btn-secondary">
              <Icon name="i-user" className="size-[18px]" />
              Login
            </Link>
            <a href={whatsappEnquiryHref} target="_blank" rel="noopener" className="btn btn-wa">
              <Icon name="i-wa-mono" className="size-5" />
              WhatsApp Enquiry
            </a>
            <a href={siteConfig.contact.phoneHref} className="btn btn-secondary">
              <Icon name="i-phone" className="size-[18px]" />
              {siteConfig.contact.phoneDisplay}
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
