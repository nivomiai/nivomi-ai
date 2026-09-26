'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/app/api';
import { useSession } from '@/lib/app/session';
import { useSubmit } from '@/lib/app/use-submit';
import { AuthCard, Field, FormAlert, SubmitButton } from '../ui';

export function Onboarding() {
  const { me, refresh } = useSession();
  const router = useRouter();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const submit = useSubmit();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setNameError('Use at least 2 characters.');
      return;
    }
    setNameError(null);
    const ok = await submit.run(async () => {
      await api.post('/organizations', { name: name.trim() });
      await refresh();
    });
    if (ok) router.replace('/app');
  };

  const firstOrganization = (me?.organizations.length ?? 0) === 0;

  return (
    <AuthCard
      title={firstOrganization ? 'Set up your organization' : 'Create an organization'}
      intro="This is your company’s workspace. You will be its owner and can invite your team next."
      footer={
        firstOrganization ? null : (
          <Link href="/app" className="font-semibold text-accent hover:underline">
            Back to your workspace
          </Link>
        )
      }
    >
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="grid gap-5">
        <FormAlert message={submit.error} />
        <Field
          id="organization-name"
          label="Organization name"
          placeholder="e.g. Sunrise Realty"
          autoComplete="organization"
          required
          maxLength={100}
          value={name}
          error={nameError}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-[13px] text-muted">
          New organizations are reviewed by Nivomi before AI calling is enabled.
        </p>
        <SubmitButton pending={submit.pending} pendingLabel="Creating…">
          Create organization
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
