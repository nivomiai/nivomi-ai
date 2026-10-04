'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ThemeToggle } from '@/components/marketing/ThemeToggle';
import { Icon, Logo } from '@/components/marketing/primitives';
import type { Me, Permission } from '@/lib/api/types';
import { errorMessage } from '@/lib/api/client';
import { SessionProvider, useSession } from '@/lib/app/session';
import { useSubmit } from '@/lib/app/use-submit';
import type { IconName } from '@/lib/site/icons';
import { cx } from '@/lib/site/cx';
import {
  AuthCard,
  AuthFrame,
  ErrorBlock,
  FormAlert,
  LoadingBlock,
  RoleBadge,
  selectClass,
} from './ui';

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
  readonly permission?: Permission;
}

/** Grouped like the MVP mock-up: Overview, AI & Automation, Operations, Administration. */
const NAV: readonly { readonly title: string; readonly items: readonly NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { href: '/app', label: 'Dashboard', icon: 'i-layers' },
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
    title: 'AI & Automation',
    items: [
      { href: '/app/agents', label: 'AI Agents', icon: 'i-spark', permission: 'agents.read' },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        href: '/app/data-sources',
        label: 'Data sources',
        icon: 'i-db',
        permission: 'integrations.read',
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
    title: 'Administration',
    items: [
      { href: '/app/team', label: 'Team', icon: 'i-users', permission: 'members.read' },
      { href: '/app/audit', label: 'Audit log', icon: 'i-shield', permission: 'audit.read' },
      { href: '/app/security', label: 'Security', icon: 'i-user' },
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

function Frame({ me, children }: { readonly me: Me; readonly children: ReactNode }) {
  const { can, signOut, switchOrganization } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const active = me.organizations.find((o) => o.id === me.activeOrganization?.id);
  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((section) => section.items.length > 0);

  useEffect(() => setMenuOpen(false), [pathname]);

  const nav = (
    <nav aria-label="App" className="grid gap-5">
      {sections.map((section) => (
        <div key={section.title} className="grid gap-1">
          <p className="px-3 text-[11px] font-bold tracking-[0.12em] text-muted uppercase">
            {section.title}
          </p>
          {section.items.map((item) => {
            const current =
              item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-3 rounded-[12px] px-3 py-2 text-[15px] font-semibold transition-colors',
                  current
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink-2 hover:bg-soft hover:text-ink',
                )}
              >
                <Icon name={item.icon} className="size-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
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
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-[var(--nv-header)] px-4 backdrop-blur lg:hidden">
        <Link href="/app" aria-label="Nivomi AI overview">
          <Logo />
        </Link>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          onClick={() => setMenuOpen((open) => !open)}
          className="btn btn-secondary btn-sm"
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </header>
      <div className="lg:grid lg:grid-cols-[272px_1fr]">
        <aside
          id="app-sidebar"
          className={cx(
            'border-line bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r',
            menuOpen ? 'flex flex-col border-b' : 'hidden',
          )}
        >
          <div className="hidden h-20 items-center px-6 lg:flex">
            <Link href="/app" aria-label="Nivomi AI overview">
              <Logo />
            </Link>
          </div>
          {/* Scrolls on short screens so every item stays reachable; the account block stays put. */}
          <div className="grid gap-6 px-4 py-5 lg:min-h-0 lg:flex-1 lg:content-start lg:overflow-y-auto">
            <div className="rounded-[14px] border border-line p-3.5">{organizationPicker}</div>
            {nav}
          </div>
          <div className="border-t border-line p-4">
            <p className="truncate text-sm font-semibold text-ink">{me.user.name}</p>
            <p className="truncate text-[13px] text-muted">{me.user.email}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void signOut()}
                className="btn btn-secondary btn-sm flex-1"
              >
                Sign out
              </button>
              <ThemeToggle />
            </div>
          </div>
        </aside>
        <main id="main" className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
          {/* Keyed by tenant: switching organization remounts every screen, dropping its data. */}
          <div key={me.activeOrganization?.id} className="mx-auto max-w-5xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
