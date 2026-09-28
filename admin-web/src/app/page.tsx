'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (profile?.role === 'admin') {
          router.replace('/dashboard');
          return;
        }
        await supabase.auth.signOut();
      }

      router.replace('/login');
    };

    checkAuth();
  }, [router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span className="spinner spinner--lg" style={{ color: 'var(--brand)' }} role="status">
        <span className="u-visually-hidden">Loading</span>
      </span>
    </div>
  );
}
