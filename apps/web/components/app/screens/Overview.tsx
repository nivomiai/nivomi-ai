'use client';

import Link from 'next/link';
import { Icon } from '@/components/marketing/primitives';
import { ROLE_DESCRIPTIONS, type OrganizationStatus } from '@/lib/api/types';
import { PERMISSION_LABELS } from '@/lib/app/access';
import { useSession } from '@/lib/app/session';
import { Notice, PageHeader, Panel, RoleBadge } from '../ui';

const STATUS_COPY: Record<OrganizationStatus, { tone: 'info' | 'success' | 'warn'; text: string }> =
  {
    PENDING_APPROVAL: {
      tone: 'info',
      text: 'Your organization is awaiting approval by the Nivomi team. You can set up your team now; AI calling is switched on after approval and compliance checks.',
    },
    ACTIVE: { tone: 'success', text: 'Your organization is approved.' },
    SUSPENDED: {
      tone: 'warn',
      text: 'Your organization is suspended. Contact Nivomi support to restore access.',
    },
    CLOSED: { tone: 'warn', text: 'This organization is closed.' },
  };

export function Overview() {
  const { me, can } = useSession();
  const organization = me?.organizations.find((o) => o.id === me.activeOrganization?.id);
  if (!me || !organization) return null;
  const status = STATUS_COPY[organization.status];

  const steps = [
    { done: true, label: 'Verify your email' },
    { done: true, label: `Create ${organization.name}` },
    ...(can('imports.manage')
      ? [{ done: false, label: 'Bring in your leads', href: '/app/data-sources' }]
      : []),
    ...(can('members.invite')
      ? [{ done: false, label: 'Invite your team', href: '/app/team' }]
      : []),
    ...(can('telecom.manage')
      ? [{ done: false, label: 'Verify your telecom identity', href: '/app/telecom' }]
      : []),
    { done: false, label: 'Review your security settings', href: '/app/security' },
  ];

  return (
    <div className="grid gap-8">
      <PageHeader
        title={`Welcome, ${me.user.name.split(' ')[0] ?? me.user.name}`}
        description={`You are working in ${organization.name}.`}
      />
      <Notice tone={status.tone}>{status.text}</Notice>

      <Panel title="Your access" description={ROLE_DESCRIPTIONS[organization.role]}>
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role={organization.role} />
          {(me.activeOrganization?.permissions ?? []).map((permission) => (
            <span
              key={permission}
              className="rounded-[8px] border border-line bg-soft px-2.5 py-1 text-xs font-semibold text-ink-2"
            >
              {PERMISSION_LABELS[permission].label}
            </span>
          ))}
        </div>
        <Link
          href="/app/roles"
          className="mt-4 inline-block text-sm font-semibold text-accent hover:underline"
        >
          Compare all roles
        </Link>
      </Panel>

      <Panel title="Get set up" description="A few steps before your first campaign.">
        <ol className="grid gap-2">
          {steps.map((step) => (
            <li
              key={step.label}
              className="flex items-center gap-3 rounded-[12px] border border-line px-4 py-3"
            >
              <span
                className={
                  step.done
                    ? 'inline-grid size-6 place-items-center rounded-full bg-live-soft text-live'
                    : 'inline-grid size-6 place-items-center rounded-full border border-line text-muted'
                }
              >
                {step.done ? <Icon name="i-check" className="size-4" /> : null}
              </span>
              <span className={step.done ? 'text-muted line-through' : 'font-semibold text-ink'}>
                {step.label}
              </span>
              {'href' in step && step.href ? (
                <Link
                  href={step.href}
                  className="ml-auto text-sm font-semibold text-accent hover:underline"
                >
                  Open
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
