'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { WelcomeSurveyAnswers } from '@/lib/api/types';
import { api } from '@/lib/app/api';
import { useSession } from '@/lib/app/session';
import { useSubmit } from '@/lib/app/use-submit';
import { FormAlert, SelectField, SubmitButton } from './ui';

type Question = {
  readonly [K in keyof WelcomeSurveyAnswers]: {
    readonly id: K;
    readonly label: string;
    readonly options: readonly {
      readonly value: WelcomeSurveyAnswers[K];
      readonly label: string;
    }[];
  };
}[keyof WelcomeSurveyAnswers];

/** Values match the API's `welcomeSurveySchema`. */
const QUESTIONS: readonly Question[] = [
  {
    id: 'role',
    label: 'What best describes you?',
    options: [
      { value: 'business_owner', label: 'Business owner / founder' },
      { value: 'sales', label: 'Sales' },
      { value: 'marketing', label: 'Marketing' },
      { value: 'operations', label: 'Operations / customer support' },
      { value: 'developer', label: 'Developer / technical' },
      { value: 'agency', label: 'Agency / reseller' },
      { value: 'other', label: 'Something else' },
    ],
  },
  {
    id: 'callVolume',
    label: 'Expected monthly call volume',
    options: [
      { value: 'under_1k', label: 'Under 1,000 calls' },
      { value: '1k_10k', label: '1,000 – 10,000 calls' },
      { value: '10k_50k', label: '10,000 – 50,000 calls' },
      { value: 'over_50k', label: 'More than 50,000 calls' },
      { value: 'not_sure', label: 'Not sure yet' },
    ],
  },
  {
    id: 'migratingFrom',
    label: 'Are you migrating from another provider?',
    options: [
      { value: 'new', label: 'No, this is new for us' },
      { value: 'voice_ai', label: 'Yes, another voice AI platform' },
      { value: 'call_center', label: 'Yes, a human call centre' },
      { value: 'dialer', label: 'Yes, an auto-dialler or IVR' },
      { value: 'other', label: 'Yes, something else' },
    ],
  },
  {
    id: 'referralSource',
    label: 'How did you hear about us?',
    options: [
      { value: 'search', label: 'Google / search' },
      { value: 'social', label: 'LinkedIn / social media' },
      { value: 'referral', label: 'A friend or colleague' },
      { value: 'event', label: 'Event or webinar' },
      { value: 'ai_assistant', label: 'ChatGPT / an AI assistant' },
      { value: 'other', label: 'Somewhere else' },
    ],
  },
];

type Draft = Partial<Record<keyof WelcomeSurveyAnswers, string>>;

/**
 * One-time welcome questions, shown over the app until answered (`me.welcomeSurveyPending`).
 * Every question is required; the API stores the answers against the signed-in person.
 */
export function WelcomeSurvey() {
  const { refresh } = useSession();
  const [draft, setDraft] = useState<Draft>({});
  const [missing, setMissing] = useState(false);
  const submit = useSubmit();

  useEffect(() => {
    document.getElementById(`welcome-${QUESTIONS[0]?.id}`)?.focus();
    // The app behind the dialog must not scroll while it is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const complete = QUESTIONS.every((q) => Boolean(draft[q.id]));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMissing(!complete);
    if (!complete) return;
    const ok = await submit.run(() => api.put('/me/welcome-survey', draft));
    if (ok) await refresh();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-plum-950/45 p-4 backdrop-blur-[3px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-intro"
        className="w-full max-w-[640px] overflow-hidden rounded-[22px] border border-line bg-card shadow-lg"
      >
        <div className="px-7 pt-6 pb-5 sm:px-9 sm:pt-7">
          <p className="text-[12.5px] font-semibold tracking-[0.18em] text-accent uppercase">
            Welcome
          </p>
          <h2 id="welcome-title" className="mt-2 text-[28px] tracking-[-0.03em] text-ink">
            Welcome to Nivomi
          </h2>
          <p id="welcome-intro" className="mt-2 text-[15px] text-muted">
            A few quick questions so we can tailor your experience. Takes ~20 seconds.
          </p>
        </div>

        <form noValidate onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-4 border-y border-line bg-soft px-7 py-5 sm:px-9">
            <FormAlert
              message={missing ? 'Answer all four questions to continue.' : submit.error}
            />
            {QUESTIONS.map((q) => (
              <SelectField
                key={q.id}
                id={`welcome-${q.id}`}
                label={q.label}
                value={draft[q.id] ?? ''}
                onChange={(value) => setDraft((d) => ({ ...d, [q.id]: value }))}
                options={q.options}
              />
            ))}
          </div>
          <div className="flex justify-end px-7 py-4 sm:px-9">
            <SubmitButton pending={submit.pending} pendingLabel="Saving…" className="w-auto! px-7">
              Get started
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
