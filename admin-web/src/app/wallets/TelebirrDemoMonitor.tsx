'use client';
import { useState } from 'react';
import { adminRequest, useAsyncData } from '../../hooks/useAdminData';
import { ErrorPanel } from '../../components/AppShell';
import styles from './wallets.module.css';

interface Payment { payment_id: string; buyer: string; amount: string; status: string; reference: string; ledger_reference: string | null; created_at: string; authorized_at: string | null; expires_at: string; environment: string }
export default function TelebirrDemoMonitor() {
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useAsyncData<{ items: Payment[]; has_more: boolean }>(() => adminRequest(`/api/wallet/telebirr-demo/admin?offset=${offset}&limit=25&status=${status}`), [offset, status]);
  return <section className={styles.panel}>
    <h2>Telebirr simulated payments — Read only</h2>
    <p>Demo only. Virtual ETB, not official Telebirr transactions. Credited amounts are already included once in the Demo Wallet ledger.</p>
    <label>Status <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}><option value="">All</option>{['PENDING_AUTHORIZATION', 'CREDITED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'FAILED'].map(s => <option key={s}>{s}</option>)}</select></label>
    <button className="btn btn--secondary" onClick={reload} disabled={loading}>Refresh</button>
    {error && <ErrorPanel message={error} onRetry={reload} />}
    <div style={{ overflowX: 'auto' }}><table><thead><tr>{['Buyer', 'Virtual ETB', 'Status', 'Demo reference', 'Ledger credit', 'Created', 'Authorized', 'Expires', 'Environment'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
      {data?.items.map(p => <tr key={p.payment_id}>{[p.buyer, p.amount, p.status, p.reference, p.ledger_reference ?? 'None', p.created_at, p.authorized_at ?? 'None', p.expires_at, p.environment].map((v, i) => <td key={i}>{v}</td>)}</tr>)}
    </tbody></table></div>
    <button disabled={loading || offset === 0} onClick={() => setOffset(offset - 25)}>Previous</button>
    <button disabled={loading || !data?.has_more} onClick={() => setOffset(offset + 25)}>Next</button>
  </section>;
}
