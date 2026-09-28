'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import AppShell, { ErrorPanel } from '../../components/AppShell';
import PageHeader from '../../components/PageHeader';
import Icon from '../../components/Icon';
import EmptyState from '../../components/EmptyState';
import { adminRequest, useAsyncData } from '../../hooks/useAdminData';
import { formatCompactCurrency, formatNumber, titleCase } from '../../lib/format';

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), {
  ssr: false,
});
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), {
  ssr: false,
});
const GeoJSON = dynamic(() => import('react-leaflet').then((mod) => mod.GeoJSON), {
  ssr: false,
});

interface HeatmapData {
  geometry: string;
  listing_count: number;
  total_quantity: number;
  avg_price: number;
  crop_type: string;
}

const CROP_OPTIONS = ['', 'teff', 'wheat', 'maize', 'coffee', 'sorghum', 'barley', 'beans'];

/** Bucket colour thresholds — matches the legend rendered in the header. */
function getColor(count: number): string {
  if (count > 20) return '#dc2626';
  if (count > 10) return '#d97706';
  if (count > 5) return '#059669';
  return '#64748b';
}

const LEGEND = [
  { color: '#dc2626', label: 'High (20+)' },
  { color: '#d97706', label: 'Medium (11–20)' },
  { color: '#059669', label: 'Low (6–10)' },
  { color: '#64748b', label: 'Minimal (<6)' },
];

const loadHeatmap = (crop: string) =>
  adminRequest<HeatmapData[]>(
    `/api/admin/heatmap${crop ? `?crop=${encodeURIComponent(crop)}` : ''}`
  );

export default function HeatmapPage() {
  const [crop, setCrop] = useState('');

  const { data, error, loading, initialLoading, reload } = useAsyncData<HeatmapData[]>(
    () => loadHeatmap(crop),
    [crop]
  );

  const rows = useMemo(() => data ?? [], [data]);

  const summary = useMemo(() => {
    const totalListings = rows.reduce((sum, row) => sum + (Number(row.listing_count) || 0), 0);
    const totalQuantity = rows.reduce((sum, row) => sum + (Number(row.total_quantity) || 0), 0);
    const weightedPrice =
      totalQuantity > 0
        ? rows.reduce(
            (sum, row) => sum + (Number(row.avg_price) || 0) * (Number(row.total_quantity) || 0),
            0
          ) / totalQuantity
        : 0;

    return { totalListings, totalQuantity, weightedPrice, regions: rows.length };
  }, [rows]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (Number(b.total_quantity) || 0) - (Number(a.total_quantity) || 0)),
    [rows]
  );

  return (
    <AppShell
      title="Commodity Heatmap"
      subtitle="Regional supply concentration for available listings"
      topbarActions={
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={reload}
          aria-label="Refresh heatmap data"
          title="Refresh"
          disabled={loading}
        >
          <Icon name="refresh" size={18} />
        </button>
      }
    >
      <PageHeader
        eyebrow="Insights"
        eyebrowIcon="trending-up"
        title="Regional supply heatmap"
        description="Each area is an aggregate of available listings for the selected crop, coloured by listing density. Larger clusters mean more supply competing in that region."
        actions={
          <div className="field" style={{ minWidth: '11rem' }}>
            <label className="u-visually-hidden" htmlFor="crop-filter">
              Filter by crop
            </label>
            <select
              id="crop-filter"
              className="select"
              value={crop}
              onChange={(event) => setCrop(event.target.value)}
            >
              {CROP_OPTIONS.map((option) => (
                <option key={option || 'all'} value={option}>
                  {option ? titleCase(option) : 'All crops'}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {error ? (
        <ErrorPanel message={error} onRetry={reload} />
      ) : (
        <div className="stack">
          <div className="grid grid--stats stagger">
            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Areas mapped</span>
                <span className="stat__icon stat__icon--brand">
                  <Icon name="map" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatNumber(summary.regions)
                )}
              </p>
              <p className="stat__meta">Clustered supply areas</p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Listings counted</span>
                <span className="stat__icon stat__icon--blue">
                  <Icon name="package" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatNumber(summary.totalListings)
                )}
              </p>
              <p className="stat__meta">Available listings only</p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Total quantity</span>
                <span className="stat__icon stat__icon--amber">
                  <Icon name="layers" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatNumber(summary.totalQuantity)
                )}
              </p>
              <p className="stat__meta">Units on offer</p>
            </div>

            <div className="stat">
              <div className="stat__top">
                <span className="stat__label">Weighted avg price</span>
                <span className="stat__icon stat__icon--violet">
                  <Icon name="percent" size={18} />
                </span>
              </div>
              <p className="stat__value">
                {initialLoading ? (
                  <span className="skeleton skeleton--title" />
                ) : (
                  formatCompactCurrency(summary.weightedPrice)
                )}
              </p>
              <p className="stat__meta">Per unit across all areas</p>
            </div>
          </div>

          <div className="card card--flush">
            <div className="card__header">
              <div className="card__titles">
                <h2 className="card__title">Supply concentration</h2>
                <p className="card__subtitle">
                  {crop ? `${titleCase(crop)} listings` : 'All available listings'}
                </p>
              </div>
              <div className="card__actions">
                <div className="legend">
                  {LEGEND.map((entry) => (
                    <span key={entry.label} className="legend__item">
                      <span
                        className="legend__swatch"
                        style={{ backgroundColor: entry.color }}
                        aria-hidden="true"
                      />
                      {entry.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {initialLoading ? (
              <div style={{ padding: 'var(--space-6)' }}>
                <div className="skeleton skeleton--block" style={{ height: '30rem' }} />
              </div>
            ) : rows.length > 0 ? (
              <>
                <div className={`heatmap${loading ? ' is-loading' : ''}`}>
                  <MapContainer
                    center={[9.032, 38.742]}
                    zoom={6}
                    scrollWheelZoom
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {rows.map((row, index) => {
                      let geometry;
                      try {
                        geometry = JSON.parse(row.geometry);
                      } catch {
                        return null;
                      }
                      return (
                        <GeoJSON
                          key={`${row.crop_type}-${index}`}
                          data={geometry}
                          style={{
                            color: getColor(Number(row.listing_count) || 0),
                            weight: 2,
                            fillOpacity: 0.45,
                          }}
                        />
                      );
                    })}
                  </MapContainer>
                </div>

                <div className="table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
                  <table className="table table--compact">
                    <thead>
                      <tr>
                        <th scope="col">Crop</th>
                        <th scope="col">Listings</th>
                        <th scope="col">Total quantity</th>
                        <th scope="col">Avg unit price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row, index) => (
                        <tr key={`${row.crop_type}-${index}`}>
                          <td className="table__cell--strong">
                            <span className="identity">
                              <span
                                className="legend__swatch"
                                style={{ backgroundColor: getColor(Number(row.listing_count) || 0) }}
                                aria-hidden="true"
                              />
                              {titleCase(row.crop_type)}
                            </span>
                          </td>
                          <td>{formatNumber(row.listing_count)}</td>
                          <td>{formatNumber(row.total_quantity)}</td>
                          <td>{formatCompactCurrency(row.avg_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <EmptyState
                icon="map"
                title="No supply data to map"
                message="The aggregation returned no available listings with a known location. Publish listings with GPS coordinates, or pick a different crop."
              />
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
