'use client';

import Link from 'next/link';
import { Icon } from '@/components/marketing/primitives';
import type { OrganizationStatus } from '@/lib/api/types';
import { useSession } from '@/lib/app/session';
import type { IconName } from '@/lib/site/icons';
import { Notice, PageHeader, Panel } from '../ui';

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

/** Modules on the MVP roadmap that are not built yet — shown honestly as upcoming. */
const UPCOMING: readonly { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'i-db',
    title: 'Leads & imports',
    text: 'Import leads from CSV or Excel with consent status.',
  },
  {
    icon: 'i-target',
    title: 'Campaigns',
    text: 'Eligibility-checked outbound calling within permitted hours.',
  },
  {
    icon: 'i-phone',
    title: 'AI calls & call history',
    text: 'Recordings, transcripts and AI summaries per call.',
  },
  { icon: 'i-cal', title: 'Appointments', text: 'Qualified leads booked straight from the call.' },
  { icon: 'i-link', title: 'CRM sync', text: 'Optional HubSpot connection per organization.' },
  { icon: 'i-chart', title: 'Usage & billing', text: 'Metered minutes and invoices.' },
];

export function Overview() {
  const { me, can } = useSession();
  const organization = me?.organizations.find((o) => o.id === me.activeOrganization?.id);
  if (!me || !organization) return null;
  const status = STATUS_COPY[organization.status];

  const steps = [
    { done: true, label: 'Verify your email' },
    { done: true, label: `Create ${organization.name}` },
    ...(can('members.invite')
      ? [{ done: false, label: 'Invite your team', href: '/app/team' }]
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

      <Panel
        title="Coming to your workspace"
        description="These parts of the MVP are in development and will appear here as they ship."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {UPCOMING.map((item) => (
            <li key={item.title} className="flex gap-3 rounded-[14px] border border-line p-4">
              <span className="icon-tile shrink-0">
                <Icon name={item.icon} />
              </span>
              <span>
                <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {item.title}
                  <span className="rounded-full border border-soon/25 bg-soon-soft px-2 py-0.5 text-[11px] font-bold text-soon">
                    In development
                  </span>
                </span>
                <span className="mt-1 block text-sm text-muted">{item.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
