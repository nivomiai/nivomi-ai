'use client';

import { useCallback, useRef, useState } from 'react';
import { ApiError, errorMessage } from '../api/client';

export interface Submit {
  readonly pending: boolean;
  readonly error: string | null;
  /** The API error code of the last failure, for flows that branch on it. */
  readonly code: string | null;
  readonly run: (action: () => Promise<void>) => Promise<boolean>;
  readonly clear: () => void;
}

/** Runs one submission at a time (double-click safe) and keeps a user-safe error message. */
export function useSubmit(): Submit {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    setError(null);
    setCode(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      setCode(e instanceof ApiError ? e.code : null);
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  const clear = useCallback(() => {
    setError(null);
    setCode(null);
  }, []);

  return { pending, error, code, run, clear };
}
