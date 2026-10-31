'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell, { ErrorPanel } from '../../components/AppShell';
import PageHeader from '../../components/PageHeader';
import DataTable, { type Column } from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import Pagination from '../../components/Pagination';
import Icon from '../../components/Icon';
import { adminRequest, useAsyncData } from '../../hooks/useAdminData';
import SimulationDetails from './SimulationDetails';
import {
  escrowTone,
  formatCurrency,
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
  payment_status: string;
  payment_mode: string;
  checkout_status: string;
  checkout_expires_at: string | null;
  reconciliation_reason: string | null;
  delivery_statuses?: string[];
  has_dispute?: boolean;
}

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  'all',
  'locked',
  'pending',
  'disputed',
  'released',
  'refunded',
  'reconciliation_required',
  'expired',
  'cancelled',
  'simulated_paid',
  'fulfilling',
  'partially_completed',
  'awaiting_fulfillment',
  'ready',
  'delivered',
];

interface TransactionData {
  transactions: EscrowTransaction[];
  summary: {all: string; locked: string; disputed: number};
}
const loadTransactions = async (): Promise<TransactionData> => {
  const [transactions, summary] = await Promise.all([
    adminRequest<EscrowTransaction[]>('/api/admin/transactions'),
    adminRequest<TransactionData['summary']>('/api/admin/transactions/summary'),
  ]);
  return {transactions, summary};
};

export default function TransactionsPage() {
  const { data, error, loading, initialLoading, reload } = useAsyncData<TransactionData>(
    loadTransactions,
    []
  );

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const investigationRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    investigationRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    investigationRef.current?.focus({ preventScroll: true });
  }, [selectedId]);
  const closeInvestigation = () => {
    setSelectedId(null);
    requestAnimationFrame(() => { if (openerRef.current?.isConnected) openerRef.current.focus(); });
  };

  const transactions = useMemo(() => data?.transactions ?? [], [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const matchesStatus = status === 'all' || transaction.escrow_status === status || transaction.checkout_status === status || transaction.payment_status === status || transaction.delivery_statuses?.includes(status) || (status === 'disputed' && transaction.has_dispute);
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

  const totals = data?.summary ?? {all: '0.00', locked: '0.00', disputed: 0};

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
      key: 'checkout_status',
      header: 'Checkout / payment',
      render: (transaction) => <span title={transaction.reconciliation_reason || undefined}>
        {transaction.checkout_status} / {transaction.payment_status}<br />
        {transaction.payment_mode} · {transaction.checkout_expires_at ? formatDateTime(transaction.checkout_expires_at) : 'Manual review'}
        {transaction.reconciliation_reason && <><br />{transaction.reconciliation_reason}</>}
      </span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'table__cell--actions',
      render: (transaction) => {
        return <button className="btn btn--ghost btn--sm" onClick={event => {
          openerRef.current = event.currentTarget;
          setSelectedId(transaction.transaction_id);
          if (selectedId === transaction.transaction_id) {
            investigationRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
            investigationRef.current?.focus({ preventScroll: true });
          }
        }}><Icon name="shield-check" size={15} />{transaction.has_dispute ? 'Review dispute' : 'Investigate allocations'}</button>;
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
        description="Prototype checkout and inventory-ledger monitoring. Pending checkouts are not funded escrow. No real payout or provider refund is performed by these actions."
      />
      {selectedId && <div ref={investigationRef} tabIndex={-1} aria-label="Transaction dispute investigation" style={{ scrollMarginTop: 90 }}><SimulationDetails key={selectedId} id={selectedId} onClose={closeInvestigation} onChanged={reload} /></div>}

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
                <strong>{formatCurrency(totals.all, 0)}</strong> recorded checkout value
              </p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Verified open ledger</span>
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
              <p className="stat__meta">Excludes unverified pending checkouts; not proof of real funds</p>
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

    </AppShell>
  );
}
