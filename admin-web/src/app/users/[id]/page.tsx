'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import Sidebar from '../../../components/Sidebar';
import TopBar from '../../../components/Topbar';
import Footer from '../../../components/Footer';

export default function UserDetailPage() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setLoading(false);
    };
    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50/80">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 pb-16">
        <TopBar title="User Details" subtitle={`Viewing user ${params?.id || ''}`} />
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-16 text-center animate-fade-in">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-3xl text-blue-500">person</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">User Profile</h3>
          <p className="text-sm text-gray-500">Detailed user information and activity history.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
