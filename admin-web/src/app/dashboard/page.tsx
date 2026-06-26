'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import Sidebar from '../../components/Sidebar';
import TopBar from '../../components/Topbar';

export default function DashboardPage() {
  const [stats, setStats] = useState({ users: 0, listings: 0, transactions: 0 });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      await fetchStats();
    };
    checkAuth();
  }, [router]);

  const fetchStats = async () => {
    try {
      const [usersRes, listingsRes, transactionsRes] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('produce_listings').select('*', { count: 'exact', head: true }),
        supabase.from('transactions').select('*', { count: 'exact', head: true }),
      ]);
      setStats({
        users: usersRes.count || 0,
        listings: listingsRes.count || 0,
        transactions: transactionsRes.count || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-gray-200 border-t-emerald-600" />
      </div>
    );
  }

  const cards = [
    { label: 'Total Users', value: stats.users, icon: 'people', bg: 'bg-blue-50', iconCls: 'text-blue-600' },
    { label: 'Total Listings', value: stats.listings, icon: 'shopping_bag', bg: 'bg-emerald-50', iconCls: 'text-emerald-600' },
    { label: 'Total Transactions', value: stats.transactions, icon: 'payments', bg: 'bg-amber-50', iconCls: 'text-amber-600' },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-64">
        <main className="p-8">
          <TopBar title="Admin Central" subtitle="Monitor your marketplace activity" />

          <div className="mb-8 bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="h-80 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto rounded-xl bg-white shadow-sm border border-gray-200 flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-3xl text-emerald-600">map</span>
                </div>
                <p className="text-gray-500 font-medium">Geospatial Map View</p>
                <p className="text-sm text-gray-400 mt-0.5">Leaflet &amp; PostGIS Integration</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {cards.map((c) => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center`}>
                    <span className={`material-symbols-outlined ${c.iconCls}`}>{c.icon}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-0.5">{c.label}</p>
                <p className="text-3xl font-bold text-gray-900">{c.value}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
