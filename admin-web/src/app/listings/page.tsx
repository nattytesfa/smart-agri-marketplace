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
  formatCurrency,
  formatDate,
  formatNumber,
  listingTone,
  orDash,
  titleCase,
} from '../../lib/format';

interface Listing {
  listing_id: string;
  crop_type: string;
  variety: string | null;
  quantity: number;
  price_per_unit: number;
  status: string;
  created_at: string;
  farmer_phone: string;
  social_trust_score: number | null;
  unit: string;
  farmer_name: string | null;
  kebele: string | null;
  lat: number | null;
  lng: number | null;
  image_url: string | null;
  harvest_date: string | null;
  quality_grade: string | null;
  description: string | null;
}

const PAGE_SIZE = 10;

const STATUS_OPTIONS = ['all', 'available', 'sold', 'reserved'];

const loadListings = () => adminRequest<Listing[]>('/api/admin/listings');

export default function ListingsPage() {
  const { notify } = useToast();
  const { data, error, loading, initialLoading, reload } = useAsyncData<Listing[]>(
    loadListings,
    []
  );

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [grade, setGrade] = useState('all');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Listing | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Listing | null>(null);

  const listings = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return listings.filter((listing) => {
      const matchesStatus = status === 'all' || listing.status === status;
      if (!matchesStatus) return false;
      if (grade !== 'all' && listing.quality_grade !== grade) return false;
      if (!query) return true;

      return (
        (listing.crop_type ?? '').toLowerCase().includes(query) ||
        (listing.variety ?? '').toLowerCase().includes(query) ||
        (listing.kebele ?? '').toLowerCase().includes(query) ||
        (listing.farmer_name ?? '').toLowerCase().includes(query) ||
        (listing.farmer_phone ?? '').toLowerCase().includes(query)
      );
    });
  }, [listings, search, status, grade]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const totalValue = useMemo(
    () => listings.reduce((sum, listing) => sum + (Number(listing.price_per_unit) * Number(listing.quantity) || 0), 0),
    [listings]
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setSubmitting(true);

    try {
      await adminRequest(`/api/admin/listings/${pendingDelete.listing_id}`, {
        method: 'DELETE',
      });

      notify({
        tone: 'success',
        title: 'Listing removed',
        message: `${titleCase(pendingDelete.crop_type)} was deleted from the marketplace.`,
      });

      setPendingDelete(null);
      await reload();
    } catch (err: any) {
      notify({
        tone: 'danger',
        title: 'Could not remove listing',
        message: err?.response?.data?.error || 'The backend rejected the request.',
      });
      setPendingDelete(null);
    } finally {
      setSubmitting(false);
    }
  }, [pendingDelete, notify, reload]);

  const columns: Column<Listing>[] = [
    {
      key: 'crop_type',
      header: 'Produce',
      render: (listing) => (
        <div className="identity">
          <span className="avatar avatar--sm avatar--slate">
            <Icon name="sprout" size={14} />
          </span>
          <span className="identity__text">
            <span className="identity__name">{titleCase(listing.crop_type)}</span>
            <span className="identity__meta">{orDash(listing.variety)}</span>
          </span>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantity',
      align: 'right',
      render: (listing) => <span className="table__cell--strong">{formatNumber(listing.quantity)} {listing.unit}</span>,
    },
    {
      key: 'price_per_unit',
      header: 'Unit price',
      align: 'right',
      render: (listing) => `${formatCurrency(listing.price_per_unit)} / ${listing.unit}`,
    },
    {
      key: 'farmer_phone',
      header: 'Farmer',
      render: (listing) => (
        <span className="table__cell--muted">{listing.farmer_phone || '—'}</span>
      ),
    },
    {
      key: 'social_trust_score',
      header: 'Trust',
      align: 'right',
      render: (listing) =>
        listing.social_trust_score === null || listing.social_trust_score === undefined ? (
          <span className="table__cell--muted">—</span>
        ) : (
          <span className="chip-mono">{formatNumber(listing.social_trust_score)}</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (listing) => (
        <StatusBadge status={listing.status} tone={listingTone(listing.status)} />
      ),
    },
    {
      key: 'created_at',
      header: 'Listed',
      render: (listing) => (
        <span className="table__cell--muted">{formatDate(listing.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'table__cell--actions',
      render: (listing) => (
        <span className="table__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelected(listing)}>Details</button>
          <button
            type="button"
            className="btn btn--danger-soft btn--icon btn--sm"
            onClick={() => setPendingDelete(listing)}
            aria-label={`Remove ${listing.crop_type} listing`}
            title="Remove listing"
          >
            <Icon name="x" size={15} />
          </button>
        </span>
      ),
    },
  ];

  return (
    <AppShell
      title="Listings"
      subtitle="Moderate produce listings across the marketplace"
      topbarActions={
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={reload}
          aria-label="Refresh listings"
          title="Refresh"
        >
          <Icon name="refresh" size={18} />
        </button>
      }
    >
      <PageHeader
        eyebrow="Operations"
        eyebrowIcon="package"
        title="Listings moderation"
        description="Review farmer listings. Moderation hides removed listings while retaining transaction history."
      />

      {error ? (
        <ErrorPanel message={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid--stats stagger" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Total listings</span>
                <span className="stat__icon stat__icon--brand">
                  <Icon name="package" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? <span className="skeleton skeleton--title" /> : formatNumber(listings.length)}
              </p>
              <p className="stat__meta">Across all farmers</p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Available now</span>
                <span className="stat__icon stat__icon--blue">
                  <Icon name="check-circle" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatNumber(listings.filter((listing) => listing.status === 'available').length)
                )}
              </p>
              <p className="stat__meta">Open to buyers</p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Aggregate value</span>
                <span className="stat__icon stat__icon--amber">
                  <Icon name="wallet" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatCurrency(totalValue, 0)
                )}
              </p>
              <p className="stat__meta">
                <strong>Quantity × unit price</strong>
              </p>
            </div>
          </div>

          <div className="card card--flush">
            <div className="toolbar">
              <div className="toolbar__search">
                <Icon name="search" size={16} className="toolbar__search-icon" />
                <input
                  type="search"
                  className="input"
                  placeholder="Search crop, variety or farmer number…"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Search listings"
                />
              </div>

              <div className="toolbar__filters">
                <label className="u-visually-hidden" htmlFor="status-filter">
                  Filter by status
                </label>
                <select
                  id="status-filter"
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
                <select className="select" aria-label="Filter farmer-reported grade" value={grade}
                  onChange={(event) => { setGrade(event.target.value); setPage(1); }}>
                  <option value="all">All grades</option>
                  <option value="A">Grade A</option><option value="B">Grade B</option>
                  <option value="C">Grade C</option><option value="not_graded">Not Graded</option>
                </select>
              </div>

              <span className="toolbar__count">
                Showing {filtered.length} of {formatNumber(listings.length)} listings
              </span>
            </div>

            <DataTable
              columns={columns}
              data={visible}
              keyExtractor={(listing) => String(listing.listing_id)}
              loading={initialLoading}
              emptyIcon="package"
              emptyTitle="No listings found"
              emptyMessage={
                listings.length === 0
                  ? 'No farmer has published a listing yet.'
                  : 'No listing matches the current search and status filter.'
              }
              caption="Produce listings for moderation"
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

      {selected && (
        <div className="dialog" role="presentation">
        <div className="dialog__overlay" onClick={() => setSelected(null)} aria-hidden="true" />
        <div role="dialog" aria-modal="true" aria-label="Listing details" className="dialog__panel"
          style={{ maxHeight: '85vh', overflowY: 'auto' }} onKeyDown={(event) => { if (event.key === 'Escape') setSelected(null); }}>
          <h2>{selected.crop_type} — {selected.variety || '—'}</h2>
          {selected.image_url ? (
            // Produce photographs are served by configured Supabase Storage.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.image_url} alt={selected.crop_type} style={{ maxWidth: '100%', maxHeight: 240 }} />
          ) : <p>🌾 {selected.crop_type} — No photo provided</p>}
          <p>{formatNumber(selected.quantity)} {selected.unit} · {formatCurrency(selected.price_per_unit)} per {selected.unit}</p>
          <p>Farmer: {selected.farmer_name || '—'} · {selected.farmer_phone || '—'}</p>
          <p>Location: {selected.kebele || 'GPS'} {selected.lat != null && selected.lng != null ? `(${selected.lat}, ${selected.lng})` : '(no precise coordinates)'}</p>
          <p>Status: {selected.status} · Created: {formatDate(selected.created_at)}</p>
          <p>Harvest date: {selected.harvest_date ? formatDate(selected.harvest_date) : 'Not provided'}</p>
          <p>Farmer-reported grade: {selected.quality_grade || 'Not provided'} (not independently verified)</p>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selected.description || 'No description provided'}</p>
          <button autoFocus type="button" className="btn btn--ghost" onClick={() => setSelected(null)}>Close details</button>
        </div>
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        variant="danger"
        busy={submitting}
        title="Remove this listing?"
        message={
          pendingDelete
            ? `Hide the ${titleCase(pendingDelete.crop_type)} listing from ${pendingDelete.farmer_phone || 'this farmer'}? Transaction history will be retained.`
            : ''
        }
        confirmLabel={submitting ? 'Removing…' : 'Remove listing'}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!submitting) setPendingDelete(null);
        }}
      />
    </AppShell>
  );
}
