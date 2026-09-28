'use client';

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { useAuthGuard, type AdminUser } from '../hooks/useAdminData';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Footer from './Footer';
import Icon from './Icon';

const AdminUserContext = createContext<{ user: AdminUser } | null>(null);

/** Access the signed-in administrator. Must be used inside <AppShell>. */
export function useAdminUser(): { user: AdminUser } {
  const context = useContext(AdminUserContext);
  if (!context) {
    throw new Error('useAdminUser must be used inside an <AppShell>.');
  }
  return context;
}

interface AppShellProps {
  title: string;
  subtitle?: string;
  /** Extra controls rendered at the right of the topbar. */
  topbarActions?: ReactNode;
  children: ReactNode;
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="page-loader">
      <span className="spinner spinner--lg" aria-hidden="true" />
      <p className="page-loader__text">{label}</p>
    </div>
  );
}

export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="alert alert--danger">
          <Icon name="alert-triangle" size={18} className="alert__icon" />
          <div className="alert__content">
            <p className="alert__title">Could not load this data</p>
            <p>{message}</p>
          </div>
        </div>
        {onRetry ? (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <button type="button" className="btn btn--secondary" onClick={onRetry}>
              <Icon name="refresh" size={15} />
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AppShell({
  title,
  subtitle,
  topbarActions,
  children,
}: AppShellProps) {
  const { user, status } = useAuthGuard();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  }, [router]);

  // Close the mobile drawer whenever the viewport grows past the breakpoint.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1025px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setNavOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  if (status !== 'ready' || !user) {
    return (
      <div className="app">
        <div className="app__main" style={{ marginLeft: 0 }}>
          <PageLoader label="Checking your access…" />
        </div>
      </div>
    );
  }

  return (
    <AdminUserContext.Provider value={{ user }}>
      <div className={`app${navOpen ? ' is-nav-open' : ''}`}>
        <a href="#main-content" className="u-visually-hidden">
          Skip to main content
        </a>

        <Sidebar
          userEmail={user.email}
          onNavigate={() => setNavOpen(false)}
          onSignOut={signOut}
        />
        <div className="app__scrim" onClick={() => setNavOpen(false)} role="presentation" />

        <div className="app__main">
          <Topbar title={title} subtitle={subtitle} onOpenNav={() => setNavOpen(true)}>
            {topbarActions}
            <span className="topbar__divider" aria-hidden="true" />
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
            >
              <Icon name="logout" size={18} />
            </button>
          </Topbar>

          <main className="app__content" id="main-content">
            {children}
          </main>

          <Footer />
        </div>
      </div>
    </AdminUserContext.Provider>
  );
}
