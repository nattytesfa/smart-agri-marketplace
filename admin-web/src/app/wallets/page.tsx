'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import AppShell, { ErrorPanel } from '../../components/AppShell';
import PageHeader from '../../components/PageHeader';
import DataTable, { type Column } from '../../components/DataTable';
import Icon, { type IconName } from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import { adminRequest, useAsyncData } from '../../hooks/useAdminData';
import { formatDateTime, initials, titleCase } from '../../lib/format';
import styles from './wallets.module.css';

interface Wallet { wallet_id: string; owner_id: string; full_name: string; wallet_type: string; available: string }
interface Entry { event_id: string; event_type: string; amount: string; created_at: string; transaction_id: string | null; escrow_event_id: string | null }
interface Audit { items: Wallet[]; has_more: boolean; mismatches: { transaction_id: string; issue: string }[]; conservation: { sources: string; wallets: string; escrow: string; balanced: boolean } }
interface History { items: Entry[]; has_more: boolean }
interface Summary { available: string; held: string; pending: string; disputed: string; refunds: string; settlements: string }

// Keep exact API decimals intact; formatting never converts money to Number.
const amount = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const eventLabels: Record<string, string> = { demo_top_up: 'Demo top-up', checkout_debit: 'Marketplace purchase', farmer_settlement: 'Farmer settlement', buyer_refund: 'Buyer refund' };

function Metric({ label, value, icon, caption }: { label: string; value?: string; icon: IconName; caption: string }) {
  return <div className={styles.metric}>
    <span className={styles.metricIcon}><Icon name={icon} size={20} /></span>
    <p className={styles.label}>{label}</p>
    {value !== undefined ? <p className={styles.value}><span>ETB</span> {amount(value)}</p> : <span className="skeleton skeleton--text" style={{ height: 32, width: '75%' }} />}
    <p className={styles.caption}>{caption}</p>
  </div>;
}

function Pager({ offset, more, loading, noun, onChange }: { offset: number; more?: boolean; loading: boolean; noun: string; onChange: (offset: number) => void }) {
  return <div className={styles.pagination}>
    <span>{noun} · Page {Math.floor(offset / 25) + 1}</span>
    <div><button className="btn btn--secondary btn--sm" disabled={loading || offset === 0} onClick={() => onChange(offset - 25)} aria-label={`Previous ${noun}`}><Icon name="chevron-left" size={15} /> Previous</button>
      <button className="btn btn--secondary btn--sm" disabled={loading || !more} onClick={() => onChange(offset + 25)} aria-label={`Next ${noun}`}>Next <Icon name="chevron-right" size={15} /></button></div>
  </div>;
}

export default function WalletsPage() {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Wallet | null>(null);
  const [historyOffset, setHistoryOffset] = useState(0);
  const activityRef = useRef<HTMLElement>(null);
  const owner = selected?.owner_id;
  const { data, error, loading, reload } = useAsyncData<Audit>(() => adminRequest(`/api/wallet/admin?offset=${offset}&limit=25`), [offset]);
  const history = useAsyncData<History>(() => owner ? adminRequest(`/api/wallet/admin/${owner}/history?offset=${historyOffset}&limit=25`) : Promise.resolve({ items: [], has_more: false }), [owner, historyOffset]);
  const summary = useAsyncData<Summary | null>(() => owner ? adminRequest(`/api/wallet/admin/${owner}`) : Promise.resolve(null), [owner]);
  const healthy = data?.conservation.balanced && data.mismatches.length === 0;
  const refresh = () => { void reload(); void history.reload(); void summary.reload(); };
  const selectWallet = (wallet: Wallet) => {
    if (selected?.owner_id !== wallet.owner_id) {
      history.setData(null);
      summary.setData(null);
    }
    setSelected(wallet);
    setHistoryOffset(0);
    requestAnimationFrame(() => { activityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); activityRef.current?.focus({ preventScroll: true }); });
  };
  const columns: Column<Wallet>[] = [
    { key: 'full_name', header: 'Wallet owner', render: w => <div className={styles.owner}><span className={styles.avatar}>{initials(w.full_name)}</span><div><strong>{w.full_name}</strong><span className={styles.reference} title={w.owner_id}>{w.owner_id.slice(0, 8)}…</span></div></div> },
    { key: 'wallet_type', header: 'Account type', render: w => <StatusBadge status={w.wallet_type} label={titleCase(w.wallet_type)} tone={w.wallet_type === 'farmer' ? 'success' : 'info'} /> },
    { key: 'available', header: 'Available virtual ETB', align: 'right', render: w => <span className={styles.tableAmount}>{amount(w.available)}</span> },
    { key: 'audit', header: 'Investigation', align: 'right', render: w => <button className={`btn btn--sm ${selected?.owner_id === w.owner_id ? 'btn--success-soft' : 'btn--ghost'}`} onClick={() => selectWallet(w)} aria-label={`View activity for ${w.full_name}`}>View activity <Icon name="arrow-up-right" size={15} /></button> },
  ];
  const entryColumns: Column<Entry>[] = [
    { key: 'event_type', header: 'Activity', render: e => <div className={styles.event}><span className={`${styles.eventIcon} ${e.amount.startsWith('-') ? styles.debit : ''}`}><Icon name={e.amount.startsWith('-') ? 'arrow-up-right' : 'arrow-down-right'} size={17} /></span><div><strong>{eventLabels[e.event_type] ?? titleCase(e.event_type)}</strong><span className={styles.reference} title={e.event_id}>{e.event_id.slice(0, 12)}…</span></div></div> },
    { key: 'amount', header: 'Virtual ETB', align: 'right', render: e => <span className={`${styles.tableAmount} ${!e.amount.startsWith('-') ? styles.credit : ''}`}>{amount(e.amount)}</span> },
    { key: 'created_at', header: 'Date & time', render: e => <span className={styles.date}>{formatDateTime(e.created_at)}</span> },
    { key: 'status', header: 'Status', render: () => <StatusBadge status="Completed" tone="success" /> },
    { key: 'transaction_id', header: 'Order reference', render: e => e.transaction_id ? <div><Link className={styles.orderLink} href="/transactions" title={e.transaction_id}>{e.transaction_id.slice(0, 12)}… <Icon name="external-link" size={12} /></Link>{e.escrow_event_id && <span className={styles.reference} title={e.escrow_event_id}>Escrow · {e.escrow_event_id.slice(0, 8)}…</span>}</div> : <span className={styles.caption}>Demo funding</span> },
  ];

  return <AppShell title="Demo Wallet Audit">
    <PageHeader eyebrow="Financial oversight" eyebrowIcon="shield-check" title="Wallets & escrow" description="Follow virtual funds from buyer funding to farmer settlement. Every movement, accounted for." actions={<button className="btn btn--secondary" onClick={refresh} disabled={loading || (owner !== undefined && history.loading)}><Icon name="refresh" size={16} /> Refresh data</button>} />
    <div className={styles.notice}><Icon name="info" size={19} /><div><strong>Demo environment · Virtual ETB only</strong><p>No real deposits, withdrawals or payouts. Read-only financial investigation; balances cannot be edited here.</p></div><span className={styles.readOnly}><Icon name="lock" size={12} /> Read only</span></div>
    {error && <ErrorPanel message={error} onRetry={reload} />}

    <section className={styles.reconciliation} aria-labelledby="reconciliation-title" aria-busy={loading}>
      <div className={styles.sectionHeader}><div><h2 id="reconciliation-title">Funds reconciliation</h2><p>All virtual sources must equal available balances plus held escrow.</p></div>{data && <StatusBadge status={healthy ? 'Reconciled' : 'Review required'} tone={healthy ? 'success' : 'danger'} size="md" />}</div>
      <div className={styles.metrics}>
        <Metric label="Total virtual sources" value={data?.conservation.sources} icon="database" caption="Demo top-ups + simulated provider funding" />
        <Metric label="Available in wallets" value={data?.conservation.wallets} icon="wallet" caption="Spendable buyer funds + released farmer earnings" />
        <Metric label="Held in escrow" value={data?.conservation.escrow} icon="lock" caption="Committed funds awaiting settlement or refund" />
      </div>
      {data && <div className={`${styles.reconciliationFooter} ${!healthy ? styles.attention : ''}`} role="status"><Icon name={healthy ? 'check-circle' : 'alert-triangle'} size={17} />{healthy ? 'All virtual funds are accounted for. No funding or missing-credit mismatches found.' : 'Financial records need investigation. Review the flagged transactions below.'}</div>}
      {!!data?.mismatches.length && <ul className={styles.issues}>{data.mismatches.map((m, i) => <li key={`${m.transaction_id}-${i}`}><span>{titleCase(m.issue)}</span><code>{m.transaction_id}</code></li>)}</ul>}
    </section>

    <section className={styles.panel} aria-labelledby="wallet-directory-title">
      <div className={styles.sectionHeader}><div><h2 id="wallet-directory-title">Buyer & farmer wallets</h2><p>Open an account to inspect its balances and immutable activity.</p></div><span className={styles.sectionIcon}><Icon name="users" size={20} /></span></div>
      <DataTable columns={columns} data={data?.items ?? []} keyExtractor={w => w.wallet_id} loading={loading} skeletonRows={5} emptyTitle="No wallets yet" emptyMessage="Buyer and farmer wallets will appear here when accounts are initialized." emptyIcon="wallet" caption="Buyer and farmer demo wallet accounts" />
      <Pager offset={offset} more={data?.has_more} loading={loading} noun="Wallets" onChange={setOffset} />
    </section>

    {selected && <section className={`${styles.panel} ${styles.activity}`} ref={activityRef} tabIndex={-1} aria-labelledby="wallet-activity-title">
      <div className={styles.sectionHeader}><div className={styles.owner}><span className={`${styles.avatar} ${styles.largeAvatar}`}>{initials(selected.full_name)}</span><div><p className={styles.eyebrow}>{titleCase(selected.wallet_type)} wallet</p><h2 id="wallet-activity-title">{selected.full_name}</h2><p className={styles.fullReference}>{owner}</p></div></div><button className="btn btn--ghost btn--icon" onClick={() => setSelected(null)} aria-label="Close wallet activity"><Icon name="x" size={18} /></button></div>
      {summary.error && <ErrorPanel message={summary.error} onRetry={summary.reload} />}
      <div className={styles.accountMetrics}>
        <Metric label="Available balance" value={!summary.loading ? summary.data?.available : undefined} icon="wallet" caption="Available virtual funds only" />
        <Metric label="Pending escrow" value={!summary.loading ? summary.data?.pending : undefined} icon="clock" caption="Undisputed funds still held" />
        <Metric label="Disputed escrow" value={!summary.loading ? summary.data?.disputed : undefined} icon="shield-check" caption="Unavailable until resolution" />
      </div>
      {summary.data && !summary.loading && <div className={styles.accountTotals}><span>Held total <strong>ETB {amount(summary.data.held)}</strong></span><span>Refunds received <strong>ETB {amount(summary.data.refunds)}</strong></span><span>Settlements received <strong>ETB {amount(summary.data.settlements)}</strong></span></div>}
      <div className={styles.activityHeading}><h3>Wallet activity</h3><span><Icon name="lock" size={13} /> Immutable ledger</span></div>
      {history.error && <ErrorPanel message={history.error} onRetry={history.reload} />}
      <DataTable columns={entryColumns} data={history.data?.items ?? []} keyExtractor={e => e.event_id} loading={history.loading} skeletonRows={4} emptyTitle="No wallet activity yet" emptyMessage="Top-ups, purchases, settlements and refunds will be recorded here." emptyIcon="inbox" caption={`Financial activity for ${selected.full_name}`} />
      <Pager offset={historyOffset} more={history.data?.has_more} loading={history.loading} noun="Activity" onChange={setHistoryOffset} />
    </section>}
  </AppShell>;
}
