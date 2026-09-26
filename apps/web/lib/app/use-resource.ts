'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';
import { api } from './api';

export interface Resource<T> {
  readonly data: T | undefined;
  readonly error: string | null;
  readonly loading: boolean;
  readonly reload: () => void;
}

export interface ResourceOptions<T> {
  /** Re-fetches every `pollMs` while this returns true (background progress). */
  readonly pollWhile?: (data: T) => boolean;
  readonly pollMs?: number;
}

/** Loads `path` from the API (null skips); aborts on unmount or when the path changes. */
export function useResource<T>(path: string | null, options: ResourceOptions<T> = {}): Resource<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [version, setVersion] = useState(0);
  const pollWhile = useRef(options.pollWhile);
  pollWhile.current = options.pollWhile;
  const pollMs = options.pollMs ?? 1_500;

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (initial: boolean) => {
      if (initial) {
        setLoading(true);
        setError(null);
      }
      api
        .get<T>(path, controller.signal)
        .then((value) => {
          setData(value);
          setError(null);
          if (pollWhile.current?.(value)) timer = setTimeout(() => load(false), pollMs);
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        })
        .finally(() => {
          if (!controller.signal.aborted && initial) setLoading(false);
        });
    };
    load(true);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, version, pollMs]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}
