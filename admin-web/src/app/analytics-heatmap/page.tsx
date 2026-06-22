'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import { supabase } from '../../lib/supabaseClient';
import { getBackendClient } from '../../lib/apiClient';
import L from 'leaflet';

// Fix Leaflet default icon (must be before map usage)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Dynamic imports for Leaflet components (client-side only)
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const GeoJSON = dynamic(
  () => import('react-leaflet').then((mod) => mod.GeoJSON),
  { ssr: false }
);

// Import CSS is now in globals.css, so we don't need it here

interface HeatmapData {
  geometry: string;
  listing_count: number;
  total_quantity: number;
  avg_price: number;
  crop_type: string;
}

export default function HeatmapPage() {
  const [data, setData] = useState<HeatmapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrop, setSelectedCrop] = useState('');
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      await fetchHeatmapData();
    };
    checkAuth();
  }, []);

  const fetchHeatmapData = async (crop?: string) => {
    setLoading(true);
    try {
      const api = await getBackendClient();
      const response = await api.get('/api/admin/heatmap', {
        params: { crop: crop || undefined },
      });
      setData(response.data);
    } catch (error) {
      console.error('Error fetching heatmap data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCropFilter = (crop: string) => {
    setSelectedCrop(crop);
    fetchHeatmapData(crop);
  };

  const getColor = (count: number) => {
    if (count > 20) return '#dc2626'; // red
    if (count > 10) return '#f59e0b'; // yellow
    if (count > 5) return '#10b981'; // green
    return '#6b7280'; // gray
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analytics Heatmap</h1>
            <p className="text-gray-600">Regional supply and demand visualization</p>
          </div>
          <div>
            <select
              value={selectedCrop}
              onChange={(e) => handleCropFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
            >
              <option value="">All Crops</option>
              <option value="teff">Teff</option>
              <option value="wheat">Wheat</option>
              <option value="maize">Maize</option>
              <option value="coffee">Coffee</option>
            </select>
          </div>
        </div>

        {data.length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-[600px]">
            <MapContainer
              center={[9.032, 38.742]}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {data.map((item, index) => {
                try {
                  const geometry = JSON.parse(item.geometry);
                  return (
                    <GeoJSON
                      key={index}
                      data={geometry}
                      style={{
                        color: getColor(item.listing_count),
                        weight: 2,
                        fillOpacity: 0.6,
                      }}
                    />
                  );
                } catch (e) {
                  return null;
                }
              })}
            </MapContainer>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <p className="text-gray-500">No data available for the heatmap.</p>
            <p className="text-sm text-gray-400">Create some listings to see data.</p>
          </div>
        )}
      </div>
    </div>
  );
}