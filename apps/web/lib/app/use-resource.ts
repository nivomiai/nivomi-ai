'use client';

import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { api } from './api';

export interface Resource<T> {
  readonly data: T | undefined;
  readonly error: string | null;
  readonly loading: boolean;
  readonly reload: () => void;
}

/** Loads `path` from the API (null skips); aborts on unmount or when the path changes. */
export function useResource<T>(path: string | null): Resource<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get<T>(path, controller.signal)
      .then((value) => setData(value))
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}
