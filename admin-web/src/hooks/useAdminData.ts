'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getBackendClient } from '../lib/apiClient';

export interface AdminUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Resolves the signed-in Supabase session and confirms the account holds the
 * admin role before any page renders. Redirects to /login when the session is
 * missing or the role is insufficient.
 */
export function useAuthGuard() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'redirecting'>('loading');

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session?.user) {
        setStatus('redirecting');
        window.location.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (profile?.role !== 'admin') {
        await supabase.auth.signOut();
        setStatus('redirecting');
        window.location.replace('/login?reason=forbidden');
        return;
      }

      setUser({
        id: session.user.id,
        email: session.user.email ?? 'admin',
        role: 'admin',
      });
      setStatus('ready');
    };

    resolve().catch(() => {
      if (!cancelled) setStatus('redirecting');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { user, status };
}

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True only on the first load — lets pages show a skeleton instead of a spinner. */
  initialLoading: boolean;
  reload: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Runs an async loader, tracking loading/error state and guarding against
 * state updates after unmount or when a newer request has superseded this one.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList = []
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);

  const requestId = useRef(0);
  const mounted = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const result = await loaderRef.current();
      if (!mounted.current || id !== requestId.current) return;
      setData(result);
    } catch (err: any) {
      if (!mounted.current || id !== requestId.current) return;
      setError(
        err?.response?.data?.error ||
          err?.message ||
          'Something went wrong while loading data.'
      );
    } finally {
      if (mounted.current && id === requestId.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, initialLoading, reload, setData };
}

/** Calls an authenticated admin backend endpoint and returns its JSON body. */
export async function adminRequest<T>(path: string, config?: object): Promise<T> {
  const api = await getBackendClient();
  const response = await api.request<T>({
    url: path,
    method: 'GET',
    ...config,
  });
  return response.data;
}
