'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import TopBar from '../../components/Topbar';
import Footer from '../../components/Footer';
import StatusBadge from '../../components/StatusBadge';
import ConfirmDialog from '../../components/ConfirmDialog';
import { supabase } from '../../lib/supabaseClient';
import { getBackendClient } from '../../lib/apiClient';

interface User {
  user_id: string;
  phone_number: string;
  fayda_id: string;
  role: string;
  created_at: string;
  farm_size_hectares: number;
  storage_type: string;
  business_name: string;
  buyer_type: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; userId: string; action: 'approve' | 'reject' }>({
    open: false,
    userId: '',
    action: 'approve',
  });
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      await fetchUsers();
    };
    checkAuth();
  }, [router]);

  const fetchUsers = async () => {
    try {
      const api = await getBackendClient();
      const response = await api.get('/api/admin/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const verifyUser = async (userId: string) => {
    try {
      const api = await getBackendClient();
      await api.post(`/api/admin/users/${userId}/verify`);
      setConfirmDialog({ open: false, userId: '', action: 'approve' });
      await fetchUsers();
    } catch (error) {
      console.error('Error verifying user:', error);
    }
  };

  const rejectUser = async (userId: string) => {
    setConfirmDialog({ open: true, userId, action: 'reject' });
  };

  const handleConfirm = () => {
    if (confirmDialog.action === 'approve') {
      verifyUser(confirmDialog.userId);
    } else {
      setConfirmDialog({ open: false, userId: '', action: 'reject' });
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        searchQuery === '' ||
        user.phone_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.fayda_id?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-14 h-14 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-600 text-lg">verified_user</span>
            </div>
          </div>
          <p className="text-sm text-gray-500 font-medium">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50/80">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 pb-16">
        <TopBar
          title="User Verification"
          subtitle={`${filteredUsers.length} applications awaiting national ID cross-reference`}
        />

        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm animate-fade-in overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600">verified_user</span>
              Pending Fayda ID Verification
            </h3>
            <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-all duration-150 shadow-sm shadow-emerald-200 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">playlist_add_check</span>
              Batch Process
            </button>
          </div>

          <div className="p-5 border-b border-gray-100 bg-gray-50/50">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none">search</span>
                <input
                  type="text"
                  placeholder="Search by phone or Fayda ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-150"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-4 py-2 text-sm bg-white border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all duration-150"
              >
                <option value="all">All Roles</option>
                <option value="farmer">Farmers</option>
                <option value="buyer">Buyers</option>
                <option value="agent">Field Agents</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-400 tracking-widest">User</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-400 tracking-widest">Fayda ID</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-400 tracking-widest">Region</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-400 tracking-widest">Role</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-400 tracking-widest">Registered</th>
                  <th className="px-6 py-4 text-[11px] uppercase font-bold text-gray-400 tracking-widest text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredUsers.map((user) => (
                  <tr key={user.user_id} className="group hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center text-emerald-700 font-bold text-xs shadow-sm">
                          {user.phone_number?.substring(6, 8) || 'NA'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {user.phone_number || 'Unknown'}
                          </p>
                          <p className="text-[11px] text-gray-400">{user.user_id?.substring(0, 12)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                        {user.fayda_id || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">Oromia</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={user.role} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => verifyUser(user.user_id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition-colors border border-emerald-200"
                        >
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          Approve
                        </button>
                        <button
                          onClick={() => rejectUser(user.user_id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-semibold transition-colors border border-red-200"
                        >
                          <span className="material-symbols-outlined text-sm">cancel</span>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-3xl text-gray-300">search_off</span>
                        <p className="text-sm text-gray-400 font-medium">No matching users found</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
            <span className="text-xs text-gray-500 font-medium">
              Showing {filteredUsers.length} of {users.length} pending verifications
            </span>
            <div className="flex gap-1.5">
              <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-40">
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-600 text-white text-xs font-bold shadow-sm shadow-emerald-200">1</button>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500 transition-colors">
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.action === 'approve' ? 'Approve User' : 'Reject User'}
        message={
          confirmDialog.action === 'approve'
            ? 'This will verify the user\'s Fayda ID and grant them full platform access.'
            : 'Are you sure you want to reject this user\'s verification request? This action cannot be undone.'
        }
        confirmLabel={confirmDialog.action === 'approve' ? 'Approve' : 'Reject'}
        variant={confirmDialog.action === 'reject' ? 'danger' : 'default'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmDialog({ open: false, userId: '', action: 'approve' })}
      />
    </div>
  );
}
