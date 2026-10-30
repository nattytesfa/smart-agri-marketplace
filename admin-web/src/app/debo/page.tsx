'use client';

import { useState } from 'react';
import AppShell, { ErrorPanel } from '../../components/AppShell';
import PageHeader from '../../components/PageHeader';
import { adminRequest, useAsyncData } from '../../hooks/useAdminData';
import { formatCurrency, formatDate, formatNumber } from '../../lib/format';

interface Contribution {
  listing_id: string; farmer_name: string; farmer_id: string; unit: string;
  proposed_quantity: number; confirmed_quantity: number; unit_price: number;
  confirmed_subtotal: number;
  participation_status: string; reservation_status: string; available_quantity: number;
  inventory_inconsistent: boolean;
}
interface Batch {
  batch_id: string; buyer_name: string; target_buyer_id: string; crop_type: string;
  status: string; unit: string; target_quantity: number; proposed_quantity: number;
  confirmed_quantity: number; reserved_quantity: number; remaining_quantity: number;
  completion_percentage: number; estimated_total: number; confirmed_total: number;
  created_at: string; expires_at: string; legacy: boolean; listings: Contribution[];
}
const load = () => adminRequest<Batch[]>('/api/admin/debo/batches');

export default function DeboPage() {
  const { data, error, initialLoading, reload } = useAsyncData<Batch[]>(load, []);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const batches = (data ?? []).filter(b => (status === 'all' || status === b.status) &&
    `${b.batch_id} ${b.crop_type} ${b.buyer_name} ${b.target_buyer_id} ${b.listings.map(l => `${l.farmer_name} ${l.farmer_id}`).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  return <AppShell title="Digital Debo" subtitle="Aggregation and reservation monitoring">
    <PageHeader eyebrow="Operations" eyebrowIcon="package" title="Digital Debo batches" description="Inspect farmer confirmations, reservation integrity and per-farmer pricing. Legacy batches need manual review." />
    <div className="toolbar">
      <input className="input" aria-label="Search batches" placeholder="Search batch, crop, buyer or farmer" value={search} onChange={e => setSearch(e.target.value)} />
      <select className="select" aria-label="Batch status" value={status} onChange={e => setStatus(e.target.value)}>
        {['all','pending','filled','fulfilled','cancelled','expired'].map(s => <option key={s}>{s}</option>)}
      </select>
      <button className="btn btn--ghost" onClick={reload}>Refresh</button>
    </div>
    {error ? <ErrorPanel message={error} onRetry={reload} /> : initialLoading ? <p>Loading batches…</p> : batches.length === 0 ? <p>No matching batches.</p> : batches.map(b => <details className="card" key={b.batch_id} style={{ padding: 16, marginBottom: 12 }}>
      <summary>{b.crop_type} — {b.status} — {formatNumber(b.reserved_quantity)} / {formatNumber(b.target_quantity)} {b.unit} reserved — {b.buyer_name || b.target_buyer_id}</summary>
      <p>Batch {b.batch_id} · Buyer {b.target_buyer_id}</p>
      <p>Created {formatDate(b.created_at)} · Expires {formatDate(b.expires_at)}</p>
      {b.legacy && <p role="alert">Legacy batch — no recorded farmer confirmation. Requires administrator review.</p>}
      <progress max="100" value={b.completion_percentage} aria-label="Committed quantity progress" />
      <p>Proposed {formatNumber(b.proposed_quantity)} · Confirmed {formatNumber(b.confirmed_quantity)} · Reserved {formatNumber(b.reserved_quantity)} · Remaining {formatNumber(b.remaining_quantity)} {b.unit}</p>
      <p>Estimated {formatCurrency(b.estimated_total)} · Confirmed {formatCurrency(b.confirmed_total)}</p>
      <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>Farmer / listing</th><th>Proposed / confirmed</th><th>Unit price / subtotal</th><th>Participation / reservation</th><th>Integrity</th></tr></thead><tbody>
        {b.listings.map(l => <tr key={l.listing_id}>
          <td>{l.farmer_name || l.farmer_id}<br />{l.listing_id}</td>
          <td>{formatNumber(l.proposed_quantity)} / {formatNumber(l.confirmed_quantity)} {l.unit}</td>
          <td>{formatCurrency(l.unit_price)} / {formatCurrency(l.confirmed_subtotal)}</td>
          <td>{l.participation_status} / {l.reservation_status}</td>
          <td>{l.inventory_inconsistent ? '⚠ Inventory exceeds total stock' : `Unreserved: ${formatNumber(l.available_quantity)} ${l.unit || ''}`}</td>
        </tr>)}
      </tbody></table></div>
    </details>)}
    <p>Latest 100 batches. Payment gateways are prototype stubs; a filled batch does not mean paid.</p>
  </AppShell>;
}
