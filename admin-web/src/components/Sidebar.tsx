'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { name: 'Geospatial Analytics', href: '/dashboard', icon: 'map' },
  { name: 'User Verification', href: '/users', icon: 'verified_user' },
  { name: 'Escrow Management', href: '/transactions', icon: 'account_balance' },
  { name: 'Commodity Trends', href: '/analytics-heatmap', icon: 'trending_up' },
  { name: 'Field Agents', href: '/agents', icon: 'groups' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex flex-col h-screen w-64 bg-white border-r border-gray-200">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
          <span className="material-symbols-outlined text-lg">agriculture</span>
        </div>
        <div>
          <div className="text-base font-bold text-gray-900">AgriDirect</div>
          <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Admin Portal</div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {navigation.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className={`material-symbols-outlined text-lg ${active ? 'text-emerald-600' : 'text-gray-400'}`}>
                {item.icon}
              </span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <div className="border-t border-gray-100 pt-4">
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <span className="material-symbols-outlined text-lg text-gray-400">settings</span>
            Settings
          </Link>
        </div>
      </div>
    </aside>
  );
}
