'use client';

import { useMemo, useState } from 'react';
import AppShell, { ErrorPanel } from '../../components/AppShell';
import PageHeader from '../../components/PageHeader';
import DataTable, { type Column } from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import Pagination from '../../components/Pagination';
import Icon from '../../components/Icon';
import { supabase } from '../../lib/supabaseClient';
import { useAsyncData } from '../../hooks/useAdminData';
import {
  formatDate,
  formatNumber,
  initials,
  roleTone,
  titleCase,
  verificationTone,
} from '../../lib/format';

interface Subscription {
  subscription_id: string;
  user_id: string;
  plan_type: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
  notification_channel: string;
}

type SubscriptionRow = Subscription & { phone_number: string | null; role: string | null };

const PAGE_SIZE = 10;

async function loadSubscriptions(): Promise<SubscriptionRow[]> {
  const { data: subscriptions, error } = await supabase
    .from('subscriptions')
    .select(
      'subscription_id, user_id, plan_type, is_active, start_date, end_date, notification_channel'
    )
    .order('start_date', { ascending: false })
    .limit(500);

  if (error) throw error;
  if (!subscriptions || subscriptions.length === 0) return [];

  // Resolve the owning account so the table shows something recognisable.
  const userIds = Array.from(new Set(subscriptions.map((row) => row.user_id)));
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('user_id, phone_number, role')
    .in('user_id', userIds);

  if (usersError) {
    // Subscriptions loaded fine — only the account lookup failed.
    return subscriptions.map((row) => ({ ...row, phone_number: null, role: null }));
  }

  const userMap = new Map(
    (users ?? []).map((user) => [user.user_id, user as { phone_number: string | null; role: string | null }])
  );

  return subscriptions.map((row) => {
    const user = userMap.get(row.user_id);
    return { ...row, phone_number: user?.phone_number ?? null, role: user?.role ?? null };
  });
}

export default function SubscriptionsPage() {
  const { data, error, initialLoading, reload } = useAsyncData<SubscriptionRow[]>(
    loadSubscriptions,
    []
  );

  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('all');
  const [page, setPage] = useState(1);

  const rows = useMemo(() => data ?? [], [data]);

  const planOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.plan_type).filter(Boolean))),
    [rows]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesPlan = plan === 'all' || row.plan_type === plan;
      if (!matchesPlan) return false;
      if (!query) return true;

      return (
        (row.phone_number ?? '').toLowerCase().includes(query) ||
        (row.plan_type ?? '').toLowerCase().includes(query) ||
        (row.user_id ?? '').toLowerCase().includes(query)
      );
    });
  }, [rows, search, plan]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const stats = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((row) => row.is_active).length,
      premium: rows.filter((row) => row.is_active && row.plan_type === 'premium').length,
    }),
    [rows]
  );

  const columns: Column<SubscriptionRow>[] = [
    {
      key: 'user',
      header: 'Account',
      render: (row) => (
        <div className="identity">
          <span className="avatar avatar--sm">{initials(row.phone_number ?? row.user_id)}</span>
          <span className="identity__text">
            <span className="identity__name">{row.phone_number || 'Unknown account'}</span>
            <span className="identity__meta">{String(row.user_id).slice(0, 14)}…</span>
          </span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) =>
        row.role ? (
          <StatusBadge status={row.role} tone={roleTone(row.role)} />
        ) : (
          <span className="table__cell--muted">—</span>
        ),
    },
    {
      key: 'plan_type',
      header: 'Plan',
      render: (row) => (
        <StatusBadge
          status={row.plan_type}
          tone={verificationTone(row.plan_type)}
          label={titleCase(row.plan_type)}
        />
      ),
    },
    {
      key: 'notification_channel',
      header: 'Notifications',
      render: (row) => (
        <span className="table__cell--muted">
          {titleCase(row.notification_channel) || '—'}
        </span>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      render: (row) => (
        <span className="table__cell--muted">
          {formatDate(row.start_date)} – {formatDate(row.end_date)}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (row) => (
        <StatusBadge
          status={row.is_active ? 'active' : 'inactive'}
          tone={row.is_active ? 'success' : 'neutral'}
          showDot={false}
        />
      ),
    },
  ];

  return (
    <AppShell
      title="Subscriptions"
      subtitle="Plan adoption and premium notification reach"
      topbarActions={
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={reload}
          aria-label="Refresh subscriptions"
          title="Refresh"
        >
          <Icon name="refresh" size={18} />
        </button>
      }
    >
      <PageHeader
        eyebrow="Operations"
        eyebrowIcon="card"
        title="Subscription plans"
        description="Premium subscribers receive SMS as well as push notifications for price and advisory alerts. Plans renew monthly."
      />

      {error ? (
        <ErrorPanel message={error} onRetry={reload} />
      ) : (
        <div className="stack">
          <div className="grid grid--stats stagger">
            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Total subscriptions</span>
                <span className="stat__icon stat__icon--violet">
                  <Icon name="card" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatNumber(stats.total)
                )}
              </p>
              <p className="stat__meta">All recorded plans</p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Active</span>
                <span className="stat__icon stat__icon--brand">
                  <Icon name="check-circle" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatNumber(stats.active)
                )}
              </p>
              <p className="stat__meta">Currently billing</p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Premium members</span>
                <span className="stat__icon stat__icon--amber">
                  <Icon name="sparkles" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatNumber(stats.premium)
                )}
              </p>
              <p className="stat__meta">Eligible for SMS alerts</p>
            </div>
          </div>

          <div className="card card--flush">
            <div className="toolbar">
              <div className="toolbar__search">
                <Icon name="search" size={16} className="toolbar__search-icon" />
                <input
                  type="search"
                  className="input"
                  placeholder="Search account or plan…"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Search subscriptions"
                />
              </div>

              <div className="toolbar__filters">
                <label className="u-visually-hidden" htmlFor="plan-filter">
                  Filter by plan
                </label>
                <select
                  id="plan-filter"
                  className="select"
                  style={{ width: 'auto', minWidth: '9rem' }}
                  value={plan}
                  onChange={(event) => {
                    setPlan(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All plans</option>
                  {planOptions.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </select>
              </div>

              <span className="toolbar__count">
                Showing {filtered.length} of {formatNumber(rows.length)} subscriptions
              </span>
            </div>

            <DataTable
              columns={columns}
              data={visible}
              keyExtractor={(row) => String(row.subscription_id)}
              loading={initialLoading}
              emptyIcon="card"
              emptyTitle="No subscriptions yet"
              emptyMessage={
                rows.length === 0
                  ? 'Nobody has subscribed to a plan yet. Premium plans unlock SMS notifications.'
                  : 'No subscription matches the current search and plan filter.'
              }
              caption="Subscription plans"
            />

            <div className="card__footer">
              <span>
                Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filtered.length)} of {formatNumber(filtered.length)}
              </span>
              <Pagination page={safePage} pageCount={pageCount} onPageChange={setPage} />
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
