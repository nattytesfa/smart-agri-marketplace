'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import AppShell, { ErrorPanel } from '../../../components/AppShell';
import PageHeader from '../../../components/PageHeader';
import Icon from '../../../components/Icon';
import StatusBadge from '../../../components/StatusBadge';
import { supabase } from '../../../lib/supabaseClient';
import { adminRequest, useAsyncData, useAdminAutoRefresh } from '../../../hooks/useAdminData';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  initials,
  roleTone,
  titleCase,
} from '../../../lib/format';

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

interface UserDetail {
  pending: PendingUser | null;
  subscription: {
    plan_type: string;
    is_active: boolean;
    start_date: string;
    end_date: string;
  } | null;
  listingCount: number;
  transactionCount: number;
}

async function loadUserDetail(userId: string): Promise<UserDetail> {
  const pending = await adminRequest<PendingUser>(`/api/admin/users/${userId}`);

  const [subscriptionResult, listingsResult, transactionsResult] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('plan_type, is_active, start_date, end_date')
      .eq('user_id', userId)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('produce_listings')
      .select('*', { count: 'exact', head: true })
      .eq('farmer_id', userId),
    supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .or(`farmer_id.eq.${userId},buyer_id.eq.${userId}`),
  ]);

  return {
    pending,
    subscription: subscriptionResult.data ?? null,
    listingCount: listingsResult.count ?? 0,
    transactionCount: transactionsResult.count ?? 0,
  };
}

export default function UserDetailPage() {
  const params = useParams();
  const userId = typeof params?.id === 'string' ? params.id : '';

  const { data, error, loading, initialLoading, reload } = useAsyncData<UserDetail>(
    () => loadUserDetail(userId),
    [userId]
  );

  useAdminAutoRefresh(reload);

  const user = data?.pending;

  const profileRows = useMemo(() => {
    if (!user) return [];
    return [
      { label: 'Fayda ID', value: user.fayda_id || 'Not supplied' },
      { label: 'Verification', value: user.fayda_verified ? 'Verified' : 'Awaiting verification' },
      { label: 'Verified at', value: user.fayda_verified_at ? formatDateTime(user.fayda_verified_at) : '—' },
      { label: 'Role', value: titleCase(user.role) },
      { label: 'Phone number', value: user.phone_number || 'Not supplied' },
      { label: 'Registered', value: formatDateTime(user.created_at) },
      { label: 'Farm size', value: user.farm_size_hectares ? `${user.farm_size_hectares} hectares` : '—' },
      {
        label: 'Storage type',
        value: user.storage_type ? titleCase(user.storage_type) : '—',
      },
      { label: 'Business name', value: user.business_name || '—' },
      { label: 'Buyer type', value: user.buyer_type ? titleCase(user.buyer_type) : '—' },
    ];
  }, [user]);

  return (
    <AppShell
      title="User details"
      subtitle={user ? `Account ${user.phone_number || user.user_id.slice(0, 12)}` : 'Loading account'}
      topbarActions={
        <>
          <Link href="/users" className="btn btn--secondary btn--sm">
            <Icon name="arrow-left" size={15} />
            Back to users
          </Link>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={reload}
            aria-label="Refresh user details"
            title="Refresh"
            disabled={loading}
          >
            <Icon name="refresh" size={18} />
          </button>
        </>
      }
    >
      <PageHeader
        eyebrow="User Verification"
        eyebrowIcon="shield-check"
        title={user ? user.business_name || user.phone_number || 'Applicant' : 'Applicant'}
        description="A consolidated view of this account across verification, subscriptions and marketplace activity."
      />

      {error ? (
        <ErrorPanel message={error} onRetry={reload} />
      ) : !user && !initialLoading ? (
        <div className="card">
          <div className="card__body">
            <div className="empty">
              <span className="empty__icon">
                <Icon name="user-group" size={24} />
              </span>
              <p className="empty__title">User not found</p>
              <p className="empty__message">
                No account matches <code>{userId || 'this identifier'}</code>.
              </p>
              <Link href="/users" className="btn btn--secondary" style={{ marginTop: 'var(--space-2)' }}>
                Return to users
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="card">
            <div className="card__body">
              <div className="identity" style={{ gap: 'var(--space-4)' }}>
                <span className="avatar avatar--lg">
                  {initials(user?.phone_number ?? userId)}
                </span>
                <div>
                  <p style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-strong)' }}>
                    {user?.business_name || user?.phone_number || 'Applicant'}
                  </p>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <StatusBadge status={user?.role ?? 'unknown'} tone={roleTone(user?.role)} />
                    <StatusBadge
                      status={user?.fayda_verified ? 'verified' : 'pending'}
                      tone={user?.fayda_verified ? 'success' : 'warning'}
                      label={user?.fayda_verified ? 'Fayda verified' : 'Awaiting verification'}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid--stats stagger">
            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Listings</span>
                <span className="stat__icon stat__icon--brand">
                  <Icon name="package" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatNumber(data?.listingCount ?? 0)
                )}
              </p>
              <p className="stat__meta">Produce posted</p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Transactions</span>
                <span className="stat__icon stat__icon--blue">
                  <Icon name="wallet" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatNumber(data?.transactionCount ?? 0)
                )}
              </p>
              <p className="stat__meta">Buying or selling</p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Subscription</span>
                <span className="stat__icon stat__icon--violet">
                  <Icon name="card" size={18} />
                </span>
              </div>
              <p className="stat__value" style={{ fontSize: 'var(--text-xl)' }}>
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : data?.subscription ? (
                  titleCase(data.subscription.plan_type)
                ) : (
                  'None'
                )}
              </p>
              <p className="stat__meta">
                {data?.subscription
                  ? `${data.subscription.is_active ? 'Active until' : 'Ended'} ${formatDate(data.subscription.end_date)}`
                  : 'No plan on this account'}
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card__header">
              <div className="card__titles">
                <h2 className="card__title">Profile and verification data</h2>
                <p className="card__subtitle">
                  Sourced from the national ID cross-reference and the platform profile
                </p>
              </div>
            </div>
            <div className="card__body">
              <div className="detail-list">
                {profileRows.map((row) => (
                  <div key={row.label} className="detail-list__item">
                    <span className="detail-list__label">{row.label}</span>
                    <span className="detail-list__value">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  );
}
