'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ThemeToggle } from '@/components/marketing/ThemeToggle';
import { Icon, Logo, LogoMark } from '@/components/marketing/primitives';
import type { Me, OrganizationSummary, Permission } from '@/lib/api/types';
import { errorMessage } from '@/lib/api/client';
import { SessionProvider, useSession } from '@/lib/app/session';
import { useSubmit } from '@/lib/app/use-submit';
import type { IconName } from '@/lib/site/icons';
import { cx } from '@/lib/site/cx';
import { AuthCard, AuthFrame, ErrorBlock, FormAlert, LoadingBlock, RoleBadge } from './ui';

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
  readonly permission?: Permission;
}

interface NavSection {
  readonly title: string;
  readonly items: readonly NavItem[];
  readonly requiresSuperAdmin?: boolean;
}

/**
 * Three groups, named for the job they do (not the taxonomy). Order and labels follow the daily
 * path an operator takes: find the number to dial, decide what to say, keep the house in order.
 * A fourth Platform group appears only for a Super Admin.
 */
const NAV: readonly NavSection[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/app', label: 'Overview', icon: 'i-layers' },
      { href: '/app/leads', label: 'Leads', icon: 'i-target', permission: 'leads.read' },
      { href: '/app/campaigns', label: 'Campaigns', icon: 'i-phone', permission: 'campaigns.read' },
      {
        href: '/app/call-queue',
        label: 'Call queue',
        icon: 'i-repeat',
        permission: 'campaigns.read',
      },
    ],
  },
  {
    title: 'Automate',
    items: [
      { href: '/app/agents', label: 'AI agents', icon: 'i-spark', permission: 'agents.read' },
      {
        href: '/app/data-sources',
        label: 'Data sources',
        icon: 'i-db',
        permission: 'integrations.read',
      },
      {
        href: '/app/compliance',
        label: 'Compliance',
        icon: 'i-shield',
        permission: 'compliance.read',
      },
      {
        href: '/app/telecom',
        label: 'Telecom identity',
        icon: 'i-globe',
        permission: 'telecom.read',
      },
    ],
  },
  {
    title: 'Admin',
    items: [
      { href: '/app/team', label: 'Team', icon: 'i-users', permission: 'members.read' },
      { href: '/app/audit', label: 'Audit log', icon: 'i-check-c', permission: 'audit.read' },
    ],
  },
  {
    title: 'Platform',
    requiresSuperAdmin: true,
    items: [
      { href: '/app/platform/organizations', label: 'Organizations', icon: 'i-building' },
      { href: '/app/platform/plans', label: 'Plans', icon: 'i-layers' },
      { href: '/app/platform/users', label: 'Users', icon: 'i-users' },
      { href: '/app/platform/audit', label: 'Platform audit', icon: 'i-shield' },
      { href: '/app/platform/customisation', label: 'Customisation', icon: 'i-flow' },
    ],
  },
];

const ONBOARDING = '/app/onboarding';

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <SessionProvider>
      <Gate>{children}</Gate>
    </SessionProvider>
  );
}

/** Decides what a signed-in person may see: organization setup, then the app. */
function Gate({ children }: { readonly children: ReactNode }) {
  const { me, loading, error, refresh } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const needsOrganization = me?.activeOrganization === null;
  const noOrganizations = needsOrganization && me.organizations.length === 0;

  useEffect(() => {
    if (noOrganizations && pathname !== ONBOARDING) router.replace(ONBOARDING);
  }, [noOrganizations, pathname, router]);

  if (error && !me) {
    return (
      <AuthFrame>
        <AuthCard title="We couldn’t load your workspace">
          <ErrorBlock message={error} onRetry={() => void refresh()} />
        </AuthCard>
      </AuthFrame>
    );
  }
  if (loading && !me) {
    return (
      <AuthFrame>
        <div className="w-full max-w-md">
          <LoadingBlock label="Loading your workspace" />
        </div>
      </AuthFrame>
    );
  }
  if (!me) return null; // session expired: the API client is redirecting to sign-in

  if (needsOrganization) {
    if (pathname === ONBOARDING) return <AuthFrame>{children}</AuthFrame>;
    if (!noOrganizations) return <ChooseOrganization me={me} />;
    return null; // redirecting to onboarding
  }
  return <Frame me={me}>{children}</Frame>;
}

function ChooseOrganization({ me }: { readonly me: Me }) {
  const { switchOrganization } = useSession();
  const submit = useSubmit();
  return (
    <AuthFrame>
      <AuthCard title="Choose a workspace" intro="Pick the one you want to open.">
        <div className="grid gap-3">
          <FormAlert message={submit.error} />
          {me.organizations.map((org) => (
            <button
              key={org.id}
              type="button"
              disabled={submit.pending}
              onClick={() => void submit.run(() => switchOrganization(org.id))}
              className="card-nv flex items-center justify-between gap-3 p-4 text-left transition-colors hover:border-line-hover"
            >
              <span className="flex items-center gap-3">
                <WorkspaceAvatar name={org.name} />
                <span className="font-semibold text-ink">{org.name}</span>
              </span>
              <RoleBadge role={org.role} />
            </button>
          ))}
          <Link href={ONBOARDING} className="btn btn-secondary w-full">
            Create a new workspace
          </Link>
        </div>
      </AuthCard>
    </AuthFrame>
  );
}

function Frame({ me, children }: { readonly me: Me; readonly children: ReactNode }) {
  const { can, signOut } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const active = me.organizations.find((o) => o.id === me.activeOrganization?.id);

  const visible = NAV.filter(
    (section) => !section.requiresSuperAdmin || me.user.isSuperAdmin,
  )
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  // Super Admins live in /platform, so surface it first; everyone else gets the operator order.
  const sections = me.user.isSuperAdmin
    ? [
        ...visible.filter((s) => s.requiresSuperAdmin),
        ...visible.filter((s) => !s.requiresSuperAdmin),
      ]
    : visible;

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="min-h-dvh bg-soft">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Mobile top bar: workspace mark + menu toggle. The sidebar slides in as a sheet below. */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-[var(--nv-header)] px-4 backdrop-blur lg:hidden">
        <Link href="/app" aria-label="Nivomi AI overview" className="flex items-center gap-2.5">
          <LogoMark className="h-5 w-auto" />
          <span className="truncate text-[15px] font-semibold text-ink">
            {active?.name ?? 'Nivomi AI'}
          </span>
        </Link>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex size-9 items-center justify-center rounded-[10px] border border-line bg-card text-ink-2"
        >
          <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
            {menuOpen ? (
              <path
                d="m6 6 12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </header>

      <div className="lg:grid lg:grid-cols-[260px_1fr]">
        <aside
          id="app-sidebar"
          className={cx(
            'bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-line',
            menuOpen ? 'flex flex-col border-b border-line' : 'hidden',
          )}
        >
          <div className="flex items-center px-5 pt-5 pb-4">
            <Link href="/app" aria-label="Nivomi AI home" className="rounded-md">
              <Logo />
            </Link>
          </div>
          <div className="px-3">
            <WorkspaceSwitcher me={me} />
          </div>

          <nav
            aria-label="App"
            className="mt-4 flex-1 overflow-y-auto px-3 pb-4 lg:min-h-0"
            data-testid="app-nav"
          >
            {sections.map((section, index) => (
              <div key={section.title} className={index === 0 ? '' : 'mt-4'}>
                <p className="px-3 pb-1 text-[10.5px] font-semibold tracking-[0.12em] text-muted uppercase">
                  {section.title}
                </p>
                <ul className="grid gap-px">
                  {section.items.map((item) => {
                    const current =
                      item.href === '/app'
                        ? pathname === '/app'
                        : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={current ? 'page' : undefined}
                          className={cx(
                            'group relative flex items-center gap-2.5 rounded-[8px] px-3 py-1.5 text-[13.5px] transition-colors',
                            current
                              ? 'bg-accent-soft font-semibold text-accent'
                              : 'font-medium text-ink-2 hover:bg-soft hover:text-ink',
                          )}
                        >
                          {current ? (
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent"
                            />
                          ) : null}
                          <Icon
                            name={item.icon}
                            className={cx(
                              'size-4 shrink-0',
                              current ? 'text-accent' : 'text-muted group-hover:text-ink-2',
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="lg:hidden">
            <AccountDock
              name={me.user.name}
              email={me.user.email}
              signOut={() => void signOut()}
            />
          </div>
        </aside>

        <div className="min-w-0 lg:flex lg:min-h-dvh lg:flex-col">
          {/* Desktop-only top header: workspace status on the left, account menu on the right. */}
          <header className="sticky top-0 z-20 hidden h-14 items-center justify-between gap-4 border-b border-line bg-[var(--nv-header)] px-6 backdrop-blur lg:flex">
            <WorkspaceStatusStrip me={me} />
            <ProfileMenu
              name={me.user.name}
              email={me.user.email}
              isSuperAdmin={me.user.isSuperAdmin}
              signOut={() => void signOut()}
            />
          </header>
          <main id="main" className="min-w-0 px-4 py-6 sm:px-8 lg:px-10 lg:py-10">
            {/* Keyed by tenant: switching organization remounts every screen, dropping its data. */}
            <div key={me.activeOrganization?.id} className="mx-auto max-w-6xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

/** Workspace switcher: shows the current one as a button; opens a menu to switch or add. */
function WorkspaceSwitcher({ me }: { readonly me: Me }) {
  const { switchOrganization } = useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = me.organizations.find((o) => o.id === me.activeOrganization?.id);
  const multiple = me.organizations.length > 1;

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!active) return null;

  const choose = async (org: OrganizationSummary) => {
    if (org.id === active.id) {
      setOpen(false);
      return;
    }
    setError(null);
    setPending(org.id);
    try {
      await switchOrganization(org.id);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => multiple && setOpen((prev) => !prev)}
        disabled={!multiple}
        className={cx(
          'group flex w-full items-center gap-2.5 rounded-[12px] border border-line bg-surface px-2.5 py-2 text-left transition-colors',
          multiple ? 'hover:border-line-hover' : 'cursor-default',
        )}
      >
        <WorkspaceAvatar name={active.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-ink">{active.name}</span>
          <span className="block truncate text-[11.5px] font-medium tracking-[0.04em] text-muted uppercase">
            {active.status === 'ACTIVE' ? 'Workspace' : workspaceStatusLabel(active.status)}
          </span>
        </span>
        {multiple ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="size-4 shrink-0 text-muted"
          >
            <path
              d="m8 10 4-4 4 4M8 14l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Workspaces"
          className="absolute inset-x-0 top-full z-40 mt-1.5 rounded-[12px] border border-line bg-card p-1.5 shadow-md"
        >
          {me.organizations.map((org) => (
            <button
              key={org.id}
              type="button"
              role="menuitemradio"
              aria-checked={org.id === active.id}
              onClick={() => void choose(org)}
              disabled={pending !== null}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-[9px] px-2 py-2 text-left transition-colors',
                org.id === active.id ? 'bg-accent-soft' : 'hover:bg-soft',
                pending === org.id && 'opacity-60',
              )}
            >
              <WorkspaceAvatar name={org.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink">
                  {org.name}
                </span>
                <span className="block truncate text-[11.5px] text-muted">
                  {workspaceStatusLabel(org.status)}
                </span>
              </span>
              {org.id === active.id ? <Icon name="i-check" className="size-4 text-accent" /> : null}
            </button>
          ))}
          <Link
            href={ONBOARDING}
            className="mt-1 flex items-center gap-2 rounded-[9px] border-t border-line px-2 py-2 pt-2.5 text-[13.5px] font-semibold text-accent hover:bg-soft"
            onClick={() => setOpen(false)}
          >
            <Icon name="i-plus" className="size-4" />
            New workspace
          </Link>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 px-1 text-xs text-warn">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AccountDock({
  name,
  email,
  signOut,
}: {
  readonly name: string;
  readonly email: string;
  readonly signOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative border-t border-line p-3">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2.5 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-soft"
      >
        <UserAvatar name={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{name}</span>
          <span className="block truncate text-[12px] text-muted">{email}</span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="size-4 shrink-0 text-muted"
        >
          <circle cx="12" cy="6" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="18" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="absolute right-3 bottom-full left-3 z-40 mb-1.5 rounded-[12px] border border-line bg-card p-1.5 shadow-md"
        >
          <Link
            href="/app/security"
            role="menuitem"
            className="flex items-center gap-2.5 rounded-[9px] px-2 py-2 text-[14px] font-medium text-ink hover:bg-soft"
            onClick={() => setOpen(false)}
          >
            <Icon name="i-user" className="size-4 text-muted" />
            Account & security
          </Link>
          <div
            role="group"
            aria-label="Appearance"
            className="mt-0.5 flex items-center justify-between gap-2 rounded-[9px] px-2 py-2"
          >
            <span className="flex items-center gap-2.5 text-[14px] font-medium text-ink">
              <Icon name="i-sun" className="size-4 text-muted dark:hidden" />
              <Icon name="i-moon" className="hidden size-4 text-muted dark:inline" />
              Appearance
            </span>
            <ThemeToggle className="inline-grid size-8 place-items-center rounded-[8px] border border-line bg-surface text-ink-2 transition-colors hover:border-line-hover hover:text-accent" />
          </div>
          <div role="separator" className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-2 text-left text-[14px] font-medium text-ink hover:bg-soft"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 text-muted">
              <path
                d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h12"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceStatusStrip({ me }: { readonly me: Me }) {
  const active = me.organizations.find((o) => o.id === me.activeOrganization?.id);
  if (!active) return <span />;
  const pending = active.status === 'PENDING_APPROVAL';
  const suspended = active.status === 'SUSPENDED';
  const dotTone = pending
    ? 'bg-accent'
    : suspended
      ? 'bg-warn'
      : active.status === 'CLOSED'
        ? 'bg-muted'
        : 'bg-live';
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-[13px]">
      <span aria-hidden="true" className={cx('inline-block size-2 rounded-full', dotTone)} />
      <span className="truncate font-semibold text-ink">{active.name}</span>
      <span aria-hidden="true" className="text-muted">
        ·
      </span>
      <span className={cx('font-medium', pending || suspended ? 'text-ink-2' : 'text-muted')}>
        {workspaceStatusLabel(active.status)}
      </span>
      {pending && me.user.isSuperAdmin ? (
        <Link
          href="/app/platform/organizations?status=PENDING_APPROVAL"
          className="ml-2 text-[13px] font-semibold text-accent hover:underline"
        >
          Approve in Platform →
        </Link>
      ) : null}
    </div>
  );
}

function ProfileMenu({
  name,
  email,
  isSuperAdmin,
  signOut,
}: {
  readonly name: string;
  readonly email: string;
  readonly isSuperAdmin: boolean;
  readonly signOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const first = name.trim().split(/\s+/)[0] ?? name;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border border-line bg-surface px-1 py-1 pr-2.5 text-left transition-colors hover:border-line-hover"
      >
        <UserAvatar name={name} />
        <span className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className="truncate text-[13px] font-semibold text-ink">{first}</span>
          {isSuperAdmin ? (
            <span className="truncate text-[10.5px] font-bold tracking-[0.08em] text-accent uppercase">
              Super Admin
            </span>
          ) : null}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="size-4 shrink-0 text-muted"
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-40 mt-1.5 w-64 rounded-[12px] border border-line bg-card p-2 shadow-md"
        >
          <div className="px-2 pt-1 pb-2">
            <p className="truncate text-[13.5px] font-semibold text-ink">{name}</p>
            <p className="truncate text-[12px] text-muted">{email}</p>
          </div>
          <div role="separator" className="my-1 border-t border-line" />
          <Link
            href="/app/security"
            role="menuitem"
            className="flex items-center gap-2.5 rounded-[9px] px-2 py-2 text-[14px] font-medium text-ink hover:bg-soft"
            onClick={() => setOpen(false)}
          >
            <Icon name="i-user" className="size-4 text-muted" />
            Account & security
          </Link>
          {isSuperAdmin ? (
            <Link
              href="/app/platform/organizations"
              role="menuitem"
              className="flex items-center gap-2.5 rounded-[9px] px-2 py-2 text-[14px] font-medium text-ink hover:bg-soft"
              onClick={() => setOpen(false)}
            >
              <Icon name="i-shield" className="size-4 text-muted" />
              Platform console
            </Link>
          ) : null}
          <div
            role="group"
            aria-label="Appearance"
            className="mt-0.5 flex items-center justify-between gap-2 rounded-[9px] px-2 py-2"
          >
            <span className="flex items-center gap-2.5 text-[14px] font-medium text-ink">
              <Icon name="i-sun" className="size-4 text-muted dark:hidden" />
              <Icon name="i-moon" className="hidden size-4 text-muted dark:inline" />
              Appearance
            </span>
            <ThemeToggle className="inline-grid size-8 place-items-center rounded-[8px] border border-line bg-surface text-ink-2 transition-colors hover:border-line-hover hover:text-accent" />
          </div>
          <div role="separator" className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-2 text-left text-[14px] font-medium text-ink hover:bg-soft"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 text-muted">
              <path
                d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h12"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceAvatar({ name }: { readonly name: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-7 shrink-0 place-items-center rounded-[8px] text-[12.5px] font-bold text-white"
      style={{
        background: 'linear-gradient(135deg, var(--nv-pink) 0%, var(--nv-pink-2) 100%)',
      }}
    >
      {initials(name)}
    </span>
  );
}

function UserAvatar({ name }: { readonly name: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[12.5px] font-bold text-accent"
    >
      {initials(name)}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return (first + (second ?? '')).toUpperCase();
}

function workspaceStatusLabel(status: OrganizationSummary['status']): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'PENDING_APPROVAL':
      return 'Pending approval';
    case 'SUSPENDED':
      return 'Suspended';
    case 'CLOSED':
      return 'Closed';
  }
}
