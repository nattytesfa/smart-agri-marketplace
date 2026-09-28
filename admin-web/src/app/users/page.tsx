'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import AppShell, { ErrorPanel } from '../../components/AppShell';
import PageHeader from '../../components/PageHeader';
import DataTable, { type Column } from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ConfirmDialog from '../../components/ConfirmDialog';
import Pagination from '../../components/Pagination';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { adminRequest, useAsyncData } from '../../hooks/useAdminData';
import { formatDate, formatNumber, initials, roleTone } from '../../lib/format';

interface PendingUser {
  user_id: string;
  phone_number: string;
  fayda_id: string;
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

const loadUsers = () => adminRequest<PendingUser[]>('/api/admin/users');

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
  const { notify } = useToast();
  const { data, error, loading, initialLoading, reload } = useAsyncData<PendingUser[]>(
    loadUsers,
    []
  );

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<{
    kind: 'single' | 'bulk';
    userIds: string[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const users = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
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
  }, [users, search, role]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const toggleRow = useCallback((key: string) => {
    setSelected((current) =>
      current.includes(key) ? current.filter((id) => id !== key) : [...current, key]
    );
  }, []);

  const toggleAll = useCallback(
    (keys: string[], checked: boolean) => {
      setSelected((current) => {
        if (checked) return Array.from(new Set([...current, ...keys]));
        const remove = new Set(keys);
        return current.filter((id) => !remove.has(id));
      });
    },
    []
  );

  const confirmVerification = useCallback(async () => {
    if (!pendingAction) return;
    setSubmitting(true);

    try {
      const results = await Promise.allSettled(
        pendingAction.userIds.map((userId) =>
          adminRequest(`/api/admin/users/${userId}/verify`, { method: 'POST' })
        )
      );

      const succeeded = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      if (succeeded > 0) {
        notify({
          tone: 'success',
          title:
            pendingAction.kind === 'bulk'
              ? `${succeeded} user${succeeded === 1 ? '' : 's'} verified`
              : 'User verified',
          message:
            failed > 0
              ? `${failed} request${failed === 1 ? '' : 's'} failed and need retrying.`
              : 'Their Fayda ID is now confirmed on the platform.',
        });
      }

      if (failed > 0 && succeeded === 0) {
        notify({
          tone: 'danger',
          title: 'Verification failed',
          message: 'The backend rejected the request. Please try again.',
        });
      }

      setSelected([]);
      await reload();
    } finally {
      setSubmitting(false);
      setPendingAction(null);
    }
  }, [pendingAction, notify, reload]);

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
          <button
            type="button"
            className="btn btn--success-soft btn--sm"
            onClick={() =>
              setPendingAction({ kind: 'single', userIds: [user.user_id] })
            }
          >
            <Icon name="check" size={15} />
            Approve
          </button>
        </span>
      ),
    },
  ];

  const selectedCount = selected.length;

  return (
    <AppShell
      title="User Verification"
      subtitle="Cross-reference Fayda IDs before granting platform access"
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
        title="Pending Fayda verifications"
        description="Every applicant listed here is waiting on a national ID cross-reference. Approving grants the account full access to the marketplace."
        actions={
          <button
            type="button"
            className="btn btn--primary"
            disabled={selectedCount === 0 || loading}
            onClick={() => setPendingAction({ kind: 'bulk', userIds: selected })}
          >
            <Icon name="check-circle" size={16} />
            {selectedCount > 0 ? `Approve ${selectedCount} selected` : 'Batch approve'}
          </button>
        }
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
              {formatNumber(filtered.length)} of {formatNumber(users.length)} awaiting
              verification
            </span>
          </div>

          <DataTable
            columns={columns}
            data={visible}
            keyExtractor={(user) => user.user_id}
            loading={initialLoading}
            selectable
            selectedKeys={selected}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            emptyIcon="search"
            emptyTitle="No matching applicants"
            emptyMessage="Try a different search term, or clear the role filter to see everyone waiting for verification."
            caption="Users awaiting Fayda ID verification"
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

      <ConfirmDialog
        open={pendingAction !== null}
        variant="default"
        busy={submitting}
        title={
          pendingAction?.kind === 'bulk'
            ? `Approve ${pendingAction.userIds.length} applicants?`
            : 'Approve this applicant?'
        }
        message={
          pendingAction?.kind === 'bulk'
            ? 'Their Fayda IDs will be marked as verified and they will be able to transact on the platform. This cannot be undone.'
            : "This marks the applicant's Fayda ID as verified and grants them full platform access. This cannot be undone."
        }
        confirmLabel={submitting ? 'Approving…' : 'Approve'}
        onConfirm={confirmVerification}
        onCancel={() => {
          if (!submitting) setPendingAction(null);
        }}
      />
    </AppShell>
  );
}
