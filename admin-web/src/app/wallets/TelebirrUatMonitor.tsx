'use client';

import { useState } from 'react';
import DataTable, { type Column } from '../../components/DataTable';
import { ErrorPanel } from '../../components/AppShell';
import { adminRequest, useAsyncData } from '../../hooks/useAdminData';
import { formatDateTime, titleCase } from '../../lib/format';
import styles from './wallets.module.css';

interface Attempt {
  funding_id: string; buyer_id: string; amount: string; provider_environment: string;
  status: string; provider_reference: string | null; created_at: string; verified_at: string | null;
  reconciliation_reason: string | null; verification_attempts: number; demo_credit_event: null;
}
interface History { items: Attempt[]; has_more: boolean }

export default function TelebirrUatMonitor() {
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useAsyncData<History>(
    () => adminRequest(`/api/wallet/telebirr-uat/admin?offset=${offset}&limit=25`), [offset]);
  const columns: Column<Attempt>[] = [
    { key: 'funding_id', header: 'Funding / buyer', render: a => <div><code>{a.funding_id}</code><span className={styles.reference}>{a.buyer_id}</span></div> },
    { key: 'amount', header: 'ETB (not spendable)', render: a => a.amount },
    { key: 'provider_environment', header: 'Environment', render: a => a.provider_environment.toUpperCase() },
    { key: 'status', header: 'Provider verification', render: a => <div>{titleCase(a.status)}<span className={styles.reference}>{a.provider_reference ?? 'No preorder reference'}</span></div> },
    { key: 'created_at', header: 'Created / verified', render: a => <div>{formatDateTime(a.created_at)}<span className={styles.reference}>{a.verified_at ? formatDateTime(a.verified_at) : 'Not verified'}</span></div> },
    { key: 'reconciliation_reason', header: 'Reconciliation', render: a => <div>{a.reconciliation_reason ?? 'Pending'}<span className={styles.reference}>Checks: {a.verification_attempts} / 8 · Demo credit: none</span></div> },
  ];
  return <section className={styles.panel} aria-label="Telebirr UAT monitoring">
    <div className={styles.sectionHeader}><div><h2>Telebirr UAT funding</h2><p>Read-only sandbox attempts. Excluded from Demo Wallet balances and escrow conservation. No manual success override.</p></div>
      <button className="btn btn--secondary btn--sm" onClick={reload} disabled={loading}>Refresh UAT</button></div>
    {error && <ErrorPanel message={error} onRetry={reload} />}
    <DataTable columns={columns} data={data?.items ?? []} keyExtractor={a => a.funding_id}
      loading={loading} emptyTitle="No Telebirr UAT attempts" emptyMessage="Apply migration 012 and configure merchant-specific UAT access to create preorders." caption="Separate Telebirr sandbox records" />
    <div className={styles.pagination}><span>Page {Math.floor(offset / 25) + 1}</span><div>
      <button className="btn btn--secondary btn--sm" disabled={loading || offset === 0} onClick={() => setOffset(offset - 25)}>Previous</button>
      <button className="btn btn--secondary btn--sm" disabled={loading || !data?.has_more} onClick={() => setOffset(offset + 25)}>Next</button>
    </div></div>
  </section>;
}
