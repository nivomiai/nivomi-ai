'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ThemeToggle } from '@/components/marketing/ThemeToggle';
import { Icon, Logo } from '@/components/marketing/primitives';
import type { Me, Permission, Role } from '@/lib/api/types';
import { errorMessage } from '@/lib/api/client';
import { SessionProvider, useSession } from '@/lib/app/session';
import { useSubmit } from '@/lib/app/use-submit';
import type { IconName } from '@/lib/site/icons';
import { cx } from '@/lib/site/cx';
import {
  AuthCard,
  AuthFrame,
  EmptyState,
  ErrorBlock,
  FormAlert,
  LoadingBlock,
  PageHeader,
  RoleBadge,
  selectClass,
} from './ui';

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
  readonly permission?: Permission;
  /** External or app-outside link; opens in the same tab but without client router. */
  readonly external?: boolean;
}

interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Workspace',
    items: [{ href: '/app', label: 'Overview', icon: 'i-layers' }],
  },
  {
    label: 'Build',
    items: [
      // Demo surface until the real agent builder (Phase 1); hints with ↗ that it leaves the app.
      { href: '/demo/voice', label: 'Try voice ↗', icon: 'i-mic', external: true },
      { href: '/app/leads', label: 'Leads', icon: 'i-target', permission: 'leads.read' },
      {
        href: '/app/data-sources',
        label: 'Data sources',
        icon: 'i-db',
        permission: 'integrations.read',
      },
    ],
  },
  {
    label: 'Calling',
    items: [
      {
        href: '/app/campaigns',
        label: 'Campaigns',
        icon: 'i-phone',
        permission: 'campaigns.read',
      },
      {
        href: '/app/compliance',
        label: 'Compliance',
        icon: 'i-check-c',
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
    label: 'Admin',
    items: [
      { href: '/app/team', label: 'Team', icon: 'i-users', permission: 'members.read' },
      { href: '/app/roles', label: 'Roles & access', icon: 'i-shield' },
      { href: '/app/audit', label: 'Audit log', icon: 'i-clock', permission: 'audit.read' },
    ],
  },
];

/** Platform (Super Admin) nav entries — visible only when the account holds the platform flag. */
const PLATFORM_NAV: readonly NavItem[] = [
  { href: '/app/platform/organizations', label: 'Organizations', icon: 'i-building' },
  { href: '/app/platform/users', label: 'Users', icon: 'i-users' },
  { href: '/app/platform/customisation', label: 'Customisation', icon: 'i-spark' },
  { href: '/app/platform/audit', label: 'Platform audit', icon: 'i-shield' },
];

/** The nav entry (across groups) that owns `pathname`. Longest matching prefix wins. */
function sectionFor(pathname: string): NavItem | undefined {
  const all = NAV_GROUPS.flatMap((group) => group.items);
  return all
    .filter((item) =>
      item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
}

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
      <AuthCard title="Choose an organization" intro="Pick the workspace you want to open.">
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
              <span className="font-semibold text-ink">{org.name}</span>
              <RoleBadge role={org.role} />
            </button>
          ))}
          <Link href={ONBOARDING} className="btn btn-secondary w-full">
            Create a new organization
          </Link>
        </div>
      </AuthCard>
    </AuthFrame>
  );
}

/**
 * Shown instead of a screen the member's role does not include. A convenience only: the API
 * refuses the same requests regardless.
 */
function NoAccess({ section, role }: { readonly section: string; readonly role: Role }) {
  return (
    <div className="grid gap-8">
      <PageHeader title={section} />
      <EmptyState icon="i-shield" title={`Your role doesn’t include ${section}`}>
        <p>
          You are signed in as <RoleBadge role={role} /> in this organization. Ask an Owner or Admin
          if you need access.
        </p>
        <Link
          href="/app/roles"
          className="mt-4 inline-block font-semibold text-accent hover:underline"
        >
          See what each role can do
        </Link>
      </EmptyState>
    </div>
  );
}

function Frame({ me, children }: { readonly me: Me; readonly children: ReactNode }) {
  const { can, switchOrganization } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const active = me.organizations.find((o) => o.id === me.activeOrganization?.id);
  const section = sectionFor(pathname);
  const allowed = !section?.permission || can(section.permission);

  useEffect(() => setMenuOpen(false), [pathname]);

  const renderLink = (item: NavItem) => {
    const current = item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href);
    const className = cx(
      'relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-[14.5px] font-medium transition-colors',
      current
        ? 'bg-accent-soft font-semibold text-accent'
        : 'text-ink-2 hover:bg-soft hover:text-ink',
    );
    const content = (
      <>
        {current ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-1.5 -left-1 w-[3px] rounded-full bg-accent"
          />
        ) : null}
        <Icon name={item.icon} className="size-[17px]" />
        {item.label}
      </>
    );
    if (item.external) {
      return (
        <a key={item.href} href={item.href} className={className}>
          {content}
        </a>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={current ? 'page' : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  };

  const nav = (
    <div className="grid gap-5">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.permission || can(item.permission));
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[10.5px] font-bold tracking-[0.16em] text-muted uppercase">
              {group.label}
            </p>
            <nav aria-label={group.label} className="grid gap-0.5">
              {items.map(renderLink)}
            </nav>
          </div>
        );
      })}
      {me.user.isSuperAdmin ? (
        <div className="border-t border-line pt-5">
          <p className="mb-1.5 px-3 text-[10.5px] font-bold tracking-[0.16em] text-accent uppercase">
            Super admin
          </p>
          <nav aria-label="Platform (Super Admin)" className="grid gap-0.5">
            {PLATFORM_NAV.map(renderLink)}
          </nav>
        </div>
      ) : null}
    </div>
  );

  const organizationPicker = (
    <div>
      <label
        htmlFor="org-switcher"
        className="text-xs font-bold tracking-[0.12em] text-muted uppercase"
      >
        Organization
      </label>
      {me.organizations.length > 1 ? (
        <select
          id="org-switcher"
          className={cx(selectClass, 'py-2.5')}
          value={me.activeOrganization?.id}
          onChange={(e) => {
            setSwitchError(null);
            switchOrganization(e.target.value).catch((err: unknown) =>
              setSwitchError(errorMessage(err)),
            );
          }}
        >
          {me.organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      ) : (
        <p id="org-switcher" className="mt-1.5 truncate font-semibold text-ink">
          {active?.name}
        </p>
      )}
      {switchError ? <p className="mt-1 text-xs text-warn">{switchError}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        {me.activeOrganization ? <RoleBadge role={me.activeOrganization.role} /> : null}
        <Link href={ONBOARDING} className="text-xs font-semibold text-accent hover:underline">
          New organization
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-soft">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {/* Mobile top bar: logo + user menu + hamburger. */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-[var(--nv-header)] px-4 backdrop-blur lg:hidden">
        <Link href="/app" aria-label="Nivomi AI overview">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <UserMenu me={me} />
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="app-sidebar"
            onClick={() => setMenuOpen((open) => !open)}
            className="btn btn-secondary btn-sm"
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>
      <div className="lg:grid lg:grid-cols-[272px_1fr]">
        <aside
          id="app-sidebar"
          className={cx(
            'border-line bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r',
            menuOpen ? 'flex flex-col border-b' : 'hidden',
          )}
        >
          <div className="hidden h-16 items-center px-5 lg:flex">
            <Link href="/app" aria-label="Nivomi AI overview">
              <Logo />
            </Link>
          </div>
          <div className="grid gap-5 px-3 pt-1 pb-4 lg:flex-1 lg:content-start lg:overflow-y-auto">
            <div className="rounded-[12px] border border-line bg-soft/40 p-3">
              {organizationPicker}
            </div>
            {nav}
          </div>
        </aside>
        <div className="flex min-w-0 flex-col">
          {/* Desktop top bar: section title left, user menu right. */}
          <header className="sticky top-0 z-20 hidden h-16 items-center justify-between gap-4 border-b border-line bg-[var(--nv-header)] px-6 backdrop-blur lg:flex lg:px-10">
            <div className="min-w-0">
              <h1 className="truncate font-brand text-[17px] font-semibold text-ink">
                {section?.label ?? 'Overview'}
              </h1>
            </div>
            <UserMenu me={me} />
          </header>
          <main id="main" className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
            {/* Keyed by tenant: switching organization remounts every screen, dropping its data. */}
            <div key={me.activeOrganization?.id} className="mx-auto max-w-5xl">
              {allowed || !section || !me.activeOrganization ? (
                children
              ) : (
                <NoAccess section={section.label} role={me.activeOrganization.role} />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function UserMenu({ me }: { readonly me: Me }) {
  const { signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const initials = useInitials(me.user.name);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, close]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cx(
          'flex items-center gap-2 rounded-full border border-line bg-card px-1.5 py-1 pr-3 text-sm font-medium text-ink-2 transition-colors hover:border-line-hover hover:text-ink',
          open && 'border-line-hover text-ink',
        )}
      >
        <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent">
          {initials}
        </span>
        <span className="hidden max-w-[140px] truncate sm:inline">{me.user.name}</span>
        <Icon name="i-arrow" className="hidden size-3.5 rotate-90 sm:inline" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-[14px] border border-line bg-card shadow-lg"
        >
          <div className="flex items-center gap-3 border-b border-line bg-soft/50 px-4 py-3">
            <span className="inline-grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink">{me.user.name}</p>
              <p className="truncate text-[12.5px] text-muted">{me.user.email}</p>
            </div>
          </div>
          <ul className="grid gap-0.5 p-1.5">
            <MenuLink href="/app/security" icon="i-user" onClick={close}>
              Profile &amp; security
            </MenuLink>
            <MenuLink href="/app/team" icon="i-users" onClick={close}>
              Team settings
            </MenuLink>
            {me.user.isSuperAdmin ? (
              <MenuLink href="/app/platform/organizations" icon="i-shield" onClick={close}>
                Super admin
              </MenuLink>
            ) : null}
          </ul>
          <div className="flex items-center justify-between border-t border-line bg-soft/30 px-3 py-2.5">
            <span className="text-[12.5px] font-medium text-muted">Appearance</span>
            <ThemeToggle className="inline-grid size-8 place-items-center rounded-[8px] border border-line bg-card text-ink-2 transition-colors hover:border-line-hover hover:text-accent" />
          </div>
          <button
            type="button"
            onClick={() => {
              close();
              void signOut();
            }}
            className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-sm font-semibold text-ink-2 transition-colors hover:bg-soft hover:text-accent"
          >
            <Icon name="i-arrow" className="size-4 rotate-180" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  onClick,
  children,
}: {
  readonly href: string;
  readonly icon: IconName;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        role="menuitem"
        onClick={onClick}
        className="flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-soft hover:text-ink"
      >
        <Icon name={icon} className="size-[16px] text-muted" />
        {children}
      </Link>
    </li>
  );
}

function useInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
