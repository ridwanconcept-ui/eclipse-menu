import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { AdminUser } from '../../shared/types';
import { api, ApiError } from './api';
import { Spinner } from '../components/ui';

interface AuthState {
  user: AdminUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [user, setUser] = useState<AdminUser | null>(null);
  // Only the admin area needs a session; the public menu never asks for one.
  const [loading, setLoading] = useState(location.pathname.startsWith('/admin'));

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await api.me();
      setUser(me);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) {
        // Network failure — leave the user unauthenticated rather than looping.
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) void refresh();
    else setLoading(false);
    // Re-check only when entering/leaving the admin area.
  }, [location.pathname.startsWith('/admin'), refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: me } = await api.login(email, password);
    setUser(me);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return <AuthCtx.Provider value={{ user, loading, signIn, signOut, refresh }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}

/** Blocks unauthenticated access to the dashboard. Authorization is enforced server-side too. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3 text-smoke">
        <Spinner className="text-gold-300" /> Checking your session…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
