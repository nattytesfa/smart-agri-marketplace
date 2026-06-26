'use client';

import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/navigation';

interface TopBarProps {
  title: string;
  subtitle: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-base">logout</span>
          Logout
        </button>
        <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white text-sm font-medium">
          A
        </div>
      </div>
    </div>
  );
}
