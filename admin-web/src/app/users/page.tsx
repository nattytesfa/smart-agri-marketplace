'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import AppShell, { ErrorPanel } from '../../components/AppShell';
import PageHeader from '../../components/PageHeader';
import DataTable, { type Column } from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import Pagination from '../../components/Pagination';
import Icon from '../../components/Icon';
import { adminRequest, useAsyncData, useAdminAutoRefresh } from '../../hooks/useAdminData';
import { formatDate, formatNumber, initials, roleTone } from '../../lib/format';

interface PendingUser {
  user_id: string;
  phone_number: string;
  fayda_id: string;
  fayda_verified: boolean;
  fayda_verified_at: string | null;
  role: string;
  created_at: string;
  farm_size_hectares: number | null;
  storage_type: string | null;
  business_name: string | null;
  buyer_type: string | null;
}

const PAGE_SIZE = 8;

const ROLE_OPTIONS = [
  { value: 'all', label: 'All roles' },
  { value: 'farmer', label: 'Farmers' },
  { value: 'buyer', label: 'Buyers' },
  { value: 'agent', label: 'Field agents' },
  { value: 'admin', label: 'Admins' },
];

const loadUsers = () => adminRequest<PendingUser[]>('/api/admin/users?status=all');

function profileSummary(user: PendingUser): string {
  if (user.role === 'farmer') {
    const size = user.farm_size_hectares ? `${user.farm_size_hectares} ha` : null;
    const storage = user.storage_type ? user.storage_type.replace(/_/g, ' ') : null;
    return [size, storage].filter(Boolean).join(' · ') || 'No farm profile';
  }
  if (user.role === 'buyer') {
    return (
      [user.business_name, user.buyer_type?.replace(/_/g, ' ')]
        .filter(Boolean)
        .join(' · ') || 'No buyer profile'
    );
  }
  return '—';
}

export default function UsersPage() {
  const { data, error, loading, initialLoading, reload } = useAsyncData<PendingUser[]>(
    loadUsers,
    []
  );

  const [search, setSearch] = useState('');
  const [verification, setVerification] = useState('pending');
  useAdminAutoRefresh(reload);
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);

  const users = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
      if (verification === 'pending' && user.fayda_verified) return false;
      if (verification === 'verified' && !user.fayda_verified) return false;
      const matchesRole = role === 'all' || user.role === role;
      if (!matchesRole) return false;
      if (!query) return true;

      return (
        (user.phone_number ?? '').toLowerCase().includes(query) ||
        (user.fayda_id ?? '').toLowerCase().includes(query) ||
        (user.business_name ?? '').toLowerCase().includes(query) ||
        (user.user_id ?? '').toLowerCase().includes(query)
      );
    });
  }, [users, search, role, verification]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const columns: Column<PendingUser>[] = [
    {
      key: 'user',
      header: 'Applicant',
      render: (user) => (
        <div className="identity">
          <span className="avatar">{initials(user.phone_number)}</span>
          <span className="identity__text">
            <span className="identity__name">
              {user.business_name || user.phone_number || 'Unknown'}
            </span>
            <span className="identity__meta">
              {String(user.user_id ?? '').slice(0, 14)}…
            </span>
          </span>
        </div>
      ),
    },
    {
      key: 'fayda_id',
      header: 'Fayda ID',
      render: (user) => (
        <span className="chip-mono">{user.fayda_id || 'Not supplied'}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (user) => <StatusBadge status={user.role} tone={roleTone(user.role)} />,
    },
    {
      key: 'verification',
      header: 'Verification',
      render: (user) => (
        <StatusBadge
          status={user.fayda_verified ? 'verified' : 'pending'}
          tone={user.fayda_verified ? 'success' : 'warning'}
          label={user.fayda_verified ? 'Fayda verified' : 'Awaiting verification'}
        />
      ),
    },
    {
      key: 'profile',
      header: 'Profile',
      render: (user) => <span className="table__cell--muted">{profileSummary(user)}</span>,
    },
    {
      key: 'created_at',
      header: 'Registered',
      render: (user) => (
        <span className="table__cell--muted">{formatDate(user.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'table__cell--actions',
      render: (user) => (
        <span className="table__actions">
          <Link
            href={`/users/${user.user_id}`}
            className="btn btn--ghost btn--icon btn--sm"
            aria-label={`View details for ${user.phone_number}`}
            title="View details"
            onClick={(event) => event.stopPropagation()}
          >
            <Icon name="eye" size={16} />
          </Link>
        </span>
      ),
    },
  ];

  return (
    <AppShell
      title="User Verification"
      subtitle="View user profiles and Fayda verification status"
      topbarActions={
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={reload}
          aria-label="Refresh user list"
          title="Refresh"
        >
          <Icon name="refresh" size={18} />
        </button>
      }
    >
      <PageHeader
        eyebrow="Operations"
        eyebrowIcon="shield-check"
        title="Fayda verifications"
        description="Review pending accounts and identities verified through Fayda in the mobile app."
      />

      {error ? (
        <ErrorPanel message={error} onRetry={reload} />
      ) : (
        <div className="card card--flush">
          <div className="toolbar">
            <div className="toolbar__search">
              <Icon name="search" size={16} className="toolbar__search-icon" />
              <input
                type="search"
                className="input"
                placeholder="Search phone, Fayda ID or business name…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                aria-label="Search applicants"
              />
            </div>

            <div className="toolbar__filters">
              <label className="u-visually-hidden" htmlFor="verification-filter">Filter by verification</label>
              <select
                id="verification-filter"
                className="select"
                value={verification}
                onChange={(event) => {
                  setVerification(event.target.value);
                  setPage(1);
                }}
              >
                <option value="pending">Pending verification</option>
                <option value="verified">Verified</option>
                <option value="all">All verification statuses</option>
              </select>
              <label className="u-visually-hidden" htmlFor="role-filter">
                Filter by role
              </label>
              <select
                id="role-filter"
                className="select"
                style={{ width: 'auto', minWidth: '9rem' }}
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  setPage(1);
                }}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <span className="toolbar__count">
              {formatNumber(filtered.length)} of {formatNumber(users.length)} accounts
            </span>
          </div>

          <DataTable
            columns={columns}
            data={visible}
            keyExtractor={(user) => user.user_id}
            loading={initialLoading}
            emptyIcon="search"
            emptyTitle="No matching applicants"
            emptyMessage="Try another search term or change the verification and role filters."
            caption="User Fayda verification status"
          />

          <div className="card__footer">
            <span>
              Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filtered.length)} of {formatNumber(filtered.length)}
            </span>
            <Pagination
              page={safePage}
              pageCount={pageCount}
              onPageChange={setPage}
              disabled={loading}
            />
          </div>
        </div>
      )}

    </AppShell>
  );
}
