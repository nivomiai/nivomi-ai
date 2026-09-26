'use client';

import { ErrorBlock, PageHeader } from '@/components/app/ui';

/** Keeps the app shell usable when a screen fails; never shows raw error details. */
export default function AppError({
  error,
  retry,
}: {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}) {
  return (
    <div className="grid gap-6">
      <PageHeader title="Something went wrong" />
      <ErrorBlock
        message={`This screen could not be displayed. Please try again.${error.digest ? ` Reference: ${error.digest}` : ''}`}
        onRetry={retry}
      />
    </div>
  );
}
