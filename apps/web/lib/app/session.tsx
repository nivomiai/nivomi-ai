'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { errorMessage } from '../api/client';
import type { Me, Permission } from '../api/types';
import { api } from './api';

interface SessionValue {
  readonly me: Me | undefined;
  readonly loading: boolean;
  readonly error: string | null;
  /** Re-reads `GET /me`; resolves once the new state is in place. */
  readonly refresh: () => Promise<void>;
  readonly can: (permission: Permission) => boolean;
  /** Makes `organizationId` the session's active organization and opens its overview. */
  readonly switchOrganization: (organizationId: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Loads the signed-in user once for the whole app area (`GET /me`). */
export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMe(await api.get<Me>('/me'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const can = useCallback(
    (permission: Permission) => me?.activeOrganization?.permissions.includes(permission) ?? false,
    [me],
  );

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      await api.put('/me/active-organization', { organizationId });
      await refresh();
      router.push('/app');
    },
    [refresh, router],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      router.replace('/login');
    }
  }, [router]);

  const value = useMemo(
    () => ({ me, loading, error, refresh, can, switchOrganization, signOut }),
    [me, loading, error, refresh, can, switchOrganization, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
