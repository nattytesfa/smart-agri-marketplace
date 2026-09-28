'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import AppShell from '../../components/AppShell';
import PageHeader from '../../components/PageHeader';
import Icon, { type IconName } from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import { supabase } from '../../lib/supabaseClient';
import { adminRequest, useAsyncData } from '../../hooks/useAdminData';
import {
  escrowTone,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
} from '../../lib/format';

interface AdminUser {
  user_id: string;
  phone_number: string;
  role: string;
  created_at: string;
}

interface AdminTransaction {
  transaction_id: string;
  amount: number;
  escrow_status: string;
  payment_method: string;
  created_at: string;
  crop_type: string | null;
  buyer_phone: string;
}

interface DashboardData {
  users: number;
  listings: number;
  transactions: number;
  escrowTotal: number;
  lockedValue: number;
  pendingUsers: AdminUser[];
  recentTransactions: AdminTransaction[];
}

async function countTable(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

async function loadDashboard(): Promise<DashboardData> {
  const [users, listings, transactions] = await Promise.all([
    countTable('users'),
    countTable('produce_listings'),
    countTable('transactions'),
  ]);

  // The admin endpoints are the source of truth for the operational figures.
  // If they are unavailable the dashboard still renders from the counts above.
  const [pendingUsers, recentTransactions] = await Promise.all([
    adminRequest<AdminUser[]>('/api/admin/users').catch(() => [] as AdminUser[]),
    adminRequest<AdminTransaction[]>('/api/admin/transactions').catch(
      () => [] as AdminTransaction[]
    ),
  ]);

  const escrowTotal = recentTransactions.reduce(
    (sum, transaction) => sum + (Number(transaction.amount) || 0),
    0
  );
  const lockedValue = recentTransactions
    .filter((transaction) => transaction.escrow_status === 'locked')
    .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);

  return {
    users,
    listings,
    transactions,
    escrowTotal,
    lockedValue,
    pendingUsers,
    recentTransactions,
  };
}

const QUICK_ACTIONS: { href: string; icon: IconName; label: string; meta: string }[] = [
  { href: '/users', icon: 'shield-check', label: 'Verify users', meta: 'Fayda ID checks' },
  { href: '/transactions', icon: 'wallet', label: 'Review escrow', meta: 'Release or refund' },
  { href: '/listings', icon: 'package', label: 'Moderate listings', meta: 'Remove bad items' },
  { href: '/analytics-heatmap', icon: 'trending-up', label: 'Open heatmap', meta: 'Regional supply' },
];

export default function DashboardPage() {
  const { data, error, initialLoading, reload } = useAsyncData<DashboardData>(
    loadDashboard,
    []
  );

  const stats = useMemo(() => {
    const escrowLocked = data?.recentTransactions.filter(
      (transaction) => transaction.escrow_status === 'locked'
    ).length ?? 0;

    return [
      {
        label: 'Registered users',
        value: formatNumber(data?.users ?? 0),
        meta: `${formatNumber(data?.pendingUsers.length ?? 0)} awaiting verification`,
        icon: 'users' as IconName,
        tone: 'blue',
        href: '/users',
      },
      {
        label: 'Produce listings',
        value: formatNumber(data?.listings ?? 0),
        meta: 'Across all farmers',
        icon: 'package' as IconName,
        tone: 'brand',
        href: '/listings',
      },
      {
        label: 'Transactions',
        value: formatNumber(data?.transactions ?? 0),
        meta: `${escrowLocked} funds held in escrow`,
        icon: 'wallet' as IconName,
        tone: 'amber',
        href: '/transactions',
      },
      {
        label: 'Value in escrow',
        value: data ? formatCurrency(data.escrowTotal, 0) : '—',
        meta: data ? `${formatCurrency(data.lockedValue, 0)} currently locked` : 'Loading',
        icon: 'trend-flat' as IconName,
        tone: 'violet',
        href: '/transactions',
      },
    ];
  }, [data]);

  const activity = useMemo(() => {
    if (!data) return [];

    const items: {
      id: string;
      title: string;
      meta: string;
      /** Raw timestamp, used for ordering. */
      timestamp: number;
      /** Human-readable, e.g. "3 days ago". */
      relative: string;
      icon: IconName;
      tone: string;
    }[] = [];

    data.recentTransactions.slice(0, 5).forEach((transaction) => {
      items.push({
        id: `txn-${transaction.transaction_id}`,
        title: `${transaction.crop_type ?? 'Produce'} · ${formatCurrency(transaction.amount)}`,
        meta: `Escrow ${transaction.escrow_status.replace(/_/g, ' ')} · ${transaction.payment_method ?? '—'}`,
        timestamp: new Date(transaction.created_at).getTime() || 0,
        relative: formatRelativeTime(transaction.created_at),
        icon: 'wallet',
        tone: 'feed__icon',
      });
    });

    data.pendingUsers.slice(0, 5).forEach((user) => {
      items.push({
        id: `user-${user.user_id}`,
        title: `Verification request from ${user.phone_number ?? 'unknown user'}`,
        meta: `Role: ${user.role} · registered ${formatDate(user.created_at)}`,
        timestamp: new Date(user.created_at).getTime() || 0,
        relative: formatRelativeTime(user.created_at),
        icon: 'shield-check',
        tone: 'feed__icon--blue',
      });
    });

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 6);
  }, [data]);

  return (
    <AppShell
      title="Admin Central"
      subtitle="Monitor marketplace activity across the platform"
      topbarActions={
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={reload}
          aria-label="Refresh dashboard data"
          title="Refresh"
        >
          <Icon name="refresh" size={18} />
        </button>
      }
    >
      <PageHeader
        eyebrow="Overview"
        eyebrowIcon="sparkles"
        title="Marketplace at a glance"
        description="Live figures pulled directly from the marketplace database. Use the sections below to act on what needs attention."
        actions={
          <Link href="/users" className="btn btn--primary">
            <Icon name="shield-check" size={16} />
            Review verifications
          </Link>
        }
      />

      {error ? (
        <div className="alert alert--danger" style={{ marginBottom: 'var(--space-5)' }}>
          <Icon name="alert-triangle" size={18} className="alert__icon" />
          <div className="alert__content">
            <p className="alert__title">Some figures could not be loaded</p>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      <div className="stack">
        <section className="grid grid--stats stagger" aria-label="Key metrics">
          {stats.map((stat) => (
            <Link key={stat.label} href={stat.href} className="stat stat--link">
              <div className="stat__top">
                <span className="stat__label">{stat.label}</span>
                <span className={`stat__icon stat__icon--${stat.tone}`}>
                  <Icon name={stat.icon} size={18} />
                </span>
              </div>
              {initialLoading ? (
                <span className="skeleton skeleton--title" />
              ) : (
                <p className="stat__value">{stat.value}</p>
              )}
              <p className="stat__meta">
                {initialLoading ? <span className="skeleton skeleton--text" style={{ width: '60%' }} /> : stat.meta}
              </p>
            </Link>
          ))}
        </section>

        <section className="grid grid--halves">
          <div className="card card--flush">
            <div className="card__header">
              <div className="card__titles">
                <h2 className="card__title">Geospatial coverage</h2>
                <p className="card__subtitle">
                  Listings aggregated by region with PostGIS
                </p>
              </div>
              <div className="card__actions">
                <Link href="/analytics-heatmap" className="btn btn--secondary btn--sm">
                  Open heatmap
                  <Icon name="chevron-right" size={15} />
                </Link>
              </div>
            </div>
            <div className="card__body">
              <div className="map-frame">
                <div className="map-frame__content">
                  <span className="map-frame__icon">
                    <Icon name="map-pin" size={26} />
                  </span>
                  <p className="map-frame__title">Regional supply map</p>
                  <p className="map-frame__meta">
                    Visualise where produce is listed across Ethiopia.
                  </p>
                  <Link href="/analytics-heatmap" className="map-frame__link">
                    Explore the heatmap
                    <Icon name="arrow-up-right" size={15} />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="card card--flush">
            <div className="card__header">
              <div className="card__titles">
                <h2 className="card__title">Recent activity</h2>
                <p className="card__subtitle">Latest transactions and verification requests</p>
              </div>
            </div>
            <div className="card__body">
              {initialLoading ? (
                <div className="stack stack--sm">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="feed__item">
                      <span className="skeleton" style={{ width: '2rem', height: '2rem', borderRadius: '999px' }} />
                      <div className="feed__body stack stack--sm">
                        <span className="skeleton skeleton--text" style={{ width: '75%' }} />
                        <span className="skeleton skeleton--text" style={{ width: '50%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activity.length > 0 ? (
                <div className="feed">
                  {activity.map((item) => (
                    <div key={item.id} className="feed__item">
                      <span className={`feed__icon ${item.tone}`}>
                        <Icon name={item.icon} size={15} />
                      </span>
                      <div className="feed__body">
                        <p className="feed__title">{item.title}</p>
                        <p className="feed__meta">{item.meta}</p>
                      </div>
                      <span className="feed__time">{item.relative}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty" style={{ padding: 'var(--space-8) 0' }}>
                  <span className="empty__icon">
                    <Icon name="inbox" size={22} />
                  </span>
                  <p className="empty__title">No recent activity</p>
                  <p className="empty__message">
                    Transactions and verification requests will appear here as they happen.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card card--flush">
          <div className="card__header">
            <div className="card__titles">
              <h2 className="card__title">Quick actions</h2>
              <p className="card__subtitle">Jump straight to the tools you use most</p>
            </div>
          </div>
          <div className="card__body">
            <div className="quick-actions">
              {QUICK_ACTIONS.map((action) => (
                <Link key={action.href} href={action.href} className="quick-action">
                  <span className="quick-action__icon">
                    <Icon name={action.icon} size={17} />
                  </span>
                  <span>
                    <span className="quick-action__label">{action.label}</span>
                    <br />
                    <span className="quick-action__meta">{action.meta}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {data && data.recentTransactions.length > 0 ? (
          <section className="card card--flush">
            <div className="card__header">
              <div className="card__titles">
                <h2 className="card__title">Latest escrow transactions</h2>
                <p className="card__subtitle">Most recent payments moving through escrow</p>
              </div>
              <div className="card__actions">
                <Link href="/transactions" className="btn btn--secondary btn--sm">
                  View all
                  <Icon name="chevron-right" size={15} />
                </Link>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th scope="col">Transaction</th>
                    <th scope="col">Produce</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Status</th>
                    <th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTransactions.slice(0, 5).map((transaction) => (
                    <tr key={transaction.transaction_id}>
                      <td className="table__cell--strong">
                        <span className="chip-mono chip-mono--truncate">
                          {String(transaction.transaction_id).slice(0, 12)}…
                        </span>
                      </td>
                      <td>{transaction.crop_type ?? '—'}</td>
                      <td className="table__cell--strong">
                        {formatCurrency(transaction.amount)}
                      </td>
                      <td>
                        <StatusBadge
                          status={transaction.escrow_status}
                          tone={escrowTone(transaction.escrow_status)}
                        />
                      </td>
                      <td className="table__cell--muted">
                        {formatDate(transaction.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
