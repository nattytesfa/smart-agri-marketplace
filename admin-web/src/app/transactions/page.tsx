'use client';

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
import {
  escrowTone,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  orDash,
  titleCase,
} from '../../lib/format';

interface EscrowTransaction {
  transaction_id: string;
  amount: number;
  escrow_status: string;
  payment_method: string;
  created_at: string;
  released_at: string | null;
  transaction_hash: string | null;
  buyer_phone: string;
  farmer_phone: string;
  crop_type: string | null;
}

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  'all',
  'locked',
  'pending',
  'disputed',
  'released',
  'refunded',
];

const loadTransactions = () =>
  adminRequest<EscrowTransaction[]>('/api/admin/transactions');

export default function TransactionsPage() {
  const { notify } = useToast();
  const { data, error, loading, initialLoading, reload } = useAsyncData<EscrowTransaction[]>(
    loadTransactions,
    []
  );

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [resolution, setResolution] = useState<{
    transaction: EscrowTransaction;
    outcome: 'released' | 'refunded';
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const transactions = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const matchesStatus = status === 'all' || transaction.escrow_status === status;
      if (!matchesStatus) return false;
      if (!query) return true;

      return (
        (transaction.crop_type ?? '').toLowerCase().includes(query) ||
        (transaction.buyer_phone ?? '').toLowerCase().includes(query) ||
        (transaction.farmer_phone ?? '').toLowerCase().includes(query) ||
        (transaction.transaction_id ?? '').toLowerCase().includes(query) ||
        (transaction.transaction_hash ?? '').toLowerCase().includes(query)
      );
    });
  }, [transactions, search, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const totals = useMemo(() => {
    const sumFor = (predicate: (transaction: EscrowTransaction) => boolean) =>
      transactions
        .filter(predicate)
        .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);

    return {
      all: sumFor(() => true),
      locked: sumFor((transaction) => transaction.escrow_status === 'locked'),
      disputed: transactions.filter((transaction) => transaction.escrow_status === 'disputed')
        .length,
    };
  }, [transactions]);

  const confirmResolution = useCallback(async () => {
    if (!resolution) return;
    setSubmitting(true);

    try {
      await adminRequest(`/api/admin/transactions/${resolution.transaction.transaction_id}/resolve`, {
        method: 'POST',
        data: { status: resolution.outcome },
      });

      notify({
        tone: 'success',
        title: resolution.outcome === 'released' ? 'Funds released' : 'Payment refunded',
        message:
          resolution.outcome === 'released'
            ? 'The farmer has been paid and escrow is now closed.'
            : 'The buyer has been refunded and escrow is now closed.',
      });

      setResolution(null);
      await reload();
    } catch (err: any) {
      notify({
        tone: 'danger',
        title: 'Could not update escrow',
        message: err?.response?.data?.error || 'The backend rejected the request.',
      });
      setResolution(null);
    } finally {
      setSubmitting(false);
    }
  }, [resolution, notify, reload]);

  const columns: Column<EscrowTransaction>[] = [
    {
      key: 'transaction_id',
      header: 'Transaction',
      render: (transaction) => (
        <div className="identity">
          <span className="avatar avatar--sm avatar--slate">
            <Icon name="hash" size={13} />
          </span>
          <span className="identity__text">
            <span className="identity__name">
              {String(transaction.transaction_id).slice(0, 12)}…
            </span>
            <span className="identity__meta">
              {formatDateTime(transaction.created_at)}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: 'crop_type',
      header: 'Produce',
      render: (transaction) => orDash(transaction.crop_type),
    },
    {
      key: 'parties',
      header: 'Buyer → Farmer',
      render: (transaction) => (
        <span className="table__cell--muted">
          {transaction.buyer_phone || '—'} <Icon name="arrow-up-right" size={12} style={{ display: 'inline', verticalAlign: '-1px' }} />{' '}
          {transaction.farmer_phone || '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (transaction) => (
        <span className="table__cell--strong">{formatCurrency(transaction.amount)}</span>
      ),
    },
    {
      key: 'payment_method',
      header: 'Method',
      render: (transaction) => (
        <span className="chip-mono">{orDash(transaction.payment_method)}</span>
      ),
    },
    {
      key: 'escrow_status',
      header: 'Escrow',
      render: (transaction) => (
        <StatusBadge
          status={transaction.escrow_status}
          tone={escrowTone(transaction.escrow_status)}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'table__cell--actions',
      render: (transaction) => {
        const isOpen = ['locked', 'pending', 'disputed'].includes(
          String(transaction.escrow_status).toLowerCase()
        );
        if (!isOpen) {
          return (
            <span className="table__cell--muted" style={{ fontSize: 'var(--text-xs)' }}>
              Closed
            </span>
          );
        }
        return (
          <span className="table__actions">
            <button
              type="button"
              className="btn btn--success-soft btn--sm"
              onClick={() => setResolution({ transaction, outcome: 'released' })}
            >
              <Icon name="check" size={15} />
              Release
            </button>
            <button
              type="button"
              className="btn btn--danger-soft btn--sm"
              onClick={() => setResolution({ transaction, outcome: 'refunded' })}
            >
              <Icon name="arrow-left" size={15} />
              Refund
            </button>
          </span>
        );
      },
    },
  ];

  return (
    <AppShell
      title="Escrow Management"
      subtitle="Monitor held funds and resolve disputes"
      topbarActions={
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={reload}
          aria-label="Refresh transactions"
          title="Refresh"
        >
          <Icon name="refresh" size={18} />
        </button>
      }
    >
      <PageHeader
        eyebrow="Operations"
        eyebrowIcon="wallet"
        title="Escrow transactions"
        description="Funds stay locked until delivery is confirmed. Releasing pays the farmer; refunding returns the money to the buyer. Both actions are final."
      />

      {error ? (
        <ErrorPanel message={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid--stats stagger" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Total transactions</span>
                <span className="stat__icon stat__icon--blue">
                  <Icon name="wallet" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatNumber(transactions.length)
                )}
              </p>
              <p className="stat__meta">
                <strong>{formatCurrency(totals.all, 0)}</strong> gross value
              </p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Held in escrow</span>
                <span className="stat__icon stat__icon--amber">
                  <Icon name="lock" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatCurrency(totals.locked, 0)
                )}
              </p>
              <p className="stat__meta">Awaiting release or refund</p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Disputed</span>
                <span className="stat__icon stat__icon--red">
                  <Icon name="alert-triangle" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatNumber(totals.disputed)
                )}
              </p>
              <p className="stat__meta">Need an administrator decision</p>
            </div>
          </div>

          <div className="card card--flush">
            <div className="toolbar">
              <div className="toolbar__search">
                <Icon name="search" size={16} className="toolbar__search-icon" />
                <input
                  type="search"
                  className="input"
                  placeholder="Search produce, phone, transaction or hash…"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Search transactions"
                />
              </div>

              <div className="toolbar__filters">
                <label className="u-visually-hidden" htmlFor="escrow-filter">
                  Filter by escrow status
                </label>
                <select
                  id="escrow-filter"
                  className="select"
                  style={{ width: 'auto', minWidth: '9.5rem' }}
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === 'all' ? 'All statuses' : titleCase(option)}
                    </option>
                  ))}
                </select>
              </div>

              <span className="toolbar__count">
                Showing {filtered.length} of {formatNumber(transactions.length)} transactions
              </span>
            </div>

            <DataTable
              columns={columns}
              data={visible}
              keyExtractor={(transaction) => String(transaction.transaction_id)}
              loading={initialLoading}
              emptyIcon="wallet"
              emptyTitle="No transactions found"
              emptyMessage={
                transactions.length === 0
                  ? 'No payments have moved through escrow yet.'
                  : 'No transaction matches the current search and status filter.'
              }
              caption="Escrow transactions"
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
        </>
      )}

      <ConfirmDialog
        open={resolution !== null}
        variant={resolution?.outcome === 'refunded' ? 'danger' : 'default'}
        busy={submitting}
        title={
          resolution?.outcome === 'refunded' ? 'Refund the buyer?' : 'Release funds to the farmer?'
        }
        message={
          resolution
            ? resolution.outcome === 'refunded'
              ? `${formatCurrency(resolution.transaction.amount)} will be returned to ${resolution.transaction.buyer_phone || 'the buyer'}. This cannot be undone.`
              : `${formatCurrency(resolution.transaction.amount)} will be paid out to ${resolution.transaction.farmer_phone || 'the farmer'}. This cannot be undone.`
            : ''
        }
        confirmLabel={
          submitting
            ? 'Updating…'
            : resolution?.outcome === 'refunded'
              ? 'Refund buyer'
              : 'Release funds'
        }
        onConfirm={confirmResolution}
        onCancel={() => {
          if (!submitting) setResolution(null);
        }}
      />
    </AppShell>
  );
}
